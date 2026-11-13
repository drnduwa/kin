
"use server";

import { getTrafficTips } from "@/ai/flows/traffic-tips-flow";
import { askAssistant } from "@/ai/flows/assistant-flow";
import { generateSpeech } from "@/ai/flows/tts-flow";
import { getStrategicInsights } from "@/ai/flows/strategic-insights-flow";
import { TrafficTipsInput, AssistantInput, PushSubscription, StrategicInsightsInput, StrategicInsightsOutput, RoadConditionReport, PaymentRecord, UserProfile } from "@/lib/types";
import * as webpush from 'web-push';
import * as nodemailer from 'nodemailer';
import { getServerFirestore } from "@/firebase/server";
import { collection, getDocs, query, where, Timestamp, limit, orderBy, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp, addDoc } from "firebase/firestore";
import { CONFIG } from "@/lib/config";
import { kinshasaNow, voteSlot } from "@/lib/kinshasa-time";
import { adminDb, verifyCaller, verifyAdmin, AuthError } from "@/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { STAR_PACK_CATALOG, PASS_CATALOG, DATA_PACK_CATALOG, REWARD_CDF, DAILY_REWARD_CAP_CDF, MIN_CASHOUT_CDF, CDF_PER_USD } from "@/lib/pricing";
import { fulfillVerifiedFlexPayPayment, markPaymentFailed } from "@/lib/payments-server";
import { loadRecentProbeSpeeds, statusFromSpeed } from "@/lib/probes-server";
import { BLACK_SPOTS, MEASURED_SEGMENTS, segMid } from "@/lib/corridors";
import { XP, DAILY_MISSIONS, BADGES, COMMUNES, levelFromXp, rankFor, kinshasaDayKey, kinshasaWeekId, type MissionKind } from "@/lib/game";

/** Identifiants SMTP lus dans l'environnement uniquement (les mots de passe ne doivent plus être dans le code). */
function smtpCredentials() {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = (process.env.SMTP_PASS || '').replace(/"/g, '');
    if (!smtpUser || !smtpPass) throw new Error("SMTP_USER / SMTP_PASS non configurés sur le serveur.");
    return { smtpUser, smtpPass };
}

function authErrorMessage(err: any, fallback: string) {
    return err instanceof AuthError ? err.message : (err?.message || fallback);
}
import { initiateFlexPayMobileMoney, initiateFlexPayCard, checkFlexPayTransactionStatus, detectDRCOperator } from "@/lib/flexpay";

const GOOGLE_API_KEY = process.env.GOOGLE_ROUTES_API_KEY || CONFIG.GOOGLE_MAPS_API_KEY;

/**
 * Cache simple pour éviter les appels API redondants (90 secondes)
 */
const trafficCache = new Map<string, { data: any, expires: number }>();

/** Un signalement citoyen n'est plus considéré comme « en direct » après ce délai. */
const REPORT_FRESH_MINUTES = 60;

function tsToMillis(ts: any): number | null {
    if (!ts) return null;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    const n = new Date(ts).getTime();
    return Number.isNaN(n) ? null : n;
}

/**
 * Signalements récents (< REPORT_FRESH_MINUTES) et non expirés, sous forme d'objets simples
 * (sérialisables par les Server Actions). Les vieux signalements restés « active » ne doivent
 * plus colorer la carte ni servir de cause.
 */
async function loadFreshReports(): Promise<any[]> {
    try {
        const firestore = getServerFirestore();
        const snap = await getDocs(query(collection(firestore, 'road_condition_reports'), orderBy('createdAt', 'desc'), limit(60)));
        const nowMs = Date.now();
        const cutoff = nowMs - REPORT_FRESH_MINUTES * 60 * 1000;
        return snap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter(r => r.status !== 'expired' && r.coords && (tsToMillis(r.createdAt) ?? 0) >= cutoff)
            .map(r => ({
                id: r.id,
                type: r.type ?? null,
                description: r.description ?? '',
                locationName: r.locationName ?? null,
                coords: { lat: Number(r.coords.lat), lng: Number(r.coords.lng) },
                ageMin: Math.max(0, Math.round((nowMs - (tsToMillis(r.createdAt) ?? nowMs)) / 60000)),
            }));
    } catch (err) {
        console.warn('[Reports] lecture impossible:', err);
        return [];
    }
}

/** Votes 1-tap « toujours bloqué / c'est dégagé » des 30 à 60 dernières minutes, groupés par nœud. */
async function loadRecentVotes(): Promise<Record<string, { still: number; clear: number; lastAgeMin: number | null }>> {
    const out: Record<string, { still: number; clear: number; lastAtMs: number }> = {};
    try {
        const firestore = getServerFirestore();
        const snap = await getDocs(query(collection(firestore, 'traffic_votes'), where('slot', '>=', voteSlot() - 1), limit(500)));
        snap.docs.forEach(d => {
            const v = d.data() as any;
            if (!v.nodeId || (v.vote !== 'still' && v.vote !== 'clear')) return;
            const agg = out[v.nodeId] ??= { still: 0, clear: 0, lastAtMs: 0 };
            agg[v.vote as 'still' | 'clear']++;
            agg.lastAtMs = Math.max(agg.lastAtMs, tsToMillis(v.createdAt) ?? 0);
        });
    } catch (err) {
        console.warn('[Votes] lecture impossible:', err);
    }
    const nowMs = Date.now();
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, {
        still: v.still,
        clear: v.clear,
        lastAgeMin: v.lastAtMs ? Math.max(0, Math.round((nowMs - v.lastAtMs) / 60000)) : null,
    }]));
}

/**
 * Score de confiance 0–100 affiché à côté de chaque chiffre.
 * Mesure en direct = base élevée ; estimation horaire = base basse. Les signalements et votes
 * récents qui vont dans le même sens que le statut l'augmentent, les contradictions la baissent.
 */
function confidenceScore(isLive: boolean, congested: boolean, reports: number, votes?: { still: number; clear: number }) {
    let c = isLive ? 70 : 25;
    c += Math.min(20, reports * 10);
    if (votes) {
        const agree = congested ? votes.still : votes.clear;
        const disagree = congested ? votes.clear : votes.still;
        c += Math.min(20, agree * 5) - Math.min(30, disagree * 10);
    }
    return Math.max(5, Math.min(98, Math.round(c)));
}

/** Pluie à Kinshasa (Open-Meteo, gratuit, sans clé). Cache 10 min. null si indisponible. */
let weatherCache: { data: { rainMmH: number; rainProbNext2h: number } | null; expires: number } | null = null;
async function loadKinshasaWeather() {
    if (weatherCache && weatherCache.expires > Date.now()) return weatherCache.data;
    let data: { rainMmH: number; rainProbNext2h: number } | null = null;
    try {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=-4.33&longitude=15.31&current=precipitation&hourly=precipitation_probability&forecast_hours=3&timezone=Africa%2FKinshasa';
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
            const w = await res.json();
            const probs: number[] = (w?.hourly?.precipitation_probability || []).slice(0, 2);
            data = {
                rainMmH: Number(w?.current?.precipitation ?? 0),
                rainProbNext2h: probs.length ? Math.max(...probs.map(Number)) : 0,
            };
        }
    } catch (err) {
        console.warn('[Météo] indisponible:', err);
    }
    weatherCache = { data, expires: Date.now() + 10 * 60 * 1000 };
    return data;
}

/**
 * Événements qui bloquent les routes : matchs, cortèges, rassemblements, travaux, coupures SNEL.
 * Collection `traffic_events` saisie par les admins : { title, type, lat, lng, radiusKm, startsAt, endsAt }.
 */
async function loadActiveTrafficEvents(): Promise<Array<{ title: string; type: string; lat: number; lng: number; radiusKm: number }>> {
    try {
        const firestore = getServerFirestore();
        const snap = await getDocs(query(collection(firestore, 'traffic_events'), orderBy('endsAt', 'desc'), limit(40)));
        const now = Date.now();
        return snap.docs.map(d => d.data() as any).filter(e => {
            const start = tsToMillis(e.startsAt) ?? 0;
            const end = tsToMillis(e.endsAt) ?? 0;
            // actif d'une heure avant le début à une heure après la fin
            return typeof e.lat === 'number' && typeof e.lng === 'number' && now >= start - 3600e3 && now <= end + 3600e3;
        }).map(e => ({ title: String(e.title || 'Événement'), type: String(e.type || 'autre'), lat: e.lat, lng: e.lng, radiusKm: Number(e.radiusKm || 1.5) }));
    } catch (err) {
        console.warn('[Événements] lecture impossible:', err);
        return [];
    }
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const dLat = (a.lat - b.lat) * 111;
    const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
}

const REPORT_TYPE_LABEL: Record<string, string> = {
    blockage: 'Blocage signalé',
    police: 'Contrôle de police',
    pothole: 'Nid-de-poule',
    damaged_road: 'Chaussée abîmée',
};
const EVENT_ICON: Record<string, string> = { match: 'calendar', cortege: 'siren', eglise: 'users', travaux: 'construction', coupure: 'bolt', autre: 'calendar' };

/**
 * Panneau « Pourquoi ça bloque » : chaque cause avec sa preuve et son poids.
 * Seules les sources réelles comptent ; la cause habituelle n'apparaît que s'il n'y a rien d'autre,
 * et elle est marquée « non confirmée ».
 */
function buildWhy(node: any, ctx: { weather: { rainMmH: number; rainProbNext2h: number } | null; events: Awaited<ReturnType<typeof loadActiveTrafficEvents>> }) {
    const items: Array<{ icon: string; label: string; evidence: string; weight: number; confirmed: boolean }> = [];
    for (const r of node.activeIncidents || []) {
        items.push({ icon: r.type === 'police' ? 'shield' : 'alert', label: r.description || REPORT_TYPE_LABEL[r.type] || 'Signalement', evidence: `${REPORT_TYPE_LABEL[r.type] || 'Signalement'} · il y a ${r.ageMin} min`, weight: 3, confirmed: true });
    }
    for (const e of ctx.events) {
        if (distanceKm(node.coords, e) <= e.radiusKm) {
            items.push({ icon: EVENT_ICON[e.type] || 'calendar', label: e.title, evidence: 'Calendrier des événements', weight: 3, confirmed: true });
        }
    }
    if (node.probe && node.probe.speedKmh < 15) {
        const n = node.probe.contributors;
        items.push({ icon: 'gps', label: `${n} conducteur${n > 1 ? 's' : ''} roule${n > 1 ? 'nt' : ''} à ${node.probe.speedKmh} km/h ici`, evidence: 'GPS anonyme · 15 dernières minutes', weight: n >= 3 ? 2 : 1, confirmed: n >= 3 });
    }
    const v = node.votes || { still: 0, clear: 0, lastAgeMin: null };
    if (v.still > v.clear && v.still > 0) {
        items.push({ icon: 'users', label: `${v.still} Kinois sur place disent que c'est toujours bloqué`, evidence: v.lastAgeMin !== null ? `dernier vote il y a ${v.lastAgeMin} min` : 'votes récents', weight: 2, confirmed: true });
    }
    const congested = node.status === 'BLOQUÉ' || node.status === 'EMBOUTEILLAGE';
    if (ctx.weather && ctx.weather.rainMmH >= 0.5) {
        items.push({ icon: 'rain', label: `Pluie en ce moment (${ctx.weather.rainMmH.toFixed(1)} mm/h)`, evidence: 'Météo Open-Meteo', weight: congested ? 2 : 1, confirmed: true });
    } else if (ctx.weather && ctx.weather.rainProbNext2h >= 60) {
        items.push({ icon: 'rain', label: `Pluie probable dans les 2 h (${ctx.weather.rainProbNext2h}%)`, evidence: 'Prévision Open-Meteo', weight: 1, confirmed: false });
    }
    if (congested && !items.some(i => i.confirmed)) {
        items.push({ icon: 'clock', label: node.typicalCause, evidence: "Cause habituelle à cette heure, non confirmée aujourd'hui", weight: 1, confirmed: false });
    }
    const total = items.reduce((a, i) => a + i.weight, 0) || 1;
    return items
        .sort((a, b) => b.weight - a.weight)
        .map(i => ({ ...i, pct: Math.round((i.weight / total) * 100) }));
}

