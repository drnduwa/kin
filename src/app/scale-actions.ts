"use server";
/**
 * Phase 3 « passer à l'échelle » : coach de départ, GPS anonyme, flottes partenaires,
 * sentinelles. Chaque action vérifie le jeton Firebase de l'appelant.
 */
import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyCaller, verifyAdmin, AuthError } from '@/firebase/admin';
import { CONFIG } from '@/lib/config';
import { inKinshasa, speedsFromTrack, recordNodeSpeed, anonId } from '@/lib/probes-server';
import { nearestNode, distanceKm, TRACKED_NODES } from '@/lib/places';
import { getRealtimeCommandDashboardAction } from '@/app/actions';

const GOOGLE_API_KEY = process.env.GOOGLE_ROUTES_API_KEY || CONFIG.GOOGLE_MAPS_API_KEY;
const errMsg = (err: any, fallback: string) => (err instanceof AuthError ? err.message : err?.message || fallback);

const hhmm = (ms: number) => {
  const d = new Date(ms + 3600 * 1000); // heure de Kinshasa
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

/* ------------------------------------------------------------------ Coach de départ */

const coachCache = new Map<string, { data: any; expires: number }>();
const DEPARTURE_OFFSETS = [0, 15, 30, 45, 60, 90, 120];

/**
 * « Partir maintenant ou attendre ? » : temps de trajet prévu par Google (trafic prévu) pour
 * plusieurs heures de départ, plus les itinéraires possibles maintenant.
 * On montre honnêtement les deux chiffres : minutes dans les bouchons ET heure d'arrivée.
 */
export async function getDepartureCoachAction(params: {
  idToken: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}) {
  try {
    await verifyCaller(params.idToken);
    const { from, to } = params;
    if (!inKinshasa(from) || !inKinshasa(to)) return { success: false as const, error: 'Départ et arrivée doivent être à Kinshasa.' };
    if (distanceKm(from, to) < 0.5) return { success: false as const, error: 'Le départ et l’arrivée sont trop proches.' };

    const slot = Math.floor(Date.now() / (10 * 60 * 1000));
    const key = `${from.lat.toFixed(3)},${from.lng.toFixed(3)}>${to.lat.toFixed(3)},${to.lng.toFixed(3)}@${slot}`;
    const cached = coachCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.data;

    const now = Date.now();
    const call = async (offsetMin: number) => {
      const departMs = now + offsetMin * 60 * 1000;
      const body: any = {
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        languageCode: 'fr-FR',
        computeAlternativeRoutes: offsetMin === 0,
      };
      // Google refuse une heure de départ passée : « maintenant » = sans departureTime.
      if (offsetMin > 0) body.departureTime = new Date(departMs).toISOString();
      const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.description',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const routes: any[] = data?.routes || [];
      if (!routes.length) return null;
      const sec = (v?: string) => parseInt(String(v ?? '0s').replace('s', ''), 10) || 0;
      const r = routes[0];
      const durMin = Math.round(sec(r.duration) / 60);
      const freeMin = Math.round(sec(r.staticDuration ?? r.duration) / 60);
      return {
        offsetMin,
        departLabel: offsetMin === 0 ? 'Maintenant' : hhmm(departMs),
        departAt: hhmm(departMs),
        durationMin: durMin,
        trafficMin: Math.max(0, durMin - freeMin),
        arriveLabel: hhmm(departMs + durMin * 60 * 1000),
        alternatives: offsetMin === 0
          ? routes.map((x: any, i: number) => ({
              label: x.description ? `Via ${x.description}` : `Itinéraire ${i + 1}`,
              durationMin: Math.round(sec(x.duration) / 60),
              trafficMin: Math.max(0, Math.round((sec(x.duration) - sec(x.staticDuration ?? x.duration)) / 60)),
              distanceKm: Math.round((x.distanceMeters || 0) / 100) / 10,
            }))
          : undefined,
      };
    };

    const results = (await Promise.all(DEPARTURE_OFFSETS.map(o => call(o).catch(() => null)))).filter(Boolean) as any[];
    if (!results.length || results[0].offsetMin !== 0) {
      return { success: false as const, error: 'Prévision Google indisponible pour ce trajet. Réessayez dans un instant.' };
    }
    const nowRow = results[0];
    const best = results.reduce((a, b) => (b.trafficMin < a.trafficMin ? b : a), nowRow);
    const data = {
      success: true as const,
      source: 'Prévision Google Maps (trafic attendu à chaque heure de départ)',
      departures: results.map(({ alternatives, ...r }) => r) as Array<{ offsetMin: number; departLabel: string; departAt: string; durationMin: number; trafficMin: number; arriveLabel: string }>,
      alternatives: nowRow.alternatives as Array<{ label: string; durationMin: number; trafficMin: number; distanceKm: number }>,
      best: { departAt: best.departAt, offsetMin: best.offsetMin, trafficMin: best.trafficMin, arriveLabel: best.arriveLabel, savedTrafficMin: Math.max(0, nowRow.trafficMin - best.trafficMin) },
      now: { durationMin: nowRow.durationMin, trafficMin: nowRow.trafficMin, arriveLabel: nowRow.arriveLabel },
    };
    coachCache.set(key, { data, expires: Date.now() + 10 * 60 * 1000 });
    return data;
  } catch (err: any) {
    return { success: false as const, error: errMsg(err, 'Prévision indisponible.') };
  }
}

/* ------------------------------------------------------------------ GPS anonyme (usagers) */

/**
 * Reçoit une courte trace (≤ 30 points, ≤ 5 min) d'un usager qui a activé « Partager ma vitesse ».
 * Seules les vitesses par nœud sont gardées ; la trace elle-même n'est jamais enregistrée.
 * Limite : un envoi toutes les 45 s par usager.
 */
export async function submitSpeedProbesAction(params: { idToken: string; samples: Array<{ lat: number; lng: number; t: number }> }) {
  try {
    const { uid } = await verifyCaller(params.idToken);
    const db = adminDb();
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists || userSnap.data()?.gpsOptIn !== true || userSnap.data()?.isBlocked) {
      return { success: false, error: 'Partage de vitesse non activé.' };
    }
    const limitRef = db.collection('probe_limits').doc(uid);
    const allowed = await db.runTransaction(async tx => {
      const s = await tx.get(limitRef);
      const last = s.exists ? Number(s.data()!.lastAtMs || 0) : 0;
      if (Date.now() - last < 45_000) return false;
      tx.set(limitRef, { lastAtMs: Date.now() });
      return true;
    });
    if (!allowed) return { success: true, accepted: 0 };

    const cutoff = Date.now() - 5 * 60 * 1000;
    const samples = (params.samples || []).slice(-30).filter(s => s.t >= cutoff && s.t <= Date.now() + 60_000);
    const speeds = speedsFromTrack(samples);
    const who = anonId(`user:${uid}`);
    await Promise.all(speeds.map(s => recordNodeSpeed(s.nodeId, s.speedKmh, who)));
    return { success: true, accepted: speeds.length };
  } catch (err: any) {
    return { success: false, error: errMsg(err, 'Envoi impossible.') };
  }
}

