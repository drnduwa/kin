/**
 * Mémoire du trafic mesuré, pour les prévisions (serveur uniquement, Admin SDK).
 *
 * Une fiche par tronçon et par jour de Kinshasa : traffic_profiles/{clé}_{AAAA-MM-JJ}
 *   { key, day, dayOfWeek, slots: { "<créneau 0–95>": retard en minutes } }
 * Une seule valeur par créneau de 15 min (la dernière gagne) : plusieurs visites du centre de
 * contrôle dans le même quart d'heure ne gonflent pas l'historique. Lire 6 semaines coûte
 * 42 lectures par tronçon, quel que soit le nombre de mesures.
 *
 * Clés : `node:<id>` (8 carrefours), `corridor:<id>` (axes mesurés), `axis:<nom>` (grands axes).
 */
import { adminDb } from '@/firebase/admin';
import { kinDaySlot, slotToTime, type Sample } from '@/lib/forecast';

const COL = 'traffic_profiles';

function docId(key: string, day: string) {
  return `${key.replace(/\//g, '-')}_${day}`;
}

/** Enregistre des mesures EN DIRECT (jamais des estimations, sinon le modèle apprendrait ses propres suppositions). */
export async function recordMeasurements(items: Array<{ key: string; delay: number | null | undefined }>, at = Date.now()) {
  const valid = items.filter(i => typeof i.delay === 'number' && Number.isFinite(i.delay) && i.delay >= 0 && i.delay < 240);
  if (!valid.length) return;
  const { day, slot } = kinDaySlot(at);
  const dayOfWeek = new Date(Date.parse(`${day}T12:00:00Z`)).getUTCDay();
  const db = adminDb();
  await Promise.allSettled(valid.map(i =>
    db.collection(COL).doc(docId(i.key, day)).set(
      { key: i.key, day, dayOfWeek, slots: { [String(slot)]: Math.round(i.delay as number) } },
      { merge: true },
    ),
  ));
}

/** Mesures des `days` derniers jours d'un tronçon. */
export async function loadSamples(key: string, days = 42, now = Date.now()): Promise<Sample[]> {
  const db = adminDb();
  const refs = Array.from({ length: days }, (_, i) => db.collection(COL).doc(docId(key, kinDaySlot(now - i * 86400000).day)));
  const snaps = await db.getAll(...refs);
  const out: Sample[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const d = snap.data() as { day: string; slots?: Record<string, number> };
    for (const [slot, delay] of Object.entries(d.slots || {})) {
      if (typeof delay === 'number') out.push({ t: slotToTime(d.day, Number(slot)), delay });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Nombre de jours ayant au moins une mesure (pour dire « en apprentissage »). */
export function daysCovered(samples: Sample[]) {
  return new Set(samples.map(s => kinDaySlot(s.t).day)).size;
}