/** Contrôles / roulages signalés ces 3 dernières heures (repris de main, cache 45 s). */
let policeCache: { data: any[]; expires: number } | null = null;
async function loadRecentPoliceReports(): Promise<any[]> {
    const now = Date.now();
    if (policeCache && policeCache.expires > now) return policeCache.data;
    let data: any[] = [];
    try {
        const firestore = getServerFirestore();
        const since = Timestamp.fromDate(new Date(now - 3 * 3600 * 1000));
        const snap = await getDocs(query(collection(firestore, 'police_reports'), where('timestamp', '>=', since), orderBy('timestamp', 'desc'), limit(20)));
        data = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    } catch (err) {
        console.warn('[Police] lecture impossible:', err);
    }
    policeCache = { data, expires: now + 45 * 1000 };
    return data;
}

/** Contrôle signalé près d'un point (coordonnées si présentes, sinon nom de lieu). */
function matchPolice(reports: any[], coords: { lat: number; lng: number }, words: string[]) {
    const norm = (t: any) => String(t || '').toLowerCase();
    return reports.find(r =>
        (r.coords && Math.abs(Number(r.coords.lat) - coords.lat) < 0.015 && Math.abs(Number(r.coords.lng) - coords.lng) < 0.015) ||
        words.some(w => w.length >= 4 && (norm(r.location).includes(w) || norm(r.note).includes(w)))
    ) ?? null;
}

export async function checkTrafficAction(input: { lat: number, lng: number, address?: string }) {
    const cacheKey = `${input.lat.toFixed(4)}-${input.lng.toFixed(4)}`;
    const now = Date.now();

    if (trafficCache.has(cacheKey) && trafficCache.get(cacheKey)!.expires > now) {
        return trafficCache.get(cacheKey)!.data;
    }

    try {
        // 1. Initialisation Firebase prudente sur le serveur
        let localReport: any = null;
        try {
            const recentReports = await loadFreshReports();
            // Signalement récent dans un rayon de ~1.5 km
            localReport = recentReports.find(r => 
                Math.abs(r.coords.lat - input.lat) < 0.015 && 
                Math.abs(r.coords.lng - input.lng) < 0.015
            );
        } catch (dbError) {
            console.warn("[TrafficCheck] Firestore bypass:", dbError);
        }

        // 2. Appel à Google Routes API v2
        // Sondage de ~1.5km pour une portion de route significative
        const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
        const body = {
            origin: { location: { latLng: { latitude: input.lat, longitude: input.lng } } },
            destination: { location: { latLng: { latitude: input.lat + 0.015, longitude: input.lng + 0.015 } } },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_AWARE_OPTIMAL",
            computeAlternativeRoutes: true,
            languageCode: "fr-FR"
        };

        let data: any = null;
        let route: any = null;
        // true quand la durée vient d'OSRM (route vide) × facteur horaire : c'est une estimation, pas une mesure.
        let isEstimate = false;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': GOOGLE_API_KEY,
                    'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.description'
                },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                data = await res.json();
                route = data?.routes?.[0];
            }
        } catch (apiErr) {
            console.warn('[checkTrafficAction] Google Routes call bypassed:', apiErr);
        }

        // Live OSRM Real-Time Telemetry Fallback if Google was blocked
        if (!route) {
            try {
                const destLat = input.lat + 0.015;
                const destLng = input.lng + 0.015;
                const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${input.lng},${input.lat};${destLng},${destLat}?overview=false`;
                const osrmRes = await fetch(osrmUrl, { headers: { 'User-Agent': 'KinshasaFlow/2.0' } });
                if (osrmRes.ok) {
                    const osrmData = await osrmRes.json();
                    if (osrmData.code === 'Ok' && osrmData.routes?.[0]) {
                        const r = osrmData.routes[0];
                        const { hour: kinshasaHour, isPeakHour: isRush } = kinshasaNow();
                        const rushMult = isRush ? (kinshasaHour >= 17 && kinshasaHour <= 19 ? 2.8 : 2.1) : 1.15;
                        const durSec = Math.round(r.duration * rushMult);
                        const staticSec = Math.round(r.duration);
                        route = {
                            distanceMeters: r.distance,
                            duration: `${durSec}s`,
                            staticDuration: `${staticSec}s`,
                            description: "Itinéraire via OSRM Live Telemetry"
                        };
                        data = { routes: [route] };
                        isEstimate = true;
                    }
                }
            } catch (osrmErr) {
                console.warn('[checkTrafficAction] OSRM fallback error:', osrmErr);
            }
        }
        
        let result: any = {
            status: "INCONNU",
            verdict: "Analyse en cours — soyez prudent sur cet axe.",
            lingala: "Tozali kotala nzela — keba na tamboli na yo.",
            delay: 0,
            ratio: 1,
            alternatives: [],
            source: 'none',
            isLive: false,
            confidence: 0,
            cause: null,
            typicalCause: null,
            typicalAlternative: null,
            reportAgeMin: null
        };

        if (route) {
            const dur = parseInt((route.duration ?? "0s").replace('s', '')) || 1;
            const statDur = parseInt((route.staticDuration ?? route.duration ?? "0s").replace('s', '')) || 1;
            const ratio = dur / statDur;
            const delay = Math.round(Math.max(0, dur - statDur) / 60);

            // Ajustement des seuils de sensibilité pour Kinshasa (Précision accrue)
            // Un ratio > 1.6 ou un retard de 5 min sur une courte distance indique souvent un blocage
            if (ratio > 1.6 || delay >= 5) result.status = "BLOQUÉ";
            else if (ratio > 1.25 || delay >= 2) result.status = "EMBOUTEILLÉ";
            else if (ratio > 1.1 || delay >= 1) result.status = "MODÉRÉ";
            else result.status = "FLUIDE";

            if (localReport) {
                result.verdict = `Signalement communautaire : ${localReport.description}`;
                result.lingala = "Bato balobi nzela eza pasi, keba mingi.";
            } else {
                if (result.status === "FLUIDE") {
                    result.verdict = "Axe fluide : Circulation libre constatée.";
                    result.lingala = "Nzela eza kitoko, kotambola eza pasi te.";
                } else if (result.status === "MODÉRÉ") {
                    result.verdict = `Trafic modéré : Prévoyez un ralentissement de ${delay || 1} min.`;
                    result.lingala = "Nzela eza pasi moke, zela mwa moke.";
                } else {
                    result.verdict = `${input.address || 'Cet axe'} est actuellement ${result.status.toLowerCase()} (Retard estimé : ${delay} min).`;
                    result.lingala = "Nzela eza bloqué, luka nzela mosusu soki likoki eza.";
                }
            }

            result.delay = delay;
            result.ratio = ratio;
            result.source = isEstimate ? 'estimate' : 'google';
            result.isLive = !isEstimate;
            result.confidence = confidenceScore(!isEstimate, result.status !== 'FLUIDE', localReport ? 1 : 0);
            if (isEstimate && !localReport) {
                result.verdict = `Estimation selon l'heure, pas de mesure en direct pour l'instant. ${result.verdict}`;
            }

            // Déduction contextuelle de la cause exacte du ralentissement (Hyper-local Kinshasa)
            const addrLower = (input.address || "").toLowerCase();
            let cause = "Ralentissement habituel de forte affluence.";
            let certifiedAlternative = "Avenue secondaire parallèle recommandée.";

            if (localReport) {
                cause = localReport.description;
            } else if (result.status === "BLOQUÉ" || result.status === "EMBOUTEILLÉ") {
                if (addrLower.includes("lumumba") || addrLower.includes("limete") || addrLower.includes("pascal")) {
                    cause = "Goulot de l\'Échangeur et arrêts de minibus 207 sur la chaussée.";
                    certifiedAlternative = "Av. des Poids Lourds via Kingabwa (évite l\'Échangeur).";
                } else if (addrLower.includes("magasin") || addrLower.includes("mondjiba") || addrLower.includes("kintambo")) {
                    cause = "Régulation manuelle intense des roulages et refoulement vers Ngaliema.";
                    certifiedAlternative = "Av. du Tourisme le long des berges du fleuve.";
                } else if (addrLower.includes("matadi") || addrLower.includes("upn") || addrLower.includes("pompage")) {
                    cause = "Chaussée rétrécie par nids-de-poule et stationnement anarchique de taxis-motos.";
                    certifiedAlternative = "Avenue de la Montagne ou déviation vers Météo.";
                } else if (addrLower.includes("by-pass") || addrLower.includes("triangle") || addrLower.includes("lemba")) {
                    cause = "Déversement de marché de rue et bus en arrêt sauvage au Rond-Point.";
                    certifiedAlternative = "Avenue Elengesa (nouvelle voie asphaltée fluide).";
                } else if (addrLower.includes("victoire") || addrLower.includes("kasa-vubu") || addrLower.includes("kalamu")) {
                    cause = "Forte affluence piétonne et embouteillage en nœud de papillon.";
                    certifiedAlternative = "Avenue de la Victoire vers Avenue du Stade.";
                } else if (delay >= 6) {
                    cause = "Cause inconnue : aucun signalement récent sur cet axe.";
                    certifiedAlternative = "Contourner par la première ruelle carrossable à droite.";
                } else {
                    cause = "Trafic dense en accordéon aux heures de pointe.";
                    certifiedAlternative = "Consultez les itinéraires bis sur le GPS K-Flow.";
                }
            } else if (result.status === "MODÉRÉ") {
                cause = "Ralentissement passager, circulation en accordéon.";
                certifiedAlternative = "Cet axe reste praticable, restez sur la voie du milieu.";
            } else {
                cause = "Voie totalement dégagée, aucun obstacle signalé.";
                certifiedAlternative = "Itinéraire principal optimal.";
            }

            // Seul un signalement récent est une cause confirmée ; le reste est la cause habituelle de l'axe.
            result.cause = localReport ? localReport.description : null;
            result.reportAgeMin = localReport ? localReport.ageMin : null;
            result.typicalCause = localReport ? null : cause;
            result.typicalAlternative = certifiedAlternative;

            if (data.routes.length > 1) {
                // Itinéraires bis renvoyés par Google : on donne aussi leur retard mesuré (repris de main)
                result.alternatives = data.routes.slice(1, 3).map((r: any) => {
                    const aDur = parseInt((r.duration || "0s").replace('s', '')) || 0;
                    const aStat = parseInt((r.staticDuration || r.duration || "0s").replace('s', '')) || aDur;
                    return {
                        description: r.description || "Itinéraire bis",
                        duration: Math.round(aDur / 60) + " min",
                        delay: isEstimate ? null : Math.max(0, Math.round((aDur - aStat) / 60)),
                    };
                });
            }

            // Contrôle / roulage signalé tout près : cause observée si aucun signalement de voirie
            const police = matchPolice(await loadRecentPoliceReports(), input, (input.address || '').toLowerCase().split(/[\s,()/➔-]+/));
            if (police && !localReport) {
                result.cause = `Contrôle / roulage signalé : ${police.note || police.location || 'sur cet axe'}`;
                result.typicalCause = null;
            }
        }

        trafficCache.set(cacheKey, { data: result, expires: now + 90000 });
        return result;

    } catch (e: any) {
        console.error("Critical Traffic Check Error:", e);
        return { 
            status: "ERREUR", 
            verdict: `Erreur d'analyse : ${e.message || "Service indisponible."}`,
            lingala: "Pasi mwa moke na machine, zela moke."
        };
    }
}