/* ------------------------------------------------------------------ Flottes partenaires */

const hashApiKey = async (key: string) => crypto.createHash('sha256').update(key).digest('hex');

/** Admin : crée un partenaire flotte. La clé API n'est affichée qu'une fois (seul son hachage est gardé). */
export async function createFleetPartnerAction(params: { idToken: string; name: string; memberEmails: string[] }) {
  try {
    await verifyAdmin(params.idToken);
    const name = String(params.name || '').trim().slice(0, 80);
    if (!name) return { success: false, error: 'Nom requis.' };
    const members = (params.memberEmails || []).map(e => String(e).trim().toLowerCase()).filter(e => /.+@.+\..+/.test(e)).slice(0, 20);
    const apiKey = `kfp_${crypto.randomBytes(24).toString('hex')}`;
    const ref = await adminDb().collection('fleet_partners').add({
      name,
      members,
      apiKeyHash: await hashApiKey(apiKey),
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { success: true, partnerId: ref.id, apiKey };
  } catch (err: any) {
    return { success: false, error: errMsg(err, 'Création impossible.') };
  }
}

export async function setFleetPartnerActiveAction(params: { idToken: string; partnerId: string; active: boolean }) {
  try {
    await verifyAdmin(params.idToken);
    await adminDb().collection('fleet_partners').doc(params.partnerId).update({ active: !!params.active });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: errMsg(err, 'Mise à jour impossible.') };
  }
}

export async function listFleetPartnersAction(idToken: string) {
  try {
    await verifyAdmin(idToken);
    const snap = await adminDb().collection('fleet_partners').get();
    const partners = await Promise.all(snap.docs.map(async d => {
      const p = d.data() as any;
      const vehicles = await d.ref.collection('vehicles').count().get().then(c => c.data().count).catch(() => 0);
      return { id: d.id, name: p.name, members: p.members || [], active: p.active !== false, vehicles };
    }));
    return { success: true, partners };
  } catch (err: any) {
    return { success: false, error: errMsg(err, 'Lecture impossible.'), partners: [] };
  }
}

/**
 * Tableau de bord « Kin Flow Pro » d'un partenaire : ses véhicules (positions des 2 dernières heures),
 * le nœud surveillé le plus proche de chacun et une alerte s'il roule vers un nœud bloqué.
 */
export async function getFleetDashboardAction(idToken: string) {
  try {
    const caller = await verifyCaller(idToken);
    if (!caller.email) return { success: true, member: false as const };
    const db = adminDb();
    const snap = await db.collection('fleet_partners').where('members', 'array-contains', caller.email.toLowerCase()).limit(1).get();
    if (snap.empty) return { success: true, member: false as const };
    const partnerDoc = snap.docs[0];
    const partner = partnerDoc.data() as any;

    const since = Date.now() - 2 * 3600 * 1000;
    const vSnap = await partnerDoc.ref.collection('vehicles').where('tsMs', '>=', since).limit(300).get();
    const dashboard: any = await getRealtimeCommandDashboardAction(false);
    const byId: Record<string, any> = Object.fromEntries((dashboard?.bottlenecks || []).map((b: any) => [b.id, b]));

    const vehicles = vSnap.docs.map(d => {
      const v = d.data() as any;
      const near = nearestNode({ lat: v.lat, lng: v.lng }, 2);
      const node = near ? byId[near.node.id] : null;
      const blocked = node && (node.status === 'BLOQUÉ' || node.status === 'EMBOUTEILLAGE');
      return {
        id: d.id,
        lat: v.lat,
        lng: v.lng,
        speedKmh: v.speedKmh ?? null,
        lastSeen: hhmm(v.tsMs),
        nearNode: near ? { id: near.node.id, name: near.node.name, km: Math.round(near.km * 10) / 10, status: node?.status ?? 'INCONNU', alt: node?.certifiedAlt ?? null } : null,
        alert: !!blocked,
      };
    }).sort((a, b) => Number(b.alert) - Number(a.alert));

    return {
      success: true,
      member: true as const,
      partner: { id: partnerDoc.id, name: partner.name, active: partner.active !== false },
      vehicles,
      nodes: (dashboard?.bottlenecks || []).map((b: any) => ({ id: b.id, name: b.name, status: b.status, delayMin: b.delayMin, speedKmh: b.speedKmh, source: b.source })),
      updatedAt: dashboard?.globalMetrics?.updatedAt ?? null,
    };
  } catch (err: any) {
    return { success: false, error: errMsg(err, 'Tableau de bord indisponible.') };
  }
}

/* ------------------------------------------------------------------ Sentinelles */

/** Admin : nomme / retire une Sentinelle (conducteur rémunéré qui couvre un corridor). */
export async function setSentinelAction(params: { idToken: string; email: string; isSentinel: boolean; corridor?: string }) {
  try {
    await verifyAdmin(params.idToken);
    const email = String(params.email || '').trim().toLowerCase();
    const db = adminDb();
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) return { success: false, error: 'Aucun compte avec cet e-mail.' };
    await snap.docs[0].ref.update({
      isSentinel: !!params.isSentinel,
      sentinelCorridor: params.isSentinel ? String(params.corridor || '').slice(0, 60) || null : null,
    });
    return { success: true, uid: snap.docs[0].id };
  } catch (err: any) {
    return { success: false, error: errMsg(err, 'Mise à jour impossible.') };
  }
}

export async function listSentinelsAction(idToken: string) {
  try {
    await verifyAdmin(idToken);
    const db = adminDb();
    const snap = await db.collection('users').where('isSentinel', '==', true).limit(200).get();
    return {
      success: true,
      sentinels: snap.docs.map(d => {
        const u = d.data() as any;
        return { uid: d.id, name: u.name || '—', email: u.email || '—', commune: u.commune || '—', corridor: u.sentinelCorridor || '—', votes: u.gameVotes || 0, reports: u.gameReports || 0, lastActiveDay: u.lastActiveDay || '—' };
      }),
    };
  } catch (err: any) {
    return { success: false, error: errMsg(err, 'Lecture impossible.'), sentinels: [] };
  }
}

/** Liste publique des nœuds (bot, flash, coach). */
export async function listTrackedNodesAction() {
  return TRACKED_NODES.map(({ id, name, lat, lng }) => ({ id, name, lat, lng }));
}
