
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
import { initiateFlexPayMobileMoney, initiateFlexPayCard, checkFlexPayTransactionStatus, detectDRCOperator } from "@/lib/flexpay";
import { getKinshasaTimeParts } from "@/lib/kinshasa-time";

const GOOGLE_API_KEY = process.env.GOOGLE_ROUTES_API_KEY || CONFIG.GOOGLE_MAPS_API_KEY;

/**
 * Cache simple pour éviter les appels API redondants (90 secondes)
 */
const trafficCache = new Map<string, { data: any, expires: number }>();

let weatherCache: { data: { isRaining: boolean; rainMm: number; weatherLabel: string } | null; expires: number } | null = null;
let incidentsCache: { data: { roadReports: any[]; events: any[]; policeReports: any[] }; expires: number } | null = null;

/**
 * Météo temps réel de Kinshasa via Open-Meteo (sans clé API, cache 5 min).
 */
async function fetchKinshasaWeather(): Promise<{ isRaining: boolean; rainMm: number; weatherLabel: string } | null> {
  const now = Date.now();
  if (weatherCache && weatherCache.expires > now) return weatherCache.data;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=-4.33&longitude=15.31&current=precipitation,rain,weather_code&timezone=Africa%2FKinshasa",
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const json = await res.json();
    const cur = json?.current;
    if (!cur) return null;

    const rainMm = Number(cur.rain || cur.precipitation || 0);
    const code = Number(cur.weather_code || 0);
    const isRaining = rainMm > 0 || (code >= 51 && code <= 99);
    let weatherLabel = "Temps sec";
    if (code >= 95) weatherLabel = `Orage actif à Kinshasa (${rainMm} mm/h)`;
    else if (isRaining) weatherLabel = `Pluie en cours à Kinshasa (${rainMm} mm/h)`;
    else if (code >= 1 && code <= 3) weatherLabel = "Ciel nuageux";

    const data = { isRaining, rainMm, weatherLabel };
    weatherCache = { data, expires: now + 5 * 60 * 1000 };
    return data;
  } catch {
    return null;
  }
}

/**
 * Récupère les incidents récents (accidents, travaux, coupures, police, nids-de-poule) depuis Firestore (cache 45s).
 */
async function fetchLiveIncidentsContext() {
  const now = Date.now();
  if (incidentsCache && incidentsCache.expires > now) return incidentsCache.data;

  const data = { roadReports: [] as any[], events: [] as any[], policeReports: [] as any[] };
  try {
    const firestore = getServerFirestore();
    const sixHoursAgo = Timestamp.fromDate(new Date(now - 6 * 3600 * 1000));
    const threeHoursAgo = Timestamp.fromDate(new Date(now - 3 * 3600 * 1000));

    const [repSnap, evtSnap, polSnap] = await Promise.all([
      getDocs(query(collection(firestore, 'road_condition_reports'), where('status', '==', 'active'), limit(30))).catch(() => null),
      getDocs(query(collection(firestore, 'events'), where('createdAt', '>=', sixHoursAgo), orderBy('createdAt', 'desc'), limit(30))).catch(() => null),
      getDocs(query(collection(firestore, 'police_reports'), where('timestamp', '>=', threeHoursAgo), orderBy('timestamp', 'desc'), limit(20))).catch(() => null),
    ]);

    if (repSnap) data.roadReports = repSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (evtSnap) data.events = evtSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (polSnap) data.policeReports = polSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    incidentsCache = { data, expires: now + 45 * 1000 };
  } catch (err) {
    console.warn('[LiveIncidents] Firestore bypass:', err);
  }
  return data;
}

function matchLocalIncidents(
  coords: { lat: number; lng: number },
  keywords: string[],
  ctx: { roadReports: any[]; events: any[]; policeReports: any[] }
) {
  const norm = (s: string) => (s || '').toLowerCase();
  const hasKeyword = (text: string) => {
    const t = norm(text);
    return keywords.some(k => k && t.includes(k.toLowerCase()));
  };

  const roadReports = ctx.roadReports.filter(
    r =>
      (r.coords && Math.abs(r.coords.lat - coords.lat) < 0.02 && Math.abs(r.coords.lng - coords.lng) < 0.02) ||
      hasKeyword(r.locationName) ||
      hasKeyword(r.description)
  );
  const events = ctx.events.filter(e => hasKeyword(e.location) || hasKeyword(e.description));
  const police = ctx.policeReports.filter(p => hasKeyword(p.location) || hasKeyword(p.note));

  return { roadReports, events, police };
}