export async function getGoogleTrafficStatusAction(axes: any[]) {
    try {
        const results = await Promise.all(axes.map(async (axis) => {
            try {
                const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
                const body = {
                    origin: { location: { latLng: { latitude: axis.origin.lat, longitude: axis.origin.lng } } },
                    destination: { location: { latLng: { latitude: axis.destination.lat, longitude: axis.destination.lng } } },
                    travelMode: "DRIVE",
                    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
                    languageCode: "fr-FR"
                };

                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': GOOGLE_API_KEY,
                        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters'
                    },
                    body: JSON.stringify(body)
                });

                if (!res.ok) return { road: axis.name, status: "INCONNU", speed: 0, delay: 0 };
                const data = await res.json();
                const route = data?.routes?.[0];
                
                if (!route) return { road: axis.name, status: "INCONNU", speed: 0, delay: 0 };

                const dur = parseInt((route.duration ?? "0s").replace('s', '')) || 1;
                const statDur = parseInt((route.staticDuration ?? route.duration ?? "0s").replace('s', '')) || 1;
                const ratio = dur / statDur;
                const delay = Math.round(Math.max(0, dur - statDur) / 60);
                const distKm = (route.distanceMeters / 1000) || 1;
                const speed = Math.round(distKm / (dur / 3600));

                let status = "FLUIDE";
                if (ratio > 1.7 || delay > 8) status = "EMBOUTEILLAGE";
                else if (ratio > 1.3 || delay > 3) status = "DENSE";
                else if (ratio > 1.1 || delay > 1) status = "MODÉRÉ";

                const result = { road: axis.name, status, speed, delay };

                // Enregistrement passif dans traffic_history pour alimenter le modèle d'apprentissage IA
                try {
                    const kin = kinshasaNow();
                    // Écriture serveur (Admin SDK) : traffic_history n'est plus modifiable par les clients.
                    adminDb().collection('traffic_history').add({
                        road: axis.name,
                        status,
                        speed,
                        delay,
                        dayOfWeek: kin.dayOfWeek,
                        hourOfDay: kin.hour,
                        minuteOfHour: kin.minute,
                        tz: 'Africa/Kinshasa',
                        timestamp: FieldValue.serverTimestamp()
                    }).catch(() => {});
                } catch (logErr) {
                    // Silencieux pour ne pas impacter le flux principal
                }

                return result;
            } catch (e) {
                return { road: axis.name, status: "INCONNU", speed: 0, delay: 0 };
            }
        }));
        
        return results;
    } catch (globalError) {
        console.error("Global Traffic Action Error:", globalError);
        return axes.map(a => ({ road: a.name, status: "INCONNU", speed: 0, delay: 0 }));
    }
}

export async function getTrafficTipsAction(input: TrafficTipsInput) {
    try {
        return await getTrafficTips(input);
    } catch (e) {
        console.error("Traffic Tips Error:", e);
        return { tips: ["Restez vigilant", "Vérifiez votre GPS"] };
    }
}

export async function askAssistantAction(input: AssistantInput) {
    try {
        return await askAssistant(input);
    } catch (e) {
        console.error("Assistant Error:", e);
        return { answer: "Désolé, je rencontre une difficulté technique. Réessayez dans un instant." };
    }
}

export async function generateSpeechAction(text: string) {
    try {
        return await generateSpeech(text);
    } catch (error: any) {
        console.error('generateSpeechAction error:', error);
        throw new Error(error.message || "Erreur lors de la génération vocale.");
    }
}

export async function getStrategicInsightsAction(input: StrategicInsightsInput): Promise<StrategicInsightsOutput> {
  try {
    const result = await getStrategicInsights(input);
    if (!result) throw new Error("No data returned from AI flow");
    return result;
  } catch (error: any) {
    console.error("Strategic Insights Action Error:", error);
    return {
      globalAdvice: "Analyse momentanément indisponible. Restez prudents sur les routes.",
      tips: ["Vérifiez vos rétroviseurs", "Gardez vos distances de sécurité", "Évitez les axes saturés"],
      trend: "stable" as const
    };
  }
}

export async function sendTestPushNotificationAction(subscription: PushSubscription, payload: string) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    return { success: false, error: "VAPID keys are not configured." };
  }

  try {
    webpush.setVapidDetails('mailto:drnduwa@gmail.com', vapidPublicKey, vapidPrivateKey);
    await webpush.sendNotification(subscription as any, payload);
    return { success: true };
  } catch (error: any) {
    console.error("Push Notification Error:", error);
    return { success: false, error: error.message };
  }
}

