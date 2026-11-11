/**
 * Sondes de vitesse (serveur uniquement) : GPS des usagers volontaires et des flottes partenaires.
 *
 * Vie privée : aucun trajet n'est stocké. On ne garde que des agrégats par nœud et par tranche
 * de 5 minutes (somme des vitesses, nombre de mesures, empreintes anonymes pour compter les
 * contributeurs distincts). Les empreintes changent chaque jour (sel = date du jour).
 */
import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { distanceKm, nearestNode, TRACKED_NODES } from '@/lib/places';

const BUCKET_MS = 5 * 60 * 1000;
export const bucketOf = (ms: number) => Math.floor(ms / BUCKET_MS);

/** Empreinte anonyme, renouvelée chaque jour : permet de compter « 3 conducteurs », pas de les suivre. */
export function anonId(raw: string) {
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash('sha256').update(`${process.env.PROBE_SALT || 'kflow'}:${day}:${raw}`).digest('hex').slice(0, 16);
}

export function inKinshasa(p: { lat: number; lng: number }) {
  return p.lat < -4.0 && p.lat > -4.7 && p.lng > 15.1 && p.lng < 15.7;
}

/** Enregistre une vitesse mesurée près d'un nœud. */
export async function recordNodeSpeed(nodeId: string, speedKmh: number, contributor: string, atMs = Date.now()) {
  const bucket = bucketOf(atMs);
  await adminDb().collection('probe_buckets').doc(`${nodeId}_${bucket}`).set({
    nodeId,
    bucket,
    sumSpeed: FieldValue.increment(speedKmh),
    count: FieldValue.increment(1),
    contributors: FieldValue.arrayUnion(contributor),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Transforme une suite de positions (téléphone) en vitesses par nœud.
 * Un appareil immobile (déplacement < 25 m sur 30 s ou plus) est ignoré : c'est probablement
 * un téléphone posé, pas une voiture dans un bouchon.
 */
export function speedsFromTrack(samples: Array<{ lat: number; lng: number; t: number }>) {
  const pts = samples
    .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng) && Number.isFinite(s.t) && inKinshasa(s))
    .sort((a, b) => a.t - b.t);
  const perNode = new Map<string, { dist: number; time: number }>();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dt = (b.t - a.t) / 1000;
    if (dt < 5 || dt > 180) continue;
    const d = distanceKm(a, b);
    if ((d / dt) * 3600 > 100) continue; // saut GPS
    const near = nearestNode({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });
    if (!near) continue;
    const agg = perNode.get(near.node.id) ?? { dist: 0, time: 0 };
    agg.dist += d; agg.time += dt;
    perNode.set(near.node.id, agg);
  }
  const out: Array<{ nodeId: string; speedKmh: number }> = [];
  perNode.forEach((agg, nodeId) => {
    if (agg.time < 30 || agg.dist < 0.025) return;
    out.push({ nodeId, speedKmh: Math.round((agg.dist / agg.time) * 3600 * 10) / 10 });
  });
  return out;
}

/** Vitesses GPS des 15 dernières minutes, par nœud (au moins une mesure). */
export async function loadRecentProbeSpeeds(): Promise<Record<string, { speedKmh: number; contributors: number; samples: number }>> {
  const out: Record<string, { speedKmh: number; contributors: number; samples: number }> = {};
  try {
    const db = adminDb();
    const now = bucketOf(Date.now());
    const ids = TRACKED_NODES.flatMap(n => [now, now - 1, now - 2].map(b => db.collection('probe_buckets').doc(`${n.id}_${b}`)));
    const snaps = await db.getAll(...ids);
    const acc: Record<string, { sum: number; count: number; who: Set<string> }> = {};
    snaps.forEach(s => {
      if (!s.exists) return;
      const d = s.data() as any;
      const a = acc[d.nodeId] ??= { sum: 0, count: 0, who: new Set() };
      a.sum += Number(d.sumSpeed || 0); a.count += Number(d.count || 0);
      (d.contributors || []).forEach((c: string) => a.who.add(c));
    });
    Object.entries(acc).forEach(([nodeId, a]) => {
      if (a.count > 0) out[nodeId] = { speedKmh: Math.round(a.sum / a.count), contributors: a.who.size, samples: a.count };
    });
  } catch (err) {
    console.warn('[Probes] lecture impossible:', err);
  }
  return out;
}

export function statusFromSpeed(speedKmh: number) {
  if (speedKmh < 8) return 'BLOQUÉ';
  if (speedKmh < 15) return 'EMBOUTEILLAGE';
  if (speedKmh < 25) return 'MODÉRÉ';
  return 'FLUIDE';
}