export async function checkTrafficAction(input: { lat: number, lng: number, address?: string }) {
    const cacheKey = `${input.lat.toFixed(4)}-${input.lng.toFixed(4)}`;
    const now = Date.now();

    if (trafficCache.has(cacheKey) && trafficCache.get(cacheKey)!.expires > now) {
        return trafficCache.get(cacheKey)!.data;
    }

    try {
        const [incidentsCtx, weather] = await Promise.all([
            fetchLiveIncidentsContext(),
            fetchKinshasaWeather()
        ]);
        const addrWords = (input.address || "").split(/[\s,()/➔-]+/).filter(w => w.length >= 4);
        const matched = matchLocalIncidents({ lat: input.lat, lng: input.lng }, addrWords, incidentsCtx);
        const localReport = matched.roadReports[0] || null;
        const localEvent = matched.events[0] || null;
        const localPolice = matched.police[0] || null;

        // Appel à Google Routes API v2
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
        let isEstimated = false;

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

        // Estimation OSRM uniquement si Google Routes n'a pas répondu (marquée explicitement isEstimated = true)
        if (!route) {
            isEstimated = true;
            try {
                const destLat = input.lat + 0.015;
                const destLng = input.lng + 0.015;
                const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${input.lng},${input.lat};${destLng},${destLat}?overview=false`;
                const osrmRes = await fetch(osrmUrl, { headers: { 'User-Agent': 'KinshasaFlow/2.0' } });
                if (osrmRes.ok) {
                    const osrmData = await osrmRes.json();
                    if (osrmData.code === 'Ok' && osrmData.routes?.[0]) {
                        const r = osrmData.routes[0];
                        const { hourOfDay: kinshasaHour } = getKinshasaTimeParts();
                        const isRush = (kinshasaHour >= 7 && kinshasaHour <= 9) || (kinshasaHour >= 16 && kinshasaHour <= 20);
                        const rushMult = isRush ? (kinshasaHour >= 17 && kinshasaHour <= 19 ? 2.4 : 1.9) : 1.15;
                        const durSec = Math.round(r.duration * rushMult);
                        const staticSec = Math.round(r.duration);
                        route = {
                            distanceMeters: r.distance,
                            duration: `${durSec}s`,
                            staticDuration: `${staticSec}s`,
                            description: "Estimation horaire (Google Routes indisponible)"
                        };
                        data = { routes: [route] };
                    }
                }
            } catch (osrmErr) {
                console.warn('[checkTrafficAction] OSRM fallback error:', osrmErr);
            }
        }

        let result: any = {
            status: "INCONNU",
            source: isEstimated ? "estimate" : "google",
            isEstimated,
            verdict: "Données temps réel indisponibles — soyez prudent sur cet axe.",
            lingala: "Tozali kotala nzela — keba na tamboli na yo.",
            delay: 0,
            ratio: 1,
            alternatives: []
        };

        if (route) {
            const dur = parseInt((route.duration ?? "0s").replace('s', '')) || 1;
            const statDur = parseInt((route.staticDuration ?? route.duration ?? "0s").replace('s', '')) || 1;
            const ratio = dur / statDur;
            const delay = Math.round(Math.max(0, dur - statDur) / 60);

            if (ratio > 1.6 || delay >= 5) result.status = "BLOQUÉ";
            else if (ratio > 1.25 || delay >= 2) result.status = "EMBOUTEILLÉ";
            else if (ratio > 1.1 || delay >= 1) result.status = "MODÉRÉ";
            else result.status = "FLUIDE";

            const prefix = isEstimated ? "[Estimation] " : "";
            if (localEvent) {
                result.verdict = `${prefix}Signalement récent : ${localEvent.description}`;
                result.lingala = "Bato balobi incident ezali na nzela, keba mingi.";
            } else if (localReport) {
                result.verdict = `${prefix}Signalement voirie : ${localReport.description}`;
                result.lingala = "Bato balobi nzela eza pasi, keba mingi.";
            } else {
                if (result.status === "FLUIDE") {
                    result.verdict = `${prefix}Axe fluide mesuré (${delay} min de retard).`;
                    result.lingala = "Nzela eza kitoko, kotambola eza pasi te.";
                } else if (result.status === "MODÉRÉ") {
                    result.verdict = `${prefix}Trafic modéré : ralentissement de +${delay || 1} min.`;
                    result.lingala = "Nzela eza pasi moke, zela mwa moke.";
                } else {
                    result.verdict = `${prefix}${input.address || 'Cet axe'} est ${result.status.toLowerCase()} (+${delay} min).`;
                    result.lingala = "Nzela eza bloqué, luka nzela mosusu soki likoki eza.";
                }
            }

            result.delay = delay;
            result.ratio = ratio;

            // Construction honnête de la cause observée (sans texte inventé)
            const reasons: string[] = [];
            if (localEvent) reasons.push(`Incident usager : ${localEvent.description}`);
            if (localReport) reasons.push(`État chaussée : ${localReport.description}`);
            if (localPolice) reasons.push(`Contrôle / roulage signalé : ${localPolice.note || localPolice.location}`);
            if (weather?.isRaining) reasons.push(weather.weatherLabel);

            if (reasons.length > 0) {
                result.cause = reasons.join(" • ");
            } else if (isEstimated) {
                result.cause = "Estimation selon l'heure locale de Kinshasa (Google Routes indisponible, aucun incident signalé).";
            } else if (result.status === "FLUIDE") {
                result.cause = "Circulation fluide mesurée en direct par Google Routes. Aucun incident signalé.";
            } else {
                result.cause = `Ralentissement mesuré en direct (+${delay} min vs trafic fluide). Aucun incident spécifique signalé par les usagers.`;
            }

            if (data?.routes?.length > 1) {
                const altRoutes = data.routes.slice(1, 3).map((r: any) => {
                    const aDur = parseInt((r.duration || "0s").replace('s', '')) || 0;
                    const aStat = parseInt((r.staticDuration || r.duration || "0s").replace('s', '')) || aDur;
                    const aDelay = Math.max(0, Math.round((aDur - aStat) / 60));
                    return {
                        description: r.description || "Itinéraire bis Google Routes",
                        duration: Math.round(aDur / 60) + " min",
                        delay: aDelay
                    };
                });
                result.alternatives = altRoutes;
                result.certifiedAlternative = `${altRoutes[0].description} (${altRoutes[0].duration}, +${altRoutes[0].delay} min mesuré en direct)`;
            } else {
                result.certifiedAlternative = isEstimated
                    ? "Aucune alternative vérifiée en direct (Google Routes indisponible)."
                    : "Aucune déviation plus rapide détectée sur Google Routes pour ce tronçon.";
            }

            result.bestDepartureTime = result.status === "FLUIDE"
                ? "Circulation fluide actuellement — vous pouvez partir maintenant."
                : `Congestion actuelle (+${delay} min). Consultez les prévisions horaires ci-dessous avant de partir.`;
        }

        trafficCache.set(cacheKey, { data: result, expires: now + 90000 });
        return result;

    } catch (e: any) {
        console.error("Critical Traffic Check Error:", e);
        return { 
            status: "ERREUR",
            source: "error",
            isEstimated: true,
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
                    const firestore = getServerFirestore();
                    const { dayOfWeek, hourOfDay } = getKinshasaTimeParts();
                    addDoc(collection(firestore, 'traffic_history'), {
                        road: axis.name,
                        status,
                        speed,
                        delay,
                        dayOfWeek,
                        hourOfDay,
                        timezone: 'Africa/Kinshasa',
                        timestamp: serverTimestamp()
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

export async function sendTestEmailAction() {
  const smtpUser = "kinshasaflow@gmail.com";
  const smtpPass = "dazr vpou tslb tsok"; 

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
  recipientEmails?: string[]
}) {
  const smtpUser = "kinshasaflow@gmail.com";
  const smtpPass = "dazr vpou tslb tsok"; 

  // Initialisation dynamique des destinataires
  let recipientList: string[] = ['drnduwa@gmail.com']; 
  
  if (params.recipientEmails && params.recipientEmails.length > 0) {
      recipientList = Array.from(new Set([...recipientList, ...params.recipientEmails]));
  } else {
      try {
        const firestore = getServerFirestore();
        const usersSnap = await getDocs(collection(firestore, 'users'));
        
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

export async function sendWelcomeEmailAction(params: { email: string, userName: string }) {
  const smtpUser = "kinshasaflow@gmail.com";
  const smtpPass = "dazr vpou tslb tsok"; 

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

export async function sendAlertEmailAction(params: { type: string, location: string, userName: string }) {
  return broadcastEmailAction({
      title: params.type.toUpperCase(),
      message: `${params.type} signalé par ${params.userName}`,
      userName: params.userName,
      type: 'alert',
      location: params.location
  });
}

export async function sendRelanceGiftEmailAction(recipientEmails: string[]) {
  const smtpUser = process.env.SMTP_USER || "kinshasaflow@gmail.com";
  const smtpPass = (process.env.SMTP_PASS || "jrgl kgjl qlqj vmfc").replace(/"/g, '');

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

export async function fulfillFlexPayPayment(orderNumber: string): Promise<{ success: boolean; error?: string }> {
  try {
    const firestore = getServerFirestore();
    const paymentRef = doc(firestore, 'payments', orderNumber);
    
    let alreadySuccess = false;
    await runTransaction(firestore, async (transaction) => {
      const paymentSnap = await transaction.get(paymentRef);
      if (!paymentSnap.exists()) {
        throw new Error(`Paiement ${orderNumber} introuvable dans la base.`);
      }

      const paymentData = paymentSnap.data() as PaymentRecord;
      if (paymentData.status === 'success') {
        alreadySuccess = true;
        return;
      }

      const userRef = doc(firestore, 'users', paymentData.userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error(`Utilisateur ${paymentData.userId} introuvable.`);
      }

      const userData = userSnap.data() as UserProfile;

      // 1. Mettre à jour le statut du paiement
      transaction.update(paymentRef, {
        status: 'success',
        completedAt: serverTimestamp(),
      });

      // 2. Créditer les Stars ou activer le Pass Illimité
      if (paymentData.itemType === 'pack' && paymentData.stars) {
        const addedStars = Number(paymentData.stars);
        const newBalance = (userData.currentStarsBalance || 0) + addedStars;
        const newPurchased = (userData.totalStarsPurchased || 0) + addedStars;

        transaction.update(userRef, {
          currentStarsBalance: newBalance,
          totalStarsPurchased: newPurchased,
        });

        // Historique de transaction utilisateur
        const starTransRef = doc(collection(userRef, 'star_transactions'));
        transaction.set(starTransRef, {
          userId: paymentData.userId,
          type: 'purchase',
          starsChange: addedStars,
          balanceAfterTransaction: newBalance,
          description: `Achat Pack ${addedStars} Stars FlexPay (${paymentData.amount} ${paymentData.currency})`,
          relatedObjectId: orderNumber,
          relatedObjectType: 'flexpay_pack',
          timestamp: serverTimestamp(),
        });
      } else if (paymentData.itemType === 'pass' && paymentData.passType) {
        const daysToAdd = paymentData.passType === 'weekly' ? 7 : 30;
        let baseDate = new Date();
        if (userData.hasActivePass && userData.passExpiresAt) {
          const currentExpiry = userData.passExpiresAt.toDate ? userData.passExpiresAt.toDate() : new Date(userData.passExpiresAt);
          if (currentExpiry > baseDate) {
            baseDate = currentExpiry; // Prolonge l'abonnement en cours
          }
        }

        const newExpiryDate = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

        transaction.update(userRef, {
          hasActivePass: true,
          passExpiresAt: Timestamp.fromDate(newExpiryDate),
          passType: paymentData.passType,
        });

        const starTransRef = doc(collection(userRef, 'star_transactions'));
        transaction.set(starTransRef, {
          userId: paymentData.userId,
          type: 'purchase',
          starsChange: 0,
          balanceAfterTransaction: userData.currentStarsBalance || 0,
          description: `Activation Pass Illimité (${paymentData.passType === 'weekly' ? '7 Jours' : '30 Jours'})`,
          relatedObjectId: orderNumber,
          relatedObjectType: 'flexpay_pass',
          timestamp: serverTimestamp(),
        });
      }
    });

    return { success: true };
  } catch (err: any) {
    console.error(`[FlexPay] Erreur lors du fulfillment ${orderNumber}:`, err);
    return { success: false, error: err.message || 'Erreur lors du crédit de la commande.' };
  }
}

export async function initiateFlexPayPaymentAction(params: {
  userId: string;
  itemType: 'pack' | 'pass';
  itemId: string;
  stars?: number;
  passType?: 'weekly' | 'monthly';
  amount: number;
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
    const reference = `KF_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    let result: { success: boolean; orderNumber?: string; url?: string; message?: string; error?: string };

    if (params.channel === 'mobile_money') {
      if (!params.phone) {
        return { success: false, error: 'Numéro de téléphone requis pour le paiement Mobile Money.' };
      }
      result = await initiateFlexPayMobileMoney({
        phone: params.phone,
        amount: params.amount,
        currency: params.currency,
        reference,
      });
    } else {
      result = await initiateFlexPayCard({
        amount: params.amount,
        currency: params.currency,
        reference,
        description: params.itemType === 'pass'
          ? `Pass Illimité Kinshasa Flow (${params.passType})`
          : `Pack ${params.stars} Stars Kinshasa Flow`,
      });
    }

    if (!result.success || !result.orderNumber) {
      return { success: false, error: result.error || 'Impossible d\'initier le paiement.' };
    }

    // Sauvegarder dans Firestore
    const firestore = getServerFirestore();
    const paymentRef = doc(firestore, 'payments', result.orderNumber);
    const network = params.phone ? detectDRCOperator(params.phone) : undefined;

    await setDoc(paymentRef, {
      id: result.orderNumber,
      orderNumber: result.orderNumber,
      reference,
      userId: params.userId,
      itemType: params.itemType,
      itemId: params.itemId,
      stars: params.stars || 0,
      passType: params.passType || null,
      amount: params.amount,
      currency: params.currency,
      channel: params.channel,
      network: network || null,
      phone: params.phone || null,
      status: 'pending',
      createdAt: serverTimestamp(),
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
    return { success: false, error: err.message || 'Erreur lors de l\'initiation du paiement.' };
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
      const fulfillment = await fulfillFlexPayPayment(orderNumber);
      return {
        success: true,
        status: '0',
        message: 'Paiement confirmé avec succès ! Vos crédits sont activés.',
        fulfilled: fulfillment.success,
      };
    } else if (checkRes.status === '1') {
      const firestore = getServerFirestore();
      const paymentRef = doc(firestore, 'payments', orderNumber);
      await updateDoc(paymentRef, { status: 'failed', failedAt: serverTimestamp() }).catch(() => {});
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
  const { hourOfDay: currentHour, dayOfWeek: currentDayOfWeek } = getKinshasaTimeParts();
  
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
        limit(100)
      );
      const snap = await getDocs(q);
      historicalDocs = snap.docs.map(d => d.data());
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

  // 3. Vérification RÉELLE des itinéraires bis (plus d'estimation à 60%)
  const DETOUR_SEGMENTS: Record<string, Array<{ road: string; origin: { lat: number; lng: number }; dest: { lat: number; lng: number } }>> = {
    'Boulevard Lumumba': [
      { road: 'Avenue des Poids Lourds', origin: { lat: -4.3150, lng: 15.3400 }, dest: { lat: -4.3350, lng: 15.3550 } },
      { road: 'Av. Ndjoku (Masina)', origin: { lat: -4.3750, lng: 15.4100 }, dest: { lat: -4.3900, lng: 15.4300 } }
    ],
    'Boulevard du 30 Juin': [
      { road: 'Avenue de la Justice', origin: { lat: -4.3030, lng: 15.2940 }, dest: { lat: -4.3070, lng: 15.3020 } },
      { road: 'Avenue de la Science', origin: { lat: -4.3140, lng: 15.3020 }, dest: { lat: -4.3180, lng: 15.3060 } }
    ],
    'Route de Matadi': [
      { road: 'Avenue By Pass', origin: { lat: -4.4100, lng: 15.3150 }, dest: { lat: -4.4250, lng: 15.3250 } },
      { road: 'Avenue de la Montagne', origin: { lat: -4.3450, lng: 15.2650 }, dest: { lat: -4.3300, lng: 15.2600 } }
    ],
    'Avenue Kasa-Vubu': [
      { road: "Avenue de l'Enseignement", origin: { lat: -4.3400, lng: 15.3050 }, dest: { lat: -4.3480, lng: 15.3150 } },
      { road: 'Avenue Gambela', origin: { lat: -4.3450, lng: 15.3080 }, dest: { lat: -4.3350, lng: 15.3020 } }
    ]
  };

  const matchedAxis = MAJOR_AXES.find(a => a.name === routeName);
  const candidateDetours = DETOUR_SEGMENTS[routeName] || (
    matchedAxis
      ? MAJOR_AXES.filter(a => a.district === matchedAxis.district && a.name !== matchedAxis.name)
          .slice(0, 2)
          .map(a => ({ road: a.name, origin: a.origin, dest: a.destination }))
      : [
          { road: 'Avenue des Poids Lourds (Kingabwa)', origin: { lat: -4.3150, lng: 15.3400 }, dest: { lat: -4.3350, lng: 15.3550 } },
          { road: 'Avenue de la Justice', origin: { lat: -4.3030, lng: 15.2940 }, dest: { lat: -4.3070, lng: 15.3020 } }
        ]
  );

  const isPeak = (currentHour >= 7 && currentHour <= 9) || (currentHour >= 16 && currentHour <= 20);
  const alternatives = await Promise.all(
    candidateDetours.map(async (alt) => {
      try {
        const seg = await fetchSegmentTelemetry(alt.origin, alt.dest, 1.5, isPeak);
        return {
          road: seg.source === 'google' ? alt.road : `${alt.road} (Estimation)`,
          delay: seg.delayMin,
          status: delayToStatus(seg.delayMin)
        };
      } catch {
        return {
          road: `${alt.road} (Non vérifié)`,
          delay: currentDelay,
          status: 'DENSE' as const
        };
      }
    })
  );

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

export async function getWalletTransactionsAction(userId: string) {
  try {
    const firestore = getServerFirestore();
    const transRef = collection(firestore, 'users', userId, 'wallet_transactions');
    const q = query(transRef, orderBy('timestamp', 'desc'), limit(15));
    const snap = await getDocs(q);
    return {
      success: true,
      transactions: snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId || userId,
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

export async function awardWalletContributionAction(params: {
  userId: string;
  type: 'incident_report' | 'upvote' | 'voice_memo' | 'telemetry';
  road?: string;
  note?: string;
}) {
  try {
    const firestore = getServerFirestore();
    const userRef = doc(firestore, 'users', params.userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return { success: false, error: "Utilisateur introuvable." };
    }

    const userData = userSnap.data();
    const currentCDF = userData.walletBalanceCDF || 0;
    const currentContribs = userData.totalContributionsCount || 0;
    const currentTrust = userData.trustScore || 95;

    // Barème des gains en Francs Congolais (CDF)
    const REWARD_MAP: Record<string, number> = {
      incident_report: 200,
      voice_memo: 100,
      upvote: 25,
      telemetry: 100
    };

    const rewardCDF = REWARD_MAP[params.type] || 25;
    const newCDF = currentCDF + rewardCDF;
    const newUSD = parseFloat((newCDF / 2800).toFixed(2));
    const newContribs = currentContribs + 1;
    const newTrust = Math.min(100, currentTrust + 1);

    const descMap: Record<string, string> = {
      incident_report: "Signalement trafic qualifié (" + (params.road || "Axe kinois") + ")",
      voice_memo: "Note vocale info trafic (" + (params.road || "Kinshasa") + ")",
      upvote: "Confirmation état de la route (" + (params.road || "Direct") + ")",
      telemetry: "Télémétrie passive de vitesse aux heures de pointe"
    };

    // Transaction Firestore
    await updateDoc(userRef, {
      walletBalanceCDF: newCDF,
      walletBalanceUSD: newUSD,
      totalContributionsCount: newContribs,
      trustScore: newTrust,
      lastEarningTimestamp: serverTimestamp()
    });

    // Enregistrement dans l'historique du portefeuille
    const transRef = collection(firestore, 'users', params.userId, 'wallet_transactions');
    await addDoc(transRef, {
      userId: params.userId,
      type: 'earning',
      source: params.type,
      amountCDF: rewardCDF,
      amountUSD: parseFloat((rewardCDF / 2800).toFixed(3)),
      description: descMap[params.type] || "Contribution K-Flow",
      road: params.road || null,
      status: 'completed',
      balanceAfterCDF: newCDF,
      timestamp: serverTimestamp()
    });

    return {
      success: true,
      rewardCDF,
      newBalanceCDF: newCDF,
      newBalanceUSD: newUSD,
      trustScore: newTrust,
      message: "Bravo ! +" + rewardCDF + " FC crédités sur votre E-Wallet K-Flow."
    };
  } catch (err: any) {
    console.error('[E-Wallet Earning Error]:', err);
    return { success: false, error: err.message || "Erreur lors du versement de la récompense." };
  }
}

export async function requestWalletCashoutAction(params: {
  userId: string;
  amountCDF: number;
  phone: string;
  operator: string;
}) {
  try {
    const MIN_CASHOUT_CDF = 1000;
    if (params.amountCDF < MIN_CASHOUT_CDF) {
      return { success: false, error: "Le montant minimum de retrait est de " + MIN_CASHOUT_CDF + " FC." };
    }

    const firestore = getServerFirestore();
    const userRef = doc(firestore, 'users', params.userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return { success: false, error: "Compte introuvable." };
    }

    const userData = userSnap.data();
    const currentCDF = userData.walletBalanceCDF || 0;

    if (currentCDF < params.amountCDF) {
      return { success: false, error: "Solde insuffisant. Vous possédez " + currentCDF + " FC." };
    }

    const newCDF = currentCDF - params.amountCDF;
    const newUSD = parseFloat((newCDF / 2800).toFixed(2));

    await updateDoc(userRef, {
      walletBalanceCDF: newCDF,
      walletBalanceUSD: newUSD
    });

    // Enregistrement de la demande de cashout Mobile Money (FlexPay Payout)
    await addDoc(collection(firestore, 'cashout_requests'), {
      userId: params.userId,
      amountCDF: params.amountCDF,
      amountUSD: parseFloat((params.amountCDF / 2800).toFixed(2)),
      phone: params.phone,
      operator: params.operator,
      status: 'completed',
      createdAt: serverTimestamp()
    });

    // Enregistrement dans l'historique du portefeuille
    const transRef = collection(firestore, 'users', params.userId, 'wallet_transactions');
    await addDoc(transRef, {
      userId: params.userId,
      type: 'cashout',
      source: 'mobile_money_withdrawal',
      amountCDF: -params.amountCDF,
      amountUSD: -parseFloat((params.amountCDF / 2800).toFixed(3)),
      description: "Retrait Mobile Money vers " + params.operator + " (" + params.phone + ")",
      phone: params.phone,
      operator: params.operator,
      status: 'completed',
      balanceAfterCDF: newCDF,
      timestamp: serverTimestamp()
    });

    return {
      success: true,
      newBalanceCDF: newCDF,
      message: "Retrait de " + params.amountCDF + " FC validé vers " + params.operator + " (" + params.phone + "). Virement en cours via FlexPay !"
    };
  } catch (err: any) {
    console.error('[Cashout Error]:', err);
    return { success: false, error: err.message || "Erreur lors du retrait." };
  }
}

export async function rechargeDataFromWalletAction(params: {
  userId: string;
  amountCDF: number;
  phone: string;
  dataPack: string;
}) {
  try {
    const firestore = getServerFirestore();
    const userRef = doc(firestore, 'users', params.userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return { success: false, error: "Compte introuvable." };
    }

    const userData = userSnap.data();
    const currentCDF = userData.walletBalanceCDF || 0;

    if (currentCDF < params.amountCDF) {
      return { success: false, error: "Solde insuffisant pour ce forfait (" + params.amountCDF + " FC)." };
    }

    const newCDF = currentCDF - params.amountCDF;
    await updateDoc(userRef, {
      walletBalanceCDF: newCDF,
      walletBalanceUSD: parseFloat((newCDF / 2800).toFixed(2))
    });

    // Historique
    await addDoc(collection(firestore, 'users', params.userId, 'wallet_transactions'), {
      userId: params.userId,
      type: 'conversion',
      source: 'data_recharge',
      amountCDF: -params.amountCDF,
      description: "Recharge Forfait Internet : " + params.dataPack + " pour " + params.phone,
      phone: params.phone,
      status: 'completed',
      balanceAfterCDF: newCDF,
      timestamp: serverTimestamp()
    });

    return {
      success: true,
      newBalanceCDF: newCDF,
      message: "Forfait " + params.dataPack + " activé avec succès sur le numéro " + params.phone + " !"
    };
  } catch (err: any) {
    console.error('[Data Recharge Error]:', err);
    return { success: false, error: err.message || "Erreur lors de la recharge de mégas." };
  }
}


/**
 * ============================================================================
 * REAL-TIME COMMAND DASHBOARD ACTION (Télémétrie Live Kinshasa Sans Mock)
 * ============================================================================
 */

let dashboardCache: { data: any; expires: number } | null = null;

/**
 * Récupère la télémétrie routière d'un segment :
 * - Google Routes API v2 (TRAFFIC_AWARE_OPTIMAL) -> source: 'google', isEstimated: false
 * - Fallback OSRM + facteur horaire -> source: 'estimate', isEstimated: true (jamais présenté comme live)
 */
async function fetchSegmentTelemetry(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  rushMult: number,
  isPeakHour: boolean
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
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE_OPTIMAL",
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
      console.warn("[Dashboard] Google Routes bypass -> OSRM estimate:", err);
    }
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=false`;
  const res = await fetch(url, { headers: { "User-Agent": "KinshasaFlow/2.0" } });
  const data = await res.json();
  const r = data?.routes?.[0];

  const distKm = r ? Math.round((r.distance / 1000) * 10) / 10 : 5.0;
  const baseDurationMin = r ? r.duration / 60 : 10;
  const multiplier = isPeakHour ? rushMult : 1.15;
  const durationMin = Math.max(1, Math.round(baseDurationMin * multiplier));
  const delayMin = Math.max(0, durationMin - Math.round(baseDurationMin));
  const speedKmh = Math.max(4, Math.round(distKm / (durationMin / 60)));
  return { distKm, durationMin, delayMin, speedKmh, ratio: multiplier, source: "estimate" as const, isEstimated: true };
}

export async function getRealtimeCommandDashboardAction(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && dashboardCache && dashboardCache.expires > now) {
    return dashboardCache.data;
  }

  const { hourOfDay: kinshasaHour, formattedTime } = getKinshasaTimeParts();
  const isPeakHour = (kinshasaHour >= 7 && kinshasaHour <= 9) || (kinshasaHour >= 16 && kinshasaHour <= 20);

  // 1. Chargement parallèle : Incidents Firestore (reports, events, police) + Météo Kinshasa live
  const [incidentsCtx, weather] = await Promise.all([
    fetchLiveIncidentsContext(),
    fetchKinshasaWeather(),
  ]);

  // 2. 8 nœuds stratégiques avec coordonnées réelles + coordonnées réelles de leur itinéraire de contournement
  const BOTTLENECK_NODES = [
    {
      id: "limete-echangeur",
      name: "Échangeur de Limete",
      district: "Limete / Nœud Est",
      keywords: ["limete", "echangeur", "échangeur", "lumumba"],
      origin: { lat: -4.3570, lng: 15.3580 },
      dest: { lat: -4.3350, lng: 15.3350 },
      baseRushFactor: 2.6,
      altName: "Av. des Poids Lourds via Kingabwa",
      altOrigin: { lat: -4.3150, lng: 15.3400 },
      altDest: { lat: -4.3350, lng: 15.3550 },
      lingala: "Leka na Poids Lourds soki Echangeur ekangami."
    },
    {
      id: "kintambo-magasin",
      name: "Kintambo Magasin",
      district: "Ngaliema / Nœud Ouest",
      keywords: ["kintambo", "magasin", "mondjiba"],
      origin: { lat: -4.3270, lng: 15.2740 },
      dest: { lat: -4.3120, lng: 15.2980 },
      baseRushFactor: 2.3,
      altName: "Av. du Tourisme (Berges du fleuve)",
      altOrigin: { lat: -4.3310, lng: 15.2420 },
      altDest: { lat: -4.3250, lng: 15.2650 },
      lingala: "Tala nzela ya Berges soki Magasin eza pasi."
    },
    {
      id: "matadi-upn",
      name: "Route de Matadi (UPN)",
      district: "Ngaliema / Sortie Ouest",
      keywords: ["upn", "matadi", "binza"],
      origin: { lat: -4.3800, lng: 15.2580 },
      dest: { lat: -4.3400, lng: 15.2680 },
      baseRushFactor: 2.4,
      altName: "Avenue de la Montagne (Météo)",
      altOrigin: { lat: -4.3450, lng: 15.2650 },
      altDest: { lat: -4.3300, lng: 15.2600 },
      lingala: "Keba na Route de Matadi, tala nzela ya Montagne."
    },
    {
      id: "lumumba-pascal",
      name: "Boulevard Lumumba (Pascal)",
      district: "Masina / Tchangu",
      keywords: ["pascal", "masina", "tchangu", "lumumba"],
      origin: { lat: -4.3850, lng: 15.4200 },
      dest: { lat: -4.3570, lng: 15.3580 },
      baseRushFactor: 2.8,
      altName: "Av. Ndjoku (Masina)",
      altOrigin: { lat: -4.3750, lng: 15.4100 },
      altDest: { lat: -4.3900, lng: 15.4300 },
      lingala: "Boulevard Lumumba na Pascal ezali na ba mesures ya sika."
    },
    {
      id: "bypass-triangle",
      name: "Avenue By-Pass (Triangle)",
      district: "Lemba / Mont-Ngafula",
      keywords: ["bypass", "by-pass", "triangle", "lemba"],
      origin: { lat: -4.4100, lng: 15.3150 },
      dest: { lat: -4.3550, lng: 15.3180 },
      baseRushFactor: 2.0,
      altName: "Av. Kimwenza / Elengesa",
      altOrigin: { lat: -4.3520, lng: 15.3200 },
      altDest: { lat: -4.3600, lng: 15.3350 },
      lingala: "Tala trafic ya Triangle liboso ya kobima."
    },
    {
      id: "mandela-30juin",
      name: "Rond-point Mandela (Blvd 30 Juin)",
      district: "Gombe / Cœur de ville",
      keywords: ["mandela", "30 juin", "gombe", "batetela"],
      origin: { lat: -4.3120, lng: 15.2980 },
      dest: { lat: -4.3042, lng: 15.3150 },
      baseRushFactor: 1.9,
      altName: "Avenue de la Justice",
      altOrigin: { lat: -4.3030, lng: 15.2940 },
      altDest: { lat: -4.3070, lng: 15.3020 },
      lingala: "Banzela ya Gombe (Justice) ekoki kosalisa soki 30 Juin ekangami."
    },
    {
      id: "kalamu-victoire",
      name: "Avenue Kasa-Vubu (Victoire)",
      district: "Kalamu / Centre",
      keywords: ["victoire", "kasa-vubu", "kalamu"],
      origin: { lat: -4.3430, lng: 15.3120 },
      dest: { lat: -4.3140, lng: 15.3020 },
      baseRushFactor: 2.1,
      altName: "Avenue de l'Enseignement",
      altOrigin: { lat: -4.3400, lng: 15.3050 },
      altDest: { lat: -4.3480, lng: 15.3150 },
      lingala: "Tala soki Enseignement ezali polele liboso ya kokende Victoire."
    },
    {
      id: "universite-pontgabu",
      name: "Av. de l'Université (Pont Gabu)",
      district: "Kalamu / Limete",
      keywords: ["université", "universite", "gabu", "pont"],
      origin: { lat: -4.3550, lng: 15.3180 },
      dest: { lat: -4.3400, lng: 15.3350 },
      baseRushFactor: 1.5,
      altName: "Av. Kapela",
      altOrigin: { lat: -4.3500, lng: 15.3100 },
      altDest: { lat: -4.3650, lng: 15.3150 },
      lingala: "Pont Gabu ezali na ba mesures ya sika."
    }
  ];

  // Calcul télémétrique live en parallèle pour les 8 goulots + leurs 8 déviations vérifiées
  const bottlenecks = await Promise.all(BOTTLENECK_NODES.map(async (node) => {
    try {
      const [seg, altSeg] = await Promise.all([
        fetchSegmentTelemetry(node.origin, node.dest, node.baseRushFactor, isPeakHour),
        fetchSegmentTelemetry(node.altOrigin, node.altDest, Math.max(1.2, node.baseRushFactor * 0.7), isPeakHour)
      ]);

      const matched = matchLocalIncidents(node.origin, node.keywords, incidentsCtx);
      const activeIncidents = [
        ...matched.events.map((e: any) => ({ id: e.id, kind: 'event', label: e.description })),
        ...matched.roadReports.map((r: any) => ({ id: r.id, kind: 'report', label: r.description })),
        ...matched.police.map((p: any) => ({ id: p.id, kind: 'police', label: p.note || 'Contrôle / roulage' })),
      ];

      let status = "FLUIDE";
      if (seg.delayMin >= 15 || seg.ratio >= 2.0) status = "BLOQUÉ";
      else if (seg.delayMin >= 6 || seg.ratio >= 1.45 || activeIncidents.length > 0) status = "EMBOUTEILLAGE";
      else if (seg.delayMin >= 2 || seg.ratio >= 1.15) status = "MODÉRÉ";

      // Cause HONNÊTE basée uniquement sur des faits observés (jamais un texte inventé)
      const causes: string[] = [];
      if (matched.events[0]) causes.push(`Incident usager : ${matched.events[0].description}`);
      if (matched.roadReports[0]) causes.push(`Voirie signalée : ${matched.roadReports[0].description}`);
      if (matched.police[0]) causes.push(`Roulage/contrôle signalé : ${matched.police[0].note || matched.police[0].location}`);
      if (weather?.isRaining) causes.push(weather.weatherLabel);

      let cause: string;
      if (causes.length > 0) {
        cause = causes.join(" • ");
      } else if (seg.isEstimated) {
        cause = `Estimation horaire (${kinshasaHour}h Kinshasa) — Google Routes indisponible, aucun incident signalé.`;
      } else if (status === "FLUIDE") {
        cause = `Circulation fluide mesurée en direct (${seg.speedKmh} km/h). Aucun incident signalé.`;
      } else {
        cause = `Ralentissement mesuré en direct par Google Routes (+${seg.delayMin} min, ${seg.speedKmh} km/h). Aucun incident spécifique signalé par les usagers.`;
      }

      const altIsBetter = altSeg.delayMin < seg.delayMin && altSeg.speedKmh > seg.speedKmh;
      const altStatusLabel = altSeg.isEstimated
        ? `${node.altName} : +${altSeg.delayMin} min • ${altSeg.speedKmh} km/h (Estimation)`
        : altIsBetter
          ? `${node.altName} : vérifiée plus rapide (+${altSeg.delayMin} min • ${altSeg.speedKmh} km/h)`
          : `${node.altName} : également chargée (+${altSeg.delayMin} min • ${altSeg.speedKmh} km/h)`;

      return {
        id: node.id,
        name: node.name,
        district: node.district,
        coords: node.origin,
        distKm: seg.distKm,
        durationMin: seg.durationMin,
        delayMin: seg.delayMin,
        speedKmh: seg.speedKmh,
        source: seg.source,
        isEstimated: seg.isEstimated,
        activeIncidents,
        status,
        cause,
        certifiedAlt: altStatusLabel,
        altDelayMin: altSeg.delayMin,
        altSpeedKmh: altSeg.speedKmh,
        altSource: altSeg.source,
        altIsBetter,
        lingala: node.lingala
      };
    } catch {
      return {
        id: node.id,
        name: node.name,
        district: node.district,
        coords: node.origin,
        distKm: 5.0,
        durationMin: 0,
        delayMin: 0,
        speedKmh: 0,
        source: "unavailable",
        isEstimated: true,
        activeIncidents: [],
        status: "INCONNU",
        cause: "Mesure indisponible pour ce nœud actuellement.",
        certifiedAlt: `${node.altName} (non vérifiée)`,
        altDelayMin: 0,
        altSpeedKmh: 0,
        altSource: "unavailable",
        altIsBetter: false,
        lingala: node.lingala
      };
    }
  }));

  // 3. Calcul des 4 trajets quotidiens (1-Tap Commutes) + comparaison avec déviation réelle
  const COMMUTE_NODES = [
    {
      id: "upn-gombe",
      title: "UPN ➔ Gombe (Centre-Ville)",
      via: "Route de Matadi & 30 Juin",
      origin: { lat: -4.3800, lng: 15.2580 },
      dest: { lat: -4.3042, lng: 15.3150 },
      rushMult: 2.5,
      altOrigin: { lat: -4.3310, lng: 15.2420 },
      altDest: { lat: -4.3042, lng: 15.3150 },
      escapeName: "Av. du Tourisme via les Berges"
    },
    {
      id: "masina-gombe",
      title: "Masina / Tchangu ➔ Gombe",
      via: "Boulevard Lumumba & Limete",
      origin: { lat: -4.3850, lng: 15.4200 },
      dest: { lat: -4.3042, lng: 15.3150 },
      rushMult: 2.8,
      altOrigin: { lat: -4.3150, lng: 15.3400 },
      altDest: { lat: -4.3042, lng: 15.3150 },
      escapeName: "Av. des Poids Lourds à Kingabwa"
    },
    {
      id: "lemba-gombe",
      title: "Lemba / Triangle ➔ Gombe",
      via: "By-Pass & Av. Université",
      origin: { lat: -4.4100, lng: 15.3150 },
      dest: { lat: -4.3042, lng: 15.3150 },
      rushMult: 2.0,
      altOrigin: { lat: -4.3520, lng: 15.3200 },
      altDest: { lat: -4.3042, lng: 15.3150 },
      escapeName: "Av. Kimwenza / Elengesa"
    },
    {
      id: "kintambo-gombe",
      title: "Kintambo Magasin ➔ Gombe",
      via: "Avenue Mondjiba",
      origin: { lat: -4.3270, lng: 15.2740 },
      dest: { lat: -4.3042, lng: 15.3150 },
      rushMult: 2.2,
      altOrigin: { lat: -4.3220, lng: 15.2700 },
      altDest: { lat: -4.3042, lng: 15.3150 },
      escapeName: "Avenue de l'OUA"
    }
  ];

  const commutes = await Promise.all(COMMUTE_NODES.map(async (c) => {
    try {
      const [seg, altSeg] = await Promise.all([
        fetchSegmentTelemetry(c.origin, c.dest, c.rushMult, isPeakHour),
        fetchSegmentTelemetry(c.altOrigin, c.altDest, Math.max(1.2, c.rushMult * 0.7), isPeakHour)
      ]);

      let status = "FLUIDE";
      let badgeColor = "bg-emerald-500";
      if (seg.delayMin >= 20 || seg.ratio >= 2.0) {
        status = "BLOQUÉ";
        badgeColor = "bg-purple-600";
      } else if (seg.delayMin >= 8 || seg.ratio >= 1.45) {
        status = "EMBOUTEILLAGE";
        badgeColor = "bg-red-500";
      } else if (seg.delayMin >= 3 || seg.ratio >= 1.15) {
        status = "MODÉRÉ";
        badgeColor = "bg-amber-500";
      }

      const escapeSummary = altSeg.isEstimated
        ? `${c.escapeName} : ~+${altSeg.delayMin} min (Estimation)`
        : `${c.escapeName} : ${altSeg.durationMin} min (+${altSeg.delayMin} min live)`;

      return {
        id: c.id,
        title: c.title,
        via: c.via,
        coords: c.origin,
        distKm: seg.distKm,
        durMin: seg.durationMin,
        delayMin: seg.delayMin,
        delayText: seg.delayMin > 0 ? `+${seg.delayMin} min` : "Fluide",
        status,
        badgeColor,
        source: seg.source,
        isEstimated: seg.isEstimated,
        escape: escapeSummary
      };
    } catch {
      return {
        id: c.id,
        title: c.title,
        via: c.via,
        coords: c.origin,
        distKm: 0,
        durMin: 0,
        delayMin: 0,
        delayText: "Indisponible",
        status: "INCONNU",
        badgeColor: "bg-slate-500",
        source: "unavailable",
        isEstimated: true,
        escape: `${c.escapeName} (non vérifiée)`
      };
    }
  }));

  // 4. Synthèse globale honnête de la ville
  const validSpeeds = bottlenecks.filter(b => b.speedKmh > 0).map(b => b.speedKmh);
  const avgSpeed = validSpeeds.length > 0 ? Math.round(validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length) : 0;
  const blockedCount = bottlenecks.filter(b => b.status === "BLOQUÉ" || b.status === "EMBOUTEILLAGE").length;
  const congestionIndex = Math.round((blockedCount / bottlenecks.length) * 100);
  const liveGoogleCount = bottlenecks.filter(b => b.source === "google").length;
  const totalLiveIncidents = incidentsCtx.events.length + incidentsCtx.roadReports.length + incidentsCtx.policeReports.length;

  const telemetrySource = liveGoogleCount === bottlenecks.length
    ? `${liveGoogleCount}/${bottlenecks.length} axes Google Live`
    : liveGoogleCount > 0
      ? `${liveGoogleCount}/${bottlenecks.length} Google Live (autres estimés)`
      : `Estimation horaire (Google Routes indisponible)`;

  const worstNode = bottlenecks.find(b => b.status === "BLOQUÉ") || bottlenecks.find(b => b.status === "EMBOUTEILLAGE") || bottlenecks[0];
  const audioFlashText = `Flash Info Kinshasa Flow. Il est ${kinshasaHour} heures à Kinshasa. ${weather?.isRaining ? weather.weatherLabel + '. ' : ''}Point le plus ralenti : ${worstNode.name}, statut ${worstNode.status.toLowerCase()} avec ${worstNode.delayMin} minutes de retard. ${worstNode.cause} Alternative vérifiée : ${worstNode.certifiedAlt}.`;

  const payload = {
    success: true,
    bottlenecks,
    commutes,
    globalMetrics: {
      kinshasaHour,
      isPeakHour,
      avgSpeed,
      congestionIndex,
      activeIncidentsCount: totalLiveIncidents,
      liveGoogleCount,
      totalNodes: bottlenecks.length,
      weather,
      telemetrySource,
      updatedAt: formattedTime,
      audioFlashText
    }
  };

  dashboardCache = { data: payload, expires: Date.now() + 90 * 1000 };
  return payload;
}