export async function sendTestEmailAction(idToken: string) {
  try { await verifyAdmin(idToken); } catch (err: any) { return { success: false, error: authErrorMessage(err, 'Non autorisé.') }; }
  const { smtpUser, smtpPass } = smtpCredentials();

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const mailOptions = {
    from: `"Kinshasa Flow Admin" <${smtpUser}>`,
    to: "drnduwa@gmail.com",
    subject: "🧪 Test de Notification E-mail K-Flow",
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h1 style="color: #248eeb;">Test SMTP Réussi !</h1>
        <p>Si vous recevez ce message, c'est que votre tunnel e-mail est parfaitement configuré pour Kinshasa Flow.</p>
        <p>Horodatage : ${new Date().toLocaleString()}</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error: any) {
    console.error('[SMTP Test] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function broadcastEmailAction(params: { 
  title: string, 
  message: string, 
  userName: string,
  type: 'chat' | 'alert' | 'hazard' | 'report',
  location?: string,
  recipientEmails?: string[],
  idToken: string
}) {
  // Appelable depuis le navigateur : on exige un compte connecté, et seuls les admins
  // peuvent choisir les destinataires.
  let caller;
  try { caller = await verifyCaller(params.idToken); } catch (err: any) { return { success: false, error: authErrorMessage(err, 'Non autorisé.') }; }
  if (params.recipientEmails?.length && !caller.isAdmin) {
    return { success: false, error: 'Réservé aux administrateurs.' };
  }
  const { smtpUser, smtpPass } = smtpCredentials();

  // Initialisation dynamique des destinataires
  let recipientList: string[] = ['drnduwa@gmail.com']; 
  
  if (params.recipientEmails && params.recipientEmails.length > 0) {
      recipientList = Array.from(new Set([...recipientList, ...params.recipientEmails]));
  } else {
      try {
        const usersSnap = await adminDb().collection('users').get();

        if (!usersSnap.empty) {
            const userEmails = usersSnap.docs
              .map(doc => doc.data().email)
              .filter(email => email && email.includes('@') && !email.endsWith('@kinshasaflow.online') && email !== 'drnduwa@gmail.com');
            
            // On fusionne et on dédoublonne
            recipientList = Array.from(new Set([...recipientList, ...userEmails]));
        }
      } catch (e) {
        console.warn("[Email Broadcast] Impossible de lister les utilisateurs pour la diffusion globale sur le serveur.", e);
      }
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
    pool: true, // Utilisation d'un pool pour les envois multiples
  });

  const isAlert = ['alert', 'hazard', 'report'].includes(params.type);
  const subjectPrefix = isAlert ? '🚨 ALERTE K-FLOW' : '💬 K-FLOW CHAT';
  const locationStr = params.location ? ` à ${params.location}` : '';

  const mailOptions = {
    from: `"Kinshasa Flow" <${smtpUser}>`,
    to: "kinshasaflow@gmail.com", // Destinataire principal générique
    bcc: recipientList, // Copie cachée à TOUS les utilisateurs
    subject: `${subjectPrefix} : ${params.title}${locationStr}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b; background-color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
          <div style="background-color: ${isAlert ? '#ef4444' : '#248eeb'}; padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; letter-spacing: -1px;">Kinshasa Flow</h1>
            <p style="color: #ffffff; opacity: 0.8; margin: 5px 0 0; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
              ${isAlert ? 'Alerte Prioritaire' : 'Nouveau Message Chat'}
            </p>
          </div>
          <div style="padding: 40px;">
            <h2 style="color: #1e293b; margin-top: 0; font-size: 20px; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">${params.title}</h2>
            <div style="margin: 25px 0; background-color: #f8fafc; padding: 20px; border-radius: 12px; border-left: 4px solid ${isAlert ? '#ef4444' : '#248eeb'};">
                <p style="margin: 0; font-size: 16px; color: #334155; font-style: italic; line-height: 1.6;">"${params.message}"</p>
            </div>
            <p style="margin-bottom: 5px; font-size: 14px; color: #64748b;"><strong>Auteur :</strong> ${params.userName}</p>
            ${params.location ? `<p style="font-size: 14px; color: #64748b;"><strong>Localisation :</strong> ${params.location}</p>` : ''}
            <div style="text-align: center; margin-top: 40px;">
              <a href="https://kinshasaflow.online" style="background-color: ${isAlert ? '#ef4444' : '#248eeb'}; color: #ffffff; padding: 18px 30px; text-decoration: none; border-radius: 14px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">Ouvrir l'application</a>
            </div>
          </div>
          <div style="padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #fafafa;">
            Communauté Kinshasa Flow - Radio Trottoir Live.<br/>
            <em>Ceci est une notification automatique, merci de ne pas y répondre.</em>
          </div>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error: any) {
    console.error('[Email Broadcast] SMTP Error:', error);
    return { success: false, error: error.message };
  }
}

export async function sendWelcomeEmailAction(params: { email: string, userName: string, idToken: string }) {
  // Uniquement vers l'adresse du compte qui vient de s'inscrire (sinon : envoi de spam vers n'importe qui).
  try {
    const caller = await verifyCaller(params.idToken);
    if (!caller.email || caller.email.toLowerCase() !== String(params.email).toLowerCase()) {
      return { success: false, error: 'Adresse non autorisée.' };
    }
  } catch (err: any) { return { success: false, error: authErrorMessage(err, 'Non autorisé.') }; }
  const { smtpUser, smtpPass } = smtpCredentials();

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const mailOptions = {
    from: `"Kinshasa Flow" <${smtpUser}>`,
    to: params.email,
    subject: `Bienvenue sur Kinshasa Flow, ${params.userName} ! 🌟`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b; background-color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
          <div style="background-color: #248eeb; padding: 40px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; letter-spacing: -1px;">Bienvenue !</h1>
          </div>
          <div style="padding: 40px; text-align: center;">
            <h2 style="color: #1e293b; margin-top: 0;">Merci de nous rejoindre, ${params.userName}</h2>
            <p style="font-size: 16px; color: #64748b; line-height: 1.6;">
              Nous sommes ravis de vous compter parmi les membres de <strong>Kinshasa Flow</strong>. 
              Ensemble, nous allons rendre la circulation à Kinshasa plus fluide et moins stressante.
            </p>
            <div style="margin: 30px 0; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
                <p style="margin: 0; font-weight: bold; color: #248eeb;">Cadeau de bienvenue : +25 Stars ⭐</p>
                <p style="margin: 5px 0 0; font-size: 12px; color: #64748b;">Utilisez-les pour consulter le trafic premium ou poser des questions à l'IA.</p>
            </div>
            <a href="https://kinshasaflow.online" style="background-color: #248eeb; color: #ffffff; padding: 18px 30px; text-decoration: none; border-radius: 14px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(36, 142, 235, 0.3);">DÉCOUVRIR L'APPLICATION</a>
          </div>
          <div style="padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #fafafa;">
            Kinshasa Flow - Swazi Appli Lab sarl.<br/>
            <em>Ceci est un message de bienvenue automatique.</em>
          </div>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error: any) {
    console.error('[Welcome Email] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function sendAlertEmailAction(params: { type: string, location: string, userName: string, idToken: string }) {
  return broadcastEmailAction({
      title: params.type.toUpperCase(),
      message: `${params.type} signalé par ${params.userName}`,
      userName: params.userName,
      type: 'alert',
      location: params.location,
      idToken: params.idToken
  });
}

export async function sendRelanceGiftEmailAction(idToken: string, recipientEmails: string[]) {
  try { await verifyAdmin(idToken); } catch (err: any) { return { success: false, error: authErrorMessage(err, 'Non autorisé.') }; }
  const { smtpUser, smtpPass } = smtpCredentials();

  if (!recipientEmails || recipientEmails.length === 0) {
    return { success: false, error: "Aucun email destinataire spécifié." };
  }

  // Filtrer et dédoublonner les emails valides
  const cleanEmails = Array.from(new Set(
    recipientEmails
      .filter(e => e && e.includes('@') && !e.endsWith('@kinshasaflow.online'))
  ));

  if (cleanEmails.length === 0) {
    return { success: false, error: "Aucun email valide trouvé." };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const mailOptions = {
    from: `"Kinshasa Flow" <${smtpUser}>`,
    to: smtpUser, // Destinataire principal
    bcc: cleanEmails, // Copie cachée à tous les utilisateurs
    subject: "🎁 Cadeau Spécial : 25 Stars Offertes sur votre compte Kinshasa Flow !",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #1e293b; background-color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08);">
          <div style="background-color: #248eeb; padding: 36px 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">🎁 Cadeau Spécial K-Flow</h1>
            <p style="color: #ffffff; opacity: 0.9; margin: 8px 0 0; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
              25 Stars Créditées sur votre compte
            </p>
          </div>
          <div style="padding: 36px 24px; text-align: center;">
            <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 800;">Profitez de vos 25 Stars gratuites ⭐</h2>
            <p style="font-size: 15px; color: #475569; line-height: 1.6; text-align: left; margin: 16px 0;">
              Chère communauté de <strong>Kinshasa Flow</strong>,
            </p>
            <p style="font-size: 15px; color: #475569; line-height: 1.6; text-align: left; margin: 16px 0;">
              Pour vous remercier de votre fidélité et vous faire découvrir toutes les nouveautés de l'application, nous avons le plaisir de vous offrir <strong>25 Stars gratuites</strong> !
            </p>

            <div style="margin: 28px 0; padding: 22px; background-color: #f0f9ff; border-radius: 18px; text-align: left; border: 1px solid #bae6fd;">
              <h3 style="color: #0369a1; margin: 0 0 12px 0; font-size: 15px; font-weight: 800;">🚀 Ce que vous pouvez faire dès maintenant :</h3>
              <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 13px; line-height: 1.8;">
                <li><strong>Assistant Vocal IA</strong> : Posez vos questions d'itinéraires en Lingala et en Français.</li>
                <li><strong>GPS K-Flow Nav</strong> : Calculez le meilleur trajet pour contourner les embouteillages.</li>
                <li><strong>Radar de Circulation</strong> : Consultez l'état du trafic en temps réel sur les grands axes kinois.</li>
              </ul>
            </div>

            <div style="margin: 20px 0; padding: 18px; background-color: #f8fafc; border-radius: 14px; text-align: left; border-left: 4px solid #248eeb;">
              <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
                💳 <strong>Nouveau :</strong> Rechargez vos Stars en toute simplicité ou activez un <strong>Pass Illimité (7 ou 30 jours)</strong> via <strong>FlexPay</strong> (Vodacom M-Pesa, Orange Money, Airtel Money, Afrimoney et Carte Bancaire Visa/Mastercard).
              </p>
            </div>

            <div style="text-align: center; margin-top: 32px;">
              <a href="https://kinshasaflow.online/mes-stars" style="background-color: #248eeb; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 14px; font-weight: 900; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(36, 142, 235, 0.35);">
                DÉCOUVRIR MES 25 STARS EN DIRECT
              </a>
            </div>
          </div>
          <div style="padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #fafafa;">
            Kinshasa Flow • Swazi Appli Lab sarl.<br/>
            <em>Vous recevez ce message car vous êtes membre de la communauté Kinshasa Flow.</em>
          </div>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, count: cleanEmails.length, messageId: info.messageId };
  } catch (error: any) {
    console.error('[Relance Email] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function initiateFlexPayPaymentAction(params: {
  idToken: string;
  itemId: string;
  currency: 'CDF' | 'USD';
  channel: 'mobile_money' | 'card';
  phone?: string;
}): Promise<{
  success: boolean;
  orderNumber?: string;
  reference?: string;
  url?: string;
  message?: string;
  error?: string;
}> {
  try {
    const { uid } = await verifyCaller(params.idToken);

    // Prix, Stars et durée du Pass viennent du catalogue serveur, jamais du navigateur.
    const pack = STAR_PACK_CATALOG[params.itemId];
    const pass = PASS_CATALOG[params.itemId];
    if (!pack && !pass) return { success: false, error: 'Article inconnu.' };
    if (params.currency !== 'CDF' && params.currency !== 'USD') return { success: false, error: 'Devise non prise en charge.' };
    const itemType: 'pack' | 'pass' = pack ? 'pack' : 'pass';
    const amount = (pack ?? pass)!.prices[params.currency];
    const stars = pack ? pack.stars : 0;
    const passType = pass ? pass.passType : null;

    const reference = `KF_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    let result: { success: boolean; orderNumber?: string; url?: string; message?: string; error?: string };

    if (params.channel === 'mobile_money') {
      if (!params.phone) {
        return { success: false, error: 'Numéro de téléphone requis pour le paiement Mobile Money.' };
      }
      result = await initiateFlexPayMobileMoney({
        phone: params.phone,
        amount,
        currency: params.currency,
        reference,
      });
    } else {
      result = await initiateFlexPayCard({
        amount,
        currency: params.currency,
        reference,
        description: itemType === 'pass'
          ? `Pass Illimité Kinshasa Flow (${passType})`
          : `Pack ${stars} Stars Kinshasa Flow`,
      });
    }

    if (!result.success || !result.orderNumber) {
      return { success: false, error: result.error || 'Impossible d\'initier le paiement.' };
    }

    const network = params.phone ? detectDRCOperator(params.phone) : undefined;
    await adminDb().collection('payments').doc(result.orderNumber).set({
      id: result.orderNumber,
      orderNumber: result.orderNumber,
      reference,
      userId: uid,
      itemType,
      itemId: params.itemId,
      stars,
      passType,
      amount,
      currency: params.currency,
      channel: params.channel,
      network: network || null,
      phone: params.phone || null,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      orderNumber: result.orderNumber,
      reference,
      url: result.url,
      message: result.message,
    };
  } catch (err: any) {
    console.error('[FlexPay] Exception in initiateFlexPayPaymentAction:', err);
    return { success: false, error: authErrorMessage(err, 'Erreur lors de l\'initiation du paiement.') };
  }
}

export async function checkFlexPayStatusAction(orderNumber: string): Promise<{
  success: boolean;
  status: '0' | '1' | '2' | 'unknown';
  message?: string;
  fulfilled?: boolean;
  error?: string;
}> {
  try {
    const checkRes = await checkFlexPayTransactionStatus(orderNumber);
    if (!checkRes.success) {
      return { success: false, status: 'unknown', error: checkRes.error };
    }

    if (checkRes.status === '0') {
      const fulfillment = await fulfillVerifiedFlexPayPayment(orderNumber);
      return {
        success: true,
        status: '0',
        message: 'Paiement confirmé avec succès ! Vos crédits sont activés.',
        fulfilled: fulfillment.success,
      };
    } else if (checkRes.status === '1') {
      await markPaymentFailed(orderNumber);
      return {
        success: true,
        status: '1',
        message: 'La transaction a été annulée ou refusée.',
      };
    } else {
      return {
        success: true,
        status: '2',
        message: 'En attente de validation PIN...',
      };
    }
  } catch (err: any) {
    console.error('[FlexPay] Exception in checkFlexPayStatusAction:', err);
    return { success: false, status: 'unknown', error: err.message };
  }
}

import { TrafficForecast, HourlyForecast } from '@/lib/types';
import { MAJOR_AXES } from '@/lib/constants';

export async function getTrafficForecastAction(routeName: string): Promise<TrafficForecast> {
  // Heure et jour de Kinshasa (le serveur tourne en UTC)
  const { hour: currentHour, dayOfWeek: currentDayOfWeek } = kinshasaNow();
  
  // 1. État Actuel (Données en temps réel Google)
  const axis = MAJOR_AXES.find(a => a.name === routeName);
  let currentStatus: any = 'INCONNU';
  let currentDelay = 0;
  
  if (axis) {
    const liveData = await getGoogleTrafficStatusAction([axis]);
    if (liveData.length > 0) {
      currentStatus = liveData[0].status;
      currentDelay = liveData[0].delay;
    }
  }

  // Modèle heuristique par défaut calibré sur Kinshasa
  const heuristicStatus = (hour: number) => {
    if (hour >= 7 && hour <= 9) return { status: 'EMBOUTEILLAGE' as const, delay: 18 };
    if (hour >= 16 && hour <= 19) return { status: 'EMBOUTEILLAGE' as const, delay: 24 };
    if (hour >= 10 && hour <= 15) return { status: 'MODÉRÉ' as const, delay: 8 };
    if (hour >= 20 || hour <= 6) return { status: 'FLUIDE' as const, delay: 0 };
    return { status: 'DENSE' as const, delay: 12 };
  };

  // Convertir le retard moyen en statut textuel
  const delayToStatus = (delay: number): 'EMBOUTEILLAGE' | 'DENSE' | 'MODÉRÉ' | 'FLUIDE' => {
    if (delay >= 15) return 'EMBOUTEILLAGE';
    if (delay >= 8) return 'DENSE';
    if (delay >= 3) return 'MODÉRÉ';
    return 'FLUIDE';
  };

  // 2. Interrogation de l'historique Firestore pour chaque heure future
  const hourlyForecast: HourlyForecast[] = [];

  try {
    const firestore = getServerFirestore();
    const historyCol = collection(firestore, 'traffic_history');

    // Récupérer les données historiques enregistrées pour cet axe
    let historicalDocs: any[] = [];
    try {
      const q = query(
        historyCol,
        where('road', '==', routeName),
        limit(500)
      );
      const snap = await getDocs(q);
      // Les anciens relevés (sans champ `tz`) ont été enregistrés à l'heure UTC du serveur :
      // on les recale sur l'heure de Kinshasa (UTC+1).
      historicalDocs = snap.docs.map(d => {
        const h = d.data() as any;
        if (h.tz === 'Africa/Kinshasa' || typeof h.hourOfDay !== 'number') return h;
        const hour = (h.hourOfDay + 1) % 24;
        const dayOfWeek = hour === 0 && typeof h.dayOfWeek === 'number' ? (h.dayOfWeek + 1) % 7 : h.dayOfWeek;
        return { ...h, hourOfDay: hour, dayOfWeek };
      });
    } catch (dbErr) {
      console.warn('[Forecast] Erreur lecture traffic_history:', dbErr);
    }

    for (let i = 1; i <= 6; i++) {
      const targetHour = (currentHour + i) % 24;
      const timeStr = `${targetHour.toString().padStart(2, '0')}:00`;

      // 1. Chercher des relevés correspondant à cette heure et au même jour de la semaine
      let matchingRecords = historicalDocs.filter(d => 
        d.hourOfDay === targetHour && d.dayOfWeek === currentDayOfWeek
      );

      // 2. Si pas assez de données pour ce jour spécifique, élargir à tous les jours pour cette heure
      if (matchingRecords.length === 0) {
        matchingRecords = historicalDocs.filter(d => d.hourOfDay === targetHour);
      }

      let predictedDelay = 0;
      let predictedStatus: any = 'FLUIDE';

      if (matchingRecords.length > 0) {
        // Calcul de la moyenne historique observée
        const totalHistoricalDelay = matchingRecords.reduce((acc, curr) => acc + (Number(curr.delay) || 0), 0);
        const avgHistoricalDelay = Math.round(totalHistoricalDelay / matchingRecords.length);

        // Modèle hybride adaptatif :
        // Les 2 premières heures donnent plus de poids au trafic réel actuel
        // Les heures plus lointaines se basent davantage sur la moyenne historique
        const currentWeight = i <= 2 ? 0.45 : 0.2;
        const historicalWeight = 1 - currentWeight;

        predictedDelay = Math.max(0, Math.round((currentDelay * currentWeight) + (avgHistoricalDelay * historicalWeight)));
        predictedStatus = delayToStatus(predictedDelay);
      } else {
        // Fallback heuristique calibré Kinshasa
        const fallback = heuristicStatus(targetHour);
        predictedDelay = i <= 2 
          ? Math.round(0.5 * currentDelay + 0.5 * fallback.delay)
          : fallback.delay;
        predictedStatus = delayToStatus(predictedDelay);
      }

      hourlyForecast.push({
        time: timeStr,
        status: predictedStatus,
        delay: predictedDelay
      });
    }
  } catch (err) {
    console.error('[Forecast] Erreur modèle prédictif:', err);
    for (let i = 1; i <= 6; i++) {
      const nextHour = (currentHour + i) % 24;
      const fallback = heuristicStatus(nextHour);
      hourlyForecast.push({
        time: `${nextHour.toString().padStart(2, '0')}:00`,
        status: fallback.status,
        delay: fallback.delay
      });
    }
  }

  // 3. Alternatives : mesurées en direct quand l'axe est connu, sinon marquées « non mesuré ».
  const alternativesMap: Array<[string, string[]]> = [
    ['Lumumba', ['Poids Lourds', 'Ndjoku']],
    ['30 Juin', ['Justice', 'Mondjiba']],
    ['Matadi', ['Montagne', 'Tourisme']],
    ['Kasa-Vubu', ['Enseignement', 'Gambela']],
    ['Victoire', ['Enseignement', 'Gambela']],
    ['Mondjiba', ['Tourisme', 'École']],
    ['Université', ['Kapela', 'Kimwenza']],
  ];
  const altTerms = alternativesMap.find(([k]) => routeName.includes(k))?.[1] ?? [];
  const altAxes = altTerms
    .map(term => MAJOR_AXES.find(a => a.name.includes(term) && a.name !== routeName))
    .filter((a): a is (typeof MAJOR_AXES)[number] => Boolean(a));
  const measuredAlts = altAxes.length ? await getGoogleTrafficStatusAction(altAxes) : [];
  const alternatives = measuredAlts.map(m => ({
    road: m.road,
    delay: m.status === 'INCONNU' ? null : m.delay,
    status: m.status === 'INCONNU' ? 'NON MESURÉ' : m.status,
  }));

  return {
    road: routeName,
    currentStatus,
    currentDelay,
    hourlyForecast,
    alternatives
  };
}

/**
 * ============================================================================
 * K-FLOW E-WALLET & CONTRIBUTE-TO-EARN ACTIONS (Rémunération Citoyenne)
 * ============================================================================
 */

export async function getWalletTransactionsAction(idToken: string) {
  try {
    const { uid } = await verifyCaller(idToken);
    const snap = await adminDb().collection('users').doc(uid).collection('wallet_transactions')
      .orderBy('timestamp', 'desc').limit(15).get();
    return {
      success: true,
      transactions: snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          userId: uid,
          type: data.type || 'earning',
          source: data.source || 'incident_report',
          amountCDF: data.amountCDF || 0,
          amountUSD: data.amountUSD || 0,
          description: data.description || 'Gain K-Flow',
          road: data.road || null,
          status: data.status || 'completed',
          balanceAfterCDF: data.balanceAfterCDF || 0,
          timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now()
        };
      })
    };
  } catch (err: any) {
    console.warn('[getWalletTransactionsAction Error]:', err);
    return { success: false, transactions: [] };
  }
}

/**
 * Récompense une contribution RÉELLE et vérifiée, une seule fois :
 *  - 'upvote'         : refId = id du document traffic_votes créé par l'usager (vote 1-tap)
 *  - 'incident_report': refId = id d'un road_condition_reports créé par l'usager il y a moins de 2 h
 *
 * Elle donne :
 *  - des FC, dans la limite de DAILY_REWARD_CAP_CDF par jour (au-delà : 0 FC, mais l'XP reste) ;
 *  - de l'XP, la progression des missions du jour, la série de jours, les badges ;
 *  - des points de la semaine pour l'usager et sa commune (classement).
 * Tout est écrit dans une seule transaction serveur (Admin SDK) ; le client ne peut rien modifier.
 */
export async function awardWalletContributionAction(params: {
  idToken: string;
  type: 'incident_report' | 'upvote';
  refId: string;
  road?: string;
}) {
  try {
    const { uid } = await verifyCaller(params.idToken);
    const fullReward = REWARD_CDF[params.type];
    if (!fullReward || !params.refId) return { success: false, error: "Contribution non reconnue." };

    const db = adminDb();
    const day = kinshasaDayKey();
    const week = kinshasaWeekId();
    const sourceRef = params.type === 'upvote'
      ? db.collection('traffic_votes').doc(params.refId)
      : db.collection('road_condition_reports').doc(params.refId);
    const claimRef = db.collection('reward_claims').doc(`${params.type}_${params.refId}`);
    const userRef = db.collection('users').doc(uid);
    const dailyRef = db.collection('reward_daily').doc(`${uid}_${day}`);
    const missionRef = db.collection('missions').doc(`${uid}_${day}`);

    const outcome = await db.runTransaction(async (tx) => {
      const [sourceSnap, claimSnap, userSnap, dailySnap, missionSnap] = await Promise.all([
        tx.get(sourceRef), tx.get(claimRef), tx.get(userRef), tx.get(dailyRef), tx.get(missionRef),
      ]);
      if (!sourceSnap.exists) return { ok: false as const, error: "Contribution introuvable." };
      const source = sourceSnap.data() as any;
      if (source.userId !== uid) return { ok: false as const, error: "Cette contribution n'est pas la vôtre." };
      const createdMs = source.createdAt?.toMillis ? source.createdAt.toMillis() : 0;
      if (!createdMs || Date.now() - createdMs > 2 * 3600 * 1000) return { ok: false as const, error: "Contribution trop ancienne." };
      if (claimSnap.exists) return { ok: false as const, error: "Déjà récompensé." };
      if (!userSnap.exists) return { ok: false as const, error: "Utilisateur introuvable." };
      const user = userSnap.data() as any;
      if (user.isBlocked) return { ok: false as const, error: "Compte suspendu." };

      // --- FC (plafonnés)
      const earnedToday = dailySnap.exists ? Number(dailySnap.data()!.amountCDF || 0) : 0;
      const rewardCDF = earnedToday + fullReward <= DAILY_REWARD_CAP_CDF ? fullReward : 0;
      const newCDF = (user.walletBalanceCDF || 0) + rewardCDF;
      const newUSD = parseFloat((newCDF / CDF_PER_USD).toFixed(2));

      // --- Jeu : missions du jour
      const kind: MissionKind = params.type === 'incident_report' ? 'report' : 'vote';
      const mission = missionSnap.exists ? (missionSnap.data() as any) : { progress: {}, completed: [] };
      const progress: Record<string, number> = { ...(mission.progress || {}) };
      progress[kind] = (progress[kind] || 0) + 1;
      if (params.type === 'upvote' && source.vote === 'clear') progress.clearVote = (progress.clearVote || 0) + 1;
      const completed: string[] = [...(mission.completed || [])];
      let missionXp = 0;
      const newlyCompleted: string[] = [];
      for (const m of DAILY_MISSIONS) {
        if (!completed.includes(m.id) && (progress[m.kind] || 0) >= m.target) {
          completed.push(m.id);
          newlyCompleted.push(m.label);
          missionXp += m.xp;
        }
      }

      // --- Série de jours (1er geste de la journée)
      const yesterday = kinshasaDayKey(new Date(Date.now() - 24 * 3600 * 1000));
      const firstToday = user.lastActiveDay !== day;
      const streak = !firstToday ? (user.streakDays || 1) : user.lastActiveDay === yesterday ? (user.streakDays || 0) + 1 : 1;
      const streakXp = firstToday ? XP.streakDay : 0;

      // --- XP, niveau, badges
      const gainedXp = (params.type === 'incident_report' ? XP.report : XP.vote) + missionXp + streakXp;
      const xp = (user.xp || 0) + gainedXp;
      const level = levelFromXp(xp);
      const votes = (user.gameVotes || 0) + (params.type === 'upvote' ? 1 : 0);
      const reports = (user.gameReports || 0) + (params.type === 'incident_report' ? 1 : 0);
      const owned: string[] = user.badges || [];
      const newBadges = BADGES.filter(b => !owned.includes(b.id) && b.test({ votes, reports, streak, level }));
      const levelUp = level > levelFromXp(user.xp || 0);

      tx.create(claimRef, { userId: uid, type: params.type, refId: params.refId, amountCDF: rewardCDF, xp: gainedXp, createdAt: FieldValue.serverTimestamp() });
      if (rewardCDF > 0) tx.set(dailyRef, { userId: uid, amountCDF: earnedToday + rewardCDF, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(missionRef, { userId: uid, day, progress, completed, updatedAt: FieldValue.serverTimestamp() });
      tx.update(userRef, {
        walletBalanceCDF: newCDF,
        walletBalanceUSD: newUSD,
        totalContributionsCount: (user.totalContributionsCount || 0) + 1,
        lastEarningTimestamp: FieldValue.serverTimestamp(),
        xp,
        level,
        gameVotes: votes,
        gameReports: reports,
        streakDays: streak,
        lastActiveDay: day,
        badges: [...owned, ...newBadges.map(b => b.id)],
      });
      if (rewardCDF > 0) {
        tx.set(userRef.collection('wallet_transactions').doc(), {
          userId: uid,
          type: 'earning',
          source: params.type,
          amountCDF: rewardCDF,
          amountUSD: parseFloat((rewardCDF / CDF_PER_USD).toFixed(3)),
          description: params.type === 'upvote'
            ? `Confirmation état de la route (${params.road || 'carrefour'})`
            : `Signalement trafic (${params.road || 'Kinshasa'})`,
          road: params.road || null,
          refId: params.refId,
          status: 'completed',
          balanceAfterCDF: newCDF,
          timestamp: FieldValue.serverTimestamp(),
        });
      }

      // --- Classement de la semaine (points = XP gagnés cette semaine)
      const weekRef = db.collection('leaderboards').doc(week);
      tx.set(weekRef.collection('players').doc(uid), {
        uid,
        // Prénom seulement : le classement est visible par tous les usagers connectés.
        name: String(user.name || 'Kinois').trim().split(/\s+/)[0].slice(0, 20),
        commune: user.commune || null,
        isSentinel: user.isSentinel === true,
        points: FieldValue.increment(gainedXp),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (user.commune && COMMUNES.includes(user.commune)) {
        tx.set(weekRef.collection('communes').doc(user.commune), {
          commune: user.commune,
          points: FieldValue.increment(gainedXp),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      return { ok: true as const, newCDF, newUSD, rewardCDF, gainedXp, xp, level, levelUp, streak, newlyCompleted, newBadges: newBadges.map(b => b.label) };
    });

    if (!outcome.ok) return { success: false, error: outcome.error };
    return {
      success: true,
      rewardCDF: outcome.rewardCDF,
      newBalanceCDF: outcome.newCDF,
      newBalanceUSD: outcome.newUSD,
      xpGained: outcome.gainedXp,
      xp: outcome.xp,
      level: outcome.level,
      levelUp: outcome.levelUp,
      rank: rankFor(outcome.level),
      streak: outcome.streak,
      missionsCompleted: outcome.newlyCompleted,
      badgesUnlocked: outcome.newBadges,
      message: outcome.rewardCDF > 0
        ? `Bravo ! +${outcome.rewardCDF} FC et +${outcome.gainedXp} XP.`
        : `+${outcome.gainedXp} XP. Plafond de ${DAILY_REWARD_CAP_CDF} FC atteint aujourd'hui, merci quand même !`
    };
  } catch (err: any) {
    console.error('[E-Wallet Earning Error]:', err);
    return { success: false, error: authErrorMessage(err, "Erreur lors du versement de la récompense.") };
  }
}

/**
 * Demande de retrait Mobile Money. Le solde est débité tout de suite (transaction), et la demande
 * est enregistrée « en attente » : aucun virement automatique n'existe encore, l'équipe paie à la main.
 * (Avant : le statut était « completed » et le message annonçait un virement qui n'avait jamais lieu.)
 */
export async function requestWalletCashoutAction(params: {
  idToken: string;
  amountCDF: number;
  phone: string;
  operator: string;
}) {
  try {
    const { uid } = await verifyCaller(params.idToken);
    const amount = Math.floor(Number(params.amountCDF));
    if (!Number.isFinite(amount) || amount < MIN_CASHOUT_CDF) {
      return { success: false, error: "Le montant minimum de retrait est de " + MIN_CASHOUT_CDF + " FC." };
    }
    const phone = String(params.phone || '').replace(/\s+/g, '');
    if (!/^\+?\d{9,13}$/.test(phone)) return { success: false, error: "Numéro de téléphone invalide." };

    const db = adminDb();
    const userRef = db.collection('users').doc(uid);
    const requestRef = db.collection('cashout_requests').doc();

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return { ok: false as const, error: "Compte introuvable." };
      const user = snap.data() as any;
      if (user.isBlocked) return { ok: false as const, error: "Compte suspendu." };
      const current = user.walletBalanceCDF || 0;
      if (current < amount) return { ok: false as const, error: "Solde insuffisant. Vous possédez " + current + " FC." };
      const newCDF = current - amount;
      tx.update(userRef, { walletBalanceCDF: newCDF, walletBalanceUSD: parseFloat((newCDF / CDF_PER_USD).toFixed(2)) });
      tx.set(requestRef, {
        userId: uid,
        amountCDF: amount,
        amountUSD: parseFloat((amount / CDF_PER_USD).toFixed(2)),
        phone,
        operator: String(params.operator || ''),
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(userRef.collection('wallet_transactions').doc(), {
        userId: uid,
        type: 'cashout',
        source: 'mobile_money_withdrawal',
        amountCDF: -amount,
        amountUSD: -parseFloat((amount / CDF_PER_USD).toFixed(3)),
        description: "Retrait Mobile Money vers " + params.operator + " (" + phone + ")",
        phone,
        operator: params.operator,
        requestId: requestRef.id,
        status: 'pending',
        balanceAfterCDF: newCDF,
        timestamp: FieldValue.serverTimestamp(),
      });
      return { ok: true as const, newCDF };
    });

    if (!outcome.ok) return { success: false, error: outcome.error };
    return {
      success: true,
      newBalanceCDF: outcome.newCDF,
      message: "Demande de retrait de " + amount + " FC enregistrée vers " + params.operator + " (" + phone + "). Vous serez payé après vérification par l'équipe Kinshasa Flow."
    };
  } catch (err: any) {
    console.error('[Cashout Error]:', err);
    return { success: false, error: authErrorMessage(err, "Erreur lors du retrait.") };
  }
}

/** Forfait data payé avec le solde E-Wallet : prix du catalogue serveur, demande « en attente » de traitement manuel. */
export async function rechargeDataFromWalletAction(params: {
  idToken: string;
  phone: string;
  dataPack: string;
}) {
  try {
    const { uid } = await verifyCaller(params.idToken);
    const price = DATA_PACK_CATALOG[params.dataPack];
    if (!price) return { success: false, error: "Forfait inconnu." };
    const phone = String(params.phone || '').replace(/\s+/g, '');
    if (!/^\+?\d{9,13}$/.test(phone)) return { success: false, error: "Ajoutez un numéro de téléphone valide à votre profil." };

    const db = adminDb();
    const userRef = db.collection('users').doc(uid);
    const requestRef = db.collection('data_recharge_requests').doc();

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return { ok: false as const, error: "Compte introuvable." };
      const user = snap.data() as any;
      if (user.isBlocked) return { ok: false as const, error: "Compte suspendu." };
      const current = user.walletBalanceCDF || 0;
      if (current < price) return { ok: false as const, error: "Solde insuffisant pour ce forfait (" + price + " FC)." };
      const newCDF = current - price;
      tx.update(userRef, { walletBalanceCDF: newCDF, walletBalanceUSD: parseFloat((newCDF / CDF_PER_USD).toFixed(2)) });
      tx.set(requestRef, { userId: uid, dataPack: params.dataPack, amountCDF: price, phone, status: 'pending', createdAt: FieldValue.serverTimestamp() });
      tx.set(userRef.collection('wallet_transactions').doc(), {
        userId: uid,
        type: 'conversion',
        source: 'data_recharge',
        amountCDF: -price,
        description: "Recharge Forfait Internet : " + params.dataPack + " pour " + phone,
        phone,
        requestId: requestRef.id,
        status: 'pending',
        balanceAfterCDF: newCDF,
        timestamp: FieldValue.serverTimestamp(),
      });
      return { ok: true as const, newCDF };
    });

    if (!outcome.ok) return { success: false, error: outcome.error };
    return {
      success: true,
      newBalanceCDF: outcome.newCDF,
      message: "Demande de forfait " + params.dataPack + " enregistrée pour le " + phone + ". Il sera activé après traitement par l'équipe."
    };
  } catch (err: any) {
    console.error('[Data Recharge Error]:', err);
    return { success: false, error: authErrorMessage(err, "Erreur lors de la recharge de mégas.") };
  }
}


/**
 * ============================================================================
 * REAL-TIME COMMAND DASHBOARD ACTION (Télémétrie Live Kinshasa Sans Mock)
 * ============================================================================
 */

let dashboardCache: { data: any; expires: number } | null = null;

/**
 * Récupère la télémétrie routière temps réel d'un segment (Google Routes API v2 en priorité, fallback OSRM).
 */
async function fetchSegmentTelemetry(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  rushMult: number,
  isPeakHour: boolean,
  opts: { via?: { lat: number; lng: number }; preference?: "TRAFFIC_AWARE" | "TRAFFIC_AWARE_OPTIMAL" } = {}
) {
  if (GOOGLE_API_KEY) {
    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_API_KEY,
          "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters"
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
          // point de passage (sans arrêt) pour que l'itinéraire reste sur l'avenue mesurée
          ...(opts.via ? { intermediates: [{ via: true, location: { latLng: { latitude: opts.via.lat, longitude: opts.via.lng } } }] } : {}),
          travelMode: "DRIVE",
          routingPreference: opts.preference ?? "TRAFFIC_AWARE_OPTIMAL",
          languageCode: "fr-FR"
        })
      });

      if (res.ok) {
        const gData = await res.json();
        const route = gData?.routes?.[0];
        if (route) {
          const distKm = Math.round(((route.distanceMeters || 1000) / 1000) * 10) / 10;
          const liveSec = parseInt((route.duration ?? "60s").replace("s", ""), 10) || 60;
          const baseSec = parseInt((route.staticDuration ?? route.duration ?? "60s").replace("s", ""), 10) || liveSec;
          const durationMin = Math.max(1, Math.round(liveSec / 60));
          const delayMin = Math.max(0, Math.round((liveSec - baseSec) / 60));
          const speedKmh = Math.max(4, Math.round(distKm / (liveSec / 3600)));
          const ratio = baseSec > 0 ? liveSec / baseSec : 1;
          return { distKm, durationMin, delayMin, speedKmh, ratio, source: "google" as const, isEstimated: false };
        }
      }
    } catch (err) {
      console.warn("[Dashboard] Google Routes bypass -> OSRM:", err);
    }
  }

  const viaPart = opts.via ? `${opts.via.lng},${opts.via.lat};` : "";
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${viaPart}${dest.lng},${dest.lat}?overview=false`;
  const res = await fetch(url, { headers: { "User-Agent": "KinshasaFlow/2.0" } });
  const data = await res.json();
  const r = data?.routes?.[0];

  const distKm = r ? Math.round((r.distance / 1000) * 10) / 10 : 5.0;
  const baseDurationMin = r ? r.duration / 60 : 10;
  const multiplier = isPeakHour ? rushMult : 1.15;
  const durationMin = Math.max(1, Math.round(baseDurationMin * multiplier));
  const delayMin = Math.max(0, durationMin - Math.round(baseDurationMin));
  const speedKmh = Math.max(4, Math.round(distKm / (durationMin / 60)));
  // Pas de mesure de trafic : durée « route vide » OSRM × facteur horaire. C'est une estimation.
  return { distKm, durationMin, delayMin, speedKmh, ratio: multiplier, source: "estimate" as const, isEstimated: true };
}

/**
 * Mesure en direct des 20 axes chargés (lib/corridors) qui n'ont pas de carrefour mesuré,
 * plus les points noirs sans carrefour. Cache de 5 min, indépendant du tableau de bord (90 s)
 * et jamais forcé par un vote : ~14 appels Google Routes toutes les 5 minutes au plus.
 */
type CorridorState = {
  status: string; delayMin: number | null; speedKmh: number | null; distKm: number | null;
  source: string; isLive: boolean; confidence: number; reportType?: string | null;
};
let corridorCache: { data: Record<string, CorridorState>; expires: number } | null = null;

function corridorStatus(delayMin: number, ratio: number) {
  // tronçons courts (1 à 3 km) : on regarde surtout le rapport temps réel / temps à vide
  if (ratio >= 2.2 || delayMin >= 10) return "BLOQUÉ";
  if (ratio >= 1.6 || delayMin >= 5) return "EMBOUTEILLAGE";
  if (ratio >= 1.25 || delayMin >= 2) return "MODÉRÉ";
  return "FLUIDE";
}

async function getCorridorStates(isPeakHour: boolean, activeReports: any[]): Promise<Record<string, CorridorState>> {
  const now = Date.now();
  if (!corridorCache || corridorCache.expires <= now) {
    const targets = [
      ...MEASURED_SEGMENTS.map(c => ({ id: c.id, seg: c.seg! })),
      ...BLACK_SPOTS.filter(b => b.seg && !b.nodeId).map(b => ({ id: b.id, seg: b.seg! })),
    ];
    const pt = (p: [number, number]) => ({ lat: p[0], lng: p[1] });
    const entries = await Promise.all(targets.map(async ({ id, seg }) => {
      try {
        const m = await fetchSegmentTelemetry(pt(seg.o), pt(seg.d), 2.0, isPeakHour, { via: seg.v ? pt(seg.v) : undefined, preference: "TRAFFIC_AWARE" });
        const isLive = m.source === "google";
        const status = corridorStatus(m.delayMin, m.ratio);
        const congested = status === "BLOQUÉ" || status === "EMBOUTEILLAGE";
        return [id, { status, delayMin: m.delayMin, speedKmh: m.speedKmh, distKm: m.distKm, source: m.source, isLive, confidence: confidenceScore(isLive, congested, 0) }] as const;
      } catch {
        return [id, { status: "INCONNU", delayMin: null, speedKmh: null, distKm: null, source: "none", isLive: false, confidence: 0 }] as const;
      }
    }));
    corridorCache = { data: Object.fromEntries(entries), expires: now + 5 * 60 * 1000 };
  }

  // Signalements récents à moins de ~1 km du milieu du tronçon : appliqués à chaque appel (pas mis en cache).
  const out: Record<string, CorridorState> = {};
  const mids: Record<string, [number, number]> = Object.fromEntries([
    ...MEASURED_SEGMENTS.map(c => [c.id, segMid(c.seg!)] as const),
    ...BLACK_SPOTS.filter(b => b.seg && !b.nodeId).map(b => [b.id, segMid(b.seg!)] as const),
  ]);
  for (const [id, st] of Object.entries(corridorCache.data)) {
    const mid = mids[id];
    const near = mid ? activeReports.find(r => Math.abs(r.coords.lat - mid[0]) < 0.009 && Math.abs(r.coords.lng - mid[1]) < 0.009) : null;
    let status = st.status;
    if (near && near.type === 'blockage' && (status === "FLUIDE" || status === "MODÉRÉ")) status = "EMBOUTEILLAGE";
    out[id] = { ...st, status, reportType: near?.type ?? null };
  }
  return out;
}

export async function getRealtimeCommandDashboardAction(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && dashboardCache && dashboardCache.expires > now) {
    return dashboardCache.data;
  }

  const kin = kinshasaNow();
  const kinshasaHour = kin.hour;
  const isPeakHour = kin.isPeakHour;

  // 1. Signalements récents (< 1 h) et votes 1-tap de la dernière heure
  const [activeReports, votesByNode] = await Promise.all([loadFreshReports(), loadRecentVotes()]);

  // 2. Définition des 8 goulots stratégiques avec coordonnées exactes
  const BOTTLENECK_NODES = [
    {
      id: "limete-echangeur",
      name: "Échangeur de Limete",
      district: "Limete / Nœud Est",
      origin: { lat: -4.3570, lng: 15.3580 },
      dest: { lat: -4.3350, lng: 15.3350 },
      baseRushFactor: 2.9,
      escape: "Av. des Poids Lourds via Kingabwa (dégagée)",
      defaultCause: "Ralentissement important causé par la manœuvre de minibus et rétrécissement du pont.",
      lingala: "Echangeur eza bloqué, leka na Kingabwa soki likoki eza."
    },
    {
      id: "kintambo-magasin",
      name: "Kintambo Magasin",
      district: "Ngaliema / Nœud Ouest",
      origin: { lat: -4.3270, lng: 15.2740 },
      dest: { lat: -4.3120, lng: 15.2980 },
      baseRushFactor: 2.5,
      escape: "Av. du Tourisme le long des berges du fleuve",
      defaultCause: "Régulation manuelle intense des roulages et refoulement vers Mondjiba.",
      lingala: "Magasin eza pasi na ba roulages, leka na Berges."
    },
    {
      id: "matadi-upn",
      name: "Route de Matadi (UPN)",
      district: "Ngaliema / Sortie Ouest",
      origin: { lat: -4.3800, lng: 15.2580 },
      dest: { lat: -4.3400, lng: 15.2680 },
      baseRushFactor: 2.6,
      escape: "Avenue de la Montagne vers Météo",
      defaultCause: "Chaussée dégradée, nids-de-poule et stationnements anarchiques de motards.",
      lingala: "UPN nzela ebeba, mituka ezali kotambola malembe."
    },
    {
      id: "lumumba-pascal",
      name: "Boulevard Lumumba (Pascal)",
      district: "Masina / Tchangu",
      origin: { lat: -4.3850, lng: 15.4200 },
      dest: { lat: -4.3570, lng: 15.3580 },
      baseRushFactor: 3.1,
      escape: "Route Mokali vers Kimbanseke ou rail Transco",
      defaultCause: "Déversement du marché de rue et arrêts de minibus 207 en double file.",
      lingala: "Pascal eza tcha, mituka etelemi mobimba."
    },
    {
      id: "bypass-triangle",
      name: "Avenue By-Pass (Triangle)",
      district: "Lemba / Mont-Ngafula",
      origin: { lat: -4.4100, lng: 15.3150 },
      dest: { lat: -4.3550, lng: 15.3180 },
      baseRushFactor: 2.0,
      escape: "Avenue Elengesa (récemment asphaltée et fluide)",
      defaultCause: "Affluence piétonne marchande et taxis en stationnement sauvage.",
      lingala: "Triangle eza modéré, leka na Elengesa soki okomi."
    },
    {
      id: "mandela-30juin",
      name: "Rond-point Mandela (Blvd 30 Juin)",
      district: "Gombe / Cœur de ville",
      origin: { lat: -4.3120, lng: 15.2980 },
      dest: { lat: -4.3042, lng: 15.3150 },
      baseRushFactor: 1.9,
      escape: "Avenue de la Justice ou Avenue de la Science",
      defaultCause: "Sorties des ministères et flux vers Batetela.",
      lingala: "30 Juin eza mwa pasi moke, banzela ya pembeni eza liboso."
    },
    {
      id: "kalamu-victoire",
      name: "Avenue Kasa-Vubu (Victoire)",
      district: "Kalamu / Centre",
      origin: { lat: -4.3430, lng: 15.3120 },
      dest: { lat: -4.3140, lng: 15.3020 },
      baseRushFactor: 2.2,
      escape: "Avenue de l'Enseignement vers Stade des Martyrs",
      defaultCause: "Forte affluence piétonne et commerces de rue aux abords du carrefour.",
      lingala: "Victoire bato baza mingi na nzela, zela moke."
    },
    {
      id: "universite-pontgabu",
      name: "Av. de l'Université (Pont Gabu)",
      district: "Kalamu / Limete",
      origin: { lat: -4.3550, lng: 15.3180 },
      dest: { lat: -4.3400, lng: 15.3350 },
      baseRushFactor: 1.4,
      escape: "Axe direct praticable",
      defaultCause: "Circulation libre à modérée, aucun incident majeur signalé sur le pont.",
      lingala: "Pont Gabu eza kitoko lelo, nzela efungwami."
    }
  ];

  // Calcul télémétrique en parallèle pour les 8 goulots
  const bottlenecks = await Promise.all(BOTTLENECK_NODES.map(async (node) => {
    const activeIncidents = activeReports.filter(rep =>
      Math.abs(rep.coords.lat - node.origin.lat) < 0.025 &&
      Math.abs(rep.coords.lng - node.origin.lng) < 0.025
    );
    const matchingReport = activeIncidents[0];
    const votes = votesByNode[node.id] ?? { still: 0, clear: 0, lastAgeMin: null };
    const base = {
      id: node.id,
      name: node.name,
      district: node.district,
      coords: node.origin,
      activeIncidents,
      votes,
      // Cause confirmée seulement si un signalement récent existe ; sinon on affiche la cause habituelle, marquée comme telle.
      cause: matchingReport ? matchingReport.description : null,
      causeAgeMin: matchingReport ? matchingReport.ageMin : null,
      typicalCause: node.defaultCause,
      certifiedAlt: node.escape,
      lingala: node.lingala
    };

    try {
      const seg = await fetchSegmentTelemetry(node.origin, node.dest, node.baseRushFactor, isPeakHour);
      const isLive = seg.source === "google";

      let status = "FLUIDE";
      if (seg.delayMin >= 20 || seg.ratio >= 2.2) status = "BLOQUÉ";
      else if (seg.delayMin >= 8 || seg.ratio >= 1.6) status = "EMBOUTEILLAGE";
      else if (seg.delayMin >= 3 || seg.ratio >= 1.2) status = "MODÉRÉ";

      // Un signalement de blocage récent l'emporte sur une mesure fluide.
      if (matchingReport && matchingReport.type === 'blockage' && (status === "FLUIDE" || status === "MODÉRÉ")) status = "EMBOUTEILLAGE";

      // Sans mesure en direct, les votes récents des usagers sur place (≥ 2) décident du statut.
      if (!isLive && votes.still + votes.clear >= 2) {
        if (votes.clear > votes.still) status = "FLUIDE";
        else if (votes.still > votes.clear && (status === "FLUIDE" || status === "MODÉRÉ")) status = "EMBOUTEILLAGE";
      }

      const congested = status === "BLOQUÉ" || status === "EMBOUTEILLAGE";
      return {
        ...base,
        // La phrase en lingala du nœud décrit un blocage : on ne la dit que si c'est bloqué.
        lingala: congested ? node.lingala : "Nzela efungwami awa, kende malamu.",
        distKm: seg.distKm,
        durationMin: seg.durationMin,
        delayMin: seg.delayMin,
        speedKmh: seg.speedKmh,
        source: seg.source,
        isLive,
        confidence: confidenceScore(isLive, congested, activeIncidents.length, votes),
        status
      };
    } catch (err) {
      // Aucune source disponible : on le dit, au lieu d'inventer un « modéré +10 min ».
      return {
        ...base,
        distKm: null,
        durationMin: null,
        delayMin: null,
        speedKmh: null,
        source: "none",
        isLive: false,
        confidence: 0,
        status: "INCONNU"
      };
    }
  }));

  // GPS anonyme des usagers volontaires et des flottes partenaires (15 dernières minutes).
  // À partir de 3 contributeurs distincts, c'est une mesure en direct à part entière.
  const probes = await loadRecentProbeSpeeds();
  for (const b of bottlenecks as any[]) {
    const p = probes[b.id];
    if (!p) continue;
    b.probe = p;
    if (p.contributors >= 3) {
      if (!b.isLive) {
        b.status = statusFromSpeed(p.speedKmh);
        b.speedKmh = p.speedKmh;
        b.delayMin = null; // pas de temps « route vide » fiable pour calculer un retard
        b.source = 'gps';
        b.isLive = true;
      }
      b.confidence = Math.min(98, Math.max(b.confidence || 0, 60) + 15);
    }
  }

  // Détours vérifiés en direct (repris de main) : mesurés seulement quand le carrefour est chargé,
  // pour ne pas doubler les appels Google quand tout roule.
  const DETOURS: Record<string, { name: string; o: { lat: number; lng: number }; d: { lat: number; lng: number } }> = {
    "limete-echangeur": { name: "Av. des Poids Lourds via Kingabwa", o: { lat: -4.3150, lng: 15.3400 }, d: { lat: -4.3350, lng: 15.3550 } },
    "kintambo-magasin": { name: "Av. du Tourisme (berges)", o: { lat: -4.3310, lng: 15.2420 }, d: { lat: -4.3250, lng: 15.2650 } },
    "matadi-upn": { name: "Avenue de la Montagne", o: { lat: -4.3450, lng: 15.2650 }, d: { lat: -4.3300, lng: 15.2600 } },
    "lumumba-pascal": { name: "Av. Ndjoku (Masina)", o: { lat: -4.3750, lng: 15.4100 }, d: { lat: -4.3900, lng: 15.4300 } },
    "bypass-triangle": { name: "Avenue Elengesa", o: { lat: -4.3520, lng: 15.3200 }, d: { lat: -4.3600, lng: 15.3350 } },
    "mandela-30juin": { name: "Avenue de la Justice", o: { lat: -4.3030, lng: 15.2940 }, d: { lat: -4.3070, lng: 15.3020 } },
    "kalamu-victoire": { name: "Avenue de l'Enseignement", o: { lat: -4.3400, lng: 15.3050 }, d: { lat: -4.3480, lng: 15.3150 } },
    "universite-pontgabu": { name: "Avenue Kapela", o: { lat: -4.3500, lng: 15.3100 }, d: { lat: -4.3650, lng: 15.3150 } },
  };
  await Promise.all((bottlenecks as any[]).map(async b => {
    const det = DETOURS[b.id];
    if (!det || !(b.status === "BLOQUÉ" || b.status === "EMBOUTEILLAGE")) return;
    try {
      const alt = await fetchSegmentTelemetry(det.o, det.d, 1.6, isPeakHour);
      const mainDelay = typeof b.delayMin === "number" ? b.delayMin : Infinity;
      b.altName = det.name;
      b.altDelayMin = alt.delayMin;
      b.altSpeedKmh = alt.speedKmh;
      b.altSource = alt.source;
      b.altIsBetter = alt.delayMin < mainDelay && (typeof b.speedKmh !== "number" || alt.speedKmh > b.speedKmh);
    } catch { /* détour non vérifié : on garde la voie bis habituelle */ }
  }));

  // Panneau « Pourquoi » : signalements, événements, votes, GPS et météo réels
  const [weather, trafficEvents] = await Promise.all([loadKinshasaWeather(), loadActiveTrafficEvents()]);
  for (const b of bottlenecks as any[]) b.why = buildWhy(b, { weather, events: trafficEvents });

  // 3. Calcul des 4 trajets quotidiens (1-Tap Commutes) en télémétrie live
  const COMMUTE_NODES = [
    {
      id: "upn-gombe",
      title: "UPN ➔ Gombe (Centre-Ville)",
      via: "Route de Matadi & 30 Juin",
      origin: { lat: -4.3800, lng: 15.2580 },
      dest: { lat: -4.3042, lng: 15.3150 },
      rushMult: 2.7,
      escape: "Prendre Av. du Tourisme via les Berges du Fleuve"
    },
    {
      id: "masina-gombe",
      title: "Masina / Tchangu ➔ Gombe",
      via: "Boulevard Lumumba & Limete",
      origin: { lat: -4.3850, lng: 15.4200 },
      dest: { lat: -4.3042, lng: 15.3150 },
      rushMult: 3.1,
      escape: "Bifurquer vers Poids Lourds à Kingabwa"
    },
    {
      id: "lemba-gombe",
      title: "Lemba / Triangle ➔ Gombe",
      via: "By-Pass & Av. Université",
      origin: { lat: -4.4100, lng: 15.3150 },
      dest: { lat: -4.3042, lng: 15.3150 },
      rushMult: 2.1,
      escape: "Emprunter la nouvelle Avenue Elengesa"
    },
    {
      id: "kintambo-gombe",
      title: "Kintambo Magasin ➔ Gombe",
      via: "Avenue Mondjiba",
      origin: { lat: -4.3270, lng: 15.2740 },
      dest: { lat: -4.3042, lng: 15.3150 },
      rushMult: 2.4,
      escape: "Prendre l'Avenue de l'OUA ou Av. du Port"
    }
  ];

  const COMMUTE_DETOURS: Record<string, { o: { lat: number; lng: number }; d: { lat: number; lng: number } }> = {
    "upn-gombe": { o: { lat: -4.3310, lng: 15.2420 }, d: { lat: -4.3042, lng: 15.3150 } },
    "masina-gombe": { o: { lat: -4.3150, lng: 15.3400 }, d: { lat: -4.3042, lng: 15.3150 } },
    "lemba-gombe": { o: { lat: -4.3520, lng: 15.3200 }, d: { lat: -4.3042, lng: 15.3150 } },
    "kintambo-gombe": { o: { lat: -4.3220, lng: 15.2700 }, d: { lat: -4.3042, lng: 15.3150 } },
  };

  const commutes = await Promise.all(COMMUTE_NODES.map(async (c) => {
    try {
      const seg = await fetchSegmentTelemetry(c.origin, c.dest, c.rushMult, isPeakHour);
      const isLive = seg.source === "google";

      let status = "FLUIDE";
      let badgeColor = "bg-emerald-500";
      if (seg.delayMin >= 25 || seg.ratio >= 2.3) {
        status = "BLOQUÉ";
        badgeColor = "bg-purple-600";
      } else if (seg.delayMin >= 10 || seg.ratio >= 1.6) {
        status = "EMBOUTEILLAGE";
        badgeColor = "bg-red-500";
      } else if (seg.delayMin >= 3 || seg.ratio >= 1.2) {
        status = "MODÉRÉ";
        badgeColor = "bg-amber-500";
      }

      // Échappatoire vérifiée en direct quand le trajet est chargé (repris de main)
      let escape = c.escape;
      const det = COMMUTE_DETOURS[c.id];
      if (det && (status === "BLOQUÉ" || status === "EMBOUTEILLAGE")) {
        try {
          const alt = await fetchSegmentTelemetry(det.o, det.d, Math.max(1.2, c.rushMult * 0.7), isPeakHour);
          const tag = alt.source === "google" ? "mesuré en direct" : "estimation";
          escape = alt.durationMin < seg.durationMin
            ? `${c.escape} — vérifié plus rapide : ${alt.durationMin} min au lieu de ${seg.durationMin} (${tag})`
            : `${c.escape} — aussi chargé : ${alt.durationMin} min (${tag})`;
        } catch { /* on garde l'échappatoire habituelle */ }
      }

      return {
        id: c.id,
        title: c.title,
        via: c.via,
        coords: c.origin,
        distKm: seg.distKm,
        durMin: seg.durationMin,
        delayMin: seg.delayMin,
        delayText: seg.delayMin > 0 ? `${isLive ? '' : '~'}+${seg.delayMin} min` : "Fluide",
        status,
        badgeColor,
        source: seg.source,
        isLive,
        confidence: confidenceScore(isLive, status === "BLOQUÉ" || status === "EMBOUTEILLAGE", 0),
        escape
      };
    } catch {
      return {
        id: c.id,
        title: c.title,
        via: c.via,
        coords: c.origin,
        distKm: null,
        durMin: null,
        delayMin: null,
        delayText: "Pas de données",
        status: "INCONNU",
        badgeColor: "bg-slate-400",
        source: "none",
        isLive: false,
        confidence: 0,
        escape: c.escape
      };
    }
  }));

  // 4. Synthèse globale de la ville (uniquement sur les nœuds qui ont une donnée)
  const known = bottlenecks.filter(b => b.status !== "INCONNU" && typeof b.speedKmh === "number");
  const avgSpeed = known.length ? Math.round(known.reduce((a, b) => a + (b.speedKmh as number), 0) / known.length) : null;
  const blockedCount = known.filter(b => b.status === "BLOQUÉ" || b.status === "EMBOUTEILLAGE").length;
  const congestionIndex = known.length ? Math.round((blockedCount / known.length) * 100) : null;
  const liveCount = bottlenecks.filter(b => b.isLive).length;
  const totalVotes = Object.values(votesByNode).reduce((a, v) => a + v.still + v.clear, 0);

  const telemetrySource = liveCount === bottlenecks.length
    ? `Mesure en direct Google Routes (${liveCount}/${bottlenecks.length})`
    : liveCount > 0
      ? `Mesure en direct sur ${liveCount}/${bottlenecks.length} nœuds, estimations ailleurs`
      : "Estimations selon l'heure : mesure en direct indisponible";

  // Flash vocal : ne dit « cause » que si elle est confirmée par un signalement récent.
  const worstNode = known.find(b => b.status === "BLOQUÉ") || known.find(b => b.status === "EMBOUTEILLAGE") || known[0] || bottlenecks[0];
  const causeText = worstNode.cause
    ? `Cause signalée il y a ${worstNode.causeAgeMin} minutes : ${worstNode.cause}.`
    : `Aucune cause signalée pour l'instant ; d'habitude : ${worstNode.typicalCause}`;
  const delayText = typeof worstNode.delayMin === "number"
    ? `${worstNode.isLive ? '' : 'environ '}${worstNode.delayMin} minutes de retard`
    : "pas de mesure disponible";
  const worstCongested = worstNode.status === "BLOQUÉ" || worstNode.status === "EMBOUTEILLAGE";
  const audioFlashText = worstCongested
    ? `Flash Info Kinshasa Flow. À ${kinshasaHour} heures, ${worstNode.name} est ${worstNode.status.toLowerCase()}, ${delayText}. ${causeText} Alternative conseillée : ${worstNode.certifiedAlt}. ${worstNode.lingala}`
    : `Flash Info Kinshasa Flow. À ${kinshasaHour} heures, aucun des ${bottlenecks.length} grands carrefours suivis n'est embouteillé. ${liveCount} sur ${bottlenecks.length} sont mesurés en direct. Nzela efungwami, kende malamu.`;

  const corridors = await getCorridorStates(isPeakHour, activeReports);

  const payload = {
    success: true,
    bottlenecks,
    commutes,
    corridors,
    globalMetrics: {
      kinshasaHour,
      isPeakHour,
      avgSpeed,
      congestionIndex,
      activeIncidentsCount: activeReports.length,
      votesLastHour: totalVotes,
      weather,
      activeEventsCount: trafficEvents.length,
      liveCount,
      nodeCount: bottlenecks.length,
      telemetrySource,
      updatedAt: kin.timeLabel,
      audioFlashText
    }
  };

  dashboardCache = { data: payload, expires: Date.now() + 90 * 1000 };
  return payload;
}

/**
 * Trouve les coordonnées d'une avenue tapée par l'usager.
 * 1) référentiel interne MAJOR_AXES (sans accents ni casse) ; 2) Google Geocoding limité à Kinshasa.
 * Avant ce correctif, toute recherche analysait le même point fixe (-4.325, 15.31).
 */
export async function locateAxisAction(rawQuery: string): Promise<
  { found: true; name: string; lat: number; lng: number; source: 'référentiel' | 'google' } | { found: false }
> {
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const q = norm(rawQuery || '');
  if (q.length < 2) return { found: false };

  const words = q.split(' ').filter(w => w.length > 2 && !['avenue', 'boulevard', 'blvd', 'route', 'rue'].includes(w));
  const scored = MAJOR_AXES
    .map(a => {
      const n = norm(`${a.name} ${a.district}`);
      const score = n.includes(q) ? 100 : words.filter(w => n.includes(w)).length;
      return { a, score };
    })
    .filter(x => x.score > 0)
    // À score égal, le nom le plus court est le plus précis (« Av. des Poids Lourds » avant « Blvd Lumumba (Poids Lourds Junction) »).
    .sort((x, y) => y.score - x.score || x.a.name.length - y.a.name.length);
  if (scored.length) {
    const a = scored[0].a;
    return { found: true, name: a.name, lat: a.origin.lat, lng: a.origin.lng, source: 'référentiel' };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(rawQuery + ', Kinshasa')}` +
      `&bounds=-4.55,15.15|-4.25,15.60&region=cd&language=fr&key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const hit = data?.results?.[0];
      const loc = hit?.geometry?.location;
      // On refuse un résultat hors de Kinshasa, ou la ville entière (réponse de Google quand il ne trouve pas la rue).
      const tooVague = (hit?.types || []).some((t: string) => ['locality', 'political', 'administrative_area_level_1', 'administrative_area_level_2', 'country'].includes(t));
      if (loc && !tooVague && loc.lat < -4.25 && loc.lat > -4.6 && loc.lng > 15.1 && loc.lng < 15.65) {
        return { found: true, name: hit.formatted_address?.split(',')[0] || rawQuery, lat: loc.lat, lng: loc.lng, source: 'google' };
      }
    }
  } catch (err) {
    console.warn('[locateAxis] géocodage indisponible:', err);
  }
  return { found: false };
}

/** Nœud de la carte → axe enregistré dans traffic_history (MAJOR_AXES). */
const NODE_HISTORY_AXIS: Record<string, string> = {
  'limete-echangeur': 'Échangeur de Limete (Nœud)',
  'kintambo-magasin': 'Av. Mondjiba (Kintambo Magasin)',
  'matadi-upn': 'Route de Matadi (UPN)',
  'lumumba-pascal': 'Blvd Lumumba (Masina Pascal)',
  'bypass-triangle': 'Av. By-Pass (Triangle)',
  'mandela-30juin': 'Blvd 30 Juin (Rond-point Mandela)',
  'kalamu-victoire': 'Av. Kasa-Vubu (Victoire)',
  'universite-pontgabu': "Av. de l'Université (Pont Gabu)",
};

let cityForecastCache: { data: any; expires: number } | null = null;

/**
 * Prévision +1 h / +2 h pour les 8 nœuds de la carte, à partir de l'historique réel
 * (même heure, même jour de semaine en priorité, heure de Kinshasa).
 * Sans assez de relevés (< 3), on renvoie delay = null : la carte affiche « pas assez d'historique »
 * au lieu d'inventer une couleur.
 */
export async function getCityForecastAction(): Promise<{
  generatedAt: string;
  nodes: Record<string, Array<{ offsetH: number; hour: number; delay: number | null; samples: number }>>;
}> {
  if (cityForecastCache && cityForecastCache.expires > Date.now()) return cityForecastCache.data;
  const kin = kinshasaNow();
  const firestore = getServerFirestore();
  const nodes: Record<string, Array<{ offsetH: number; hour: number; delay: number | null; samples: number }>> = {};

  await Promise.all(Object.entries(NODE_HISTORY_AXIS).map(async ([nodeId, road]) => {
    let docs: any[] = [];
    try {
      const snap = await getDocs(query(collection(firestore, 'traffic_history'), where('road', '==', road), limit(500)));
      docs = snap.docs.map(d => {
        const h = d.data() as any;
        if (h.tz === 'Africa/Kinshasa' || typeof h.hourOfDay !== 'number') return h;
        const hour = (h.hourOfDay + 1) % 24; // anciens relevés en UTC
        return { ...h, hourOfDay: hour, dayOfWeek: hour === 0 && typeof h.dayOfWeek === 'number' ? (h.dayOfWeek + 1) % 7 : h.dayOfWeek };
      });
    } catch (err) {
      console.warn('[CityForecast] lecture impossible:', road, err);
    }
    nodes[nodeId] = [1, 2].map(offsetH => {
      const hour = (kin.hour + offsetH) % 24;
      const dow = kin.hour + offsetH >= 24 ? (kin.dayOfWeek + 1) % 7 : kin.dayOfWeek;
      let match = docs.filter(d => d.hourOfDay === hour && d.dayOfWeek === dow && typeof d.delay === 'number');
      if (match.length < 3) match = docs.filter(d => d.hourOfDay === hour && typeof d.delay === 'number');
      if (match.length < 3) return { offsetH, hour, delay: null, samples: match.length };
      const delay = Math.round(match.reduce((a, d) => a + Number(d.delay), 0) / match.length);
      return { offsetH, hour, delay, samples: match.length };
    });
  }));

  const data = { generatedAt: kin.timeLabel, nodes };
  cityForecastCache = { data, expires: Date.now() + 10 * 60 * 1000 };
  return data;
}
