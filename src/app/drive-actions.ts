'use server';

/**
 * Mode Conduite : données pour les alertes (phase 2) et journal des trajets (test terrain, phase 4).
 */
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { getServerFirestore } from '@/firebase/server';
import { adminDb, verifyAdmin, verifyCaller } from '@/firebase/admin';
import { getRealtimeCommandDashboardAction } from '@/app/actions';
import { BLACK_SPOTS, CORRIDORS, type LatLng } from '@/lib/corridors';
import type { DriveIntel } from '@/lib/drive-alerts';

const REPORT_FRESH_MIN = 60;

const tsToMs = (t: unknown): number | null => {
  if (!t) return null;
  if (typeof (t as { toMillis?: () => number }).toMillis === 'function') return (t as { toMillis: () => number }).toMillis();
  if (typeof (t as { seconds?: number }).seconds === 'number') return (t as { seconds: number }).seconds * 1000;
  return null;
};

/** Tracé d'un tronçon mesuré : son dessin OSM s'il existe, sinon les points de mesure. */
function corridorShape(id: string): { name: string; pts: LatLng[] } | null {
  const c = CORRIDORS.find(x => x.id === id);
  if (c) {
    const pts = c.pts ?? (c.seg ? [c.seg.o, ...(c.seg.v ? [c.seg.v] : []), c.seg.d] : null);
    return pts ? { name: c.name, pts } : null;
  }
  const b = BLACK_SPOTS.find(x => x.id === id);
  if (b?.seg) return { name: b.name, pts: [b.seg.o, ...(b.seg.v ? [b.seg.v] : []), b.seg.d] };
  return null;
}

/**
 * État du trafic utile en conduite : carrefours et tronçons mesurés, signalements récents des usagers,
 * pluie. Le tableau de bord est déjà en cache 90 s côté serveur : appeler souvent ne coûte rien.
 */
export async function getDriveIntelAction(): Promise<DriveIntel> {
  const dash = await getRealtimeCommandDashboardAction().catch(() => null) as null | {
    bottlenecks?: Array<Record<string, unknown>>;
    corridors?: Record<string, { status: string; delayMin: number | null; speedKmh: number | null; isLive: boolean }>;
    globalMetrics?: { weather?: { rainMmH: number; rainProbNext2h: number } | null };
  };

  const nodes = (dash?.bottlenecks ?? []).map(b => {
    const c = b.coords as { lat: number; lng: number } | undefined;
    return c ? {
      id: String(b.id),
      name: String(b.name),
      point: [c.lat, c.lng] as LatLng,
      status: String(b.status ?? 'INCONNU'),
      delayMin: typeof b.delayMin === 'number' ? b.delayMin : null,
      isLive: b.isLive === true,
      cause: typeof b.cause === 'string' ? b.cause : null,
      lingala: typeof b.lingala === 'string' ? b.lingala : null,
      escape: typeof b.certifiedAlt === 'string' ? b.certifiedAlt : null,
    } : null;
  }).filter(<T,>(x: T | null): x is T => x !== null);

  const corridors = Object.entries(dash?.corridors ?? {}).map(([id, s]) => {
    const shape = corridorShape(id);
    return shape ? { id, name: shape.name, pts: shape.pts, status: s.status, delayMin: s.delayMin, isLive: s.isLive } : null;
  }).filter(<T,>(x: T | null): x is T => x !== null);

  let reports: DriveIntel['reports'] = [];
  try {
    const snap = await getDocs(query(collection(getServerFirestore(), 'road_condition_reports'), orderBy('createdAt', 'desc'), limit(60)));
    const now = Date.now();
    reports = snap.docs.map(d => ({ ...(d.data() as Record<string, unknown>), id: d.id }) as Record<string, unknown> & { id: string })
      .filter(r => {
        const coords = r.coords as { lat?: number; lng?: number } | undefined;
        if (r.status === 'expired' || typeof coords?.lat !== 'number') return false;
        // un signalement confirmé par d'autres reste plus longtemps (comme sur le tableau de bord)
        const maxAge = (Number(r.votes || 0) >= 2 ? REPORT_FRESH_MIN * 1.5 : REPORT_FRESH_MIN) * 60_000;
        return now - (tsToMs(r.createdAt) ?? 0) <= maxAge;
      })
      .map(r => {
        const coords = r.coords as { lat: number; lng: number };
        return {
          id: r.id,
          type: String(r.type ?? 'blockage'),
          description: String(r.description ?? ''),
          locationName: r.locationName ? String(r.locationName) : null,
          point: [coords.lat, coords.lng] as LatLng,
          ageMin: Math.max(0, Math.round((now - (tsToMs(r.createdAt) ?? now)) / 60_000)),
          votes: Number(r.votes || 0),
        };
      });
  } catch { /* sans signalements, les autres alertes restent valables */ }

  return {
    nodes,
    corridors,
    reports,
    weather: dash?.globalMetrics?.weather ?? null,
    fetchedAt: Date.now(),
  };
}

/**
 * Journal anonyme d'un trajet en Mode Conduite, pour mesurer le test terrain (combien de trajets,
 * d'alertes, de confirmations). Aucune position n'est enregistrée : seulement des totaux.
 */
export async function logDriveTripAction(params: {
  idToken: string;
  distanceM: number;
  durationS: number;
  alerts: number;
  confirmations: number;
  reroutes: number;
  simulated: boolean;
  completed: boolean;
}) {
  try {
    const { uid } = await verifyCaller(params.idToken);
    const clamp = (n: number, max: number) => (Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0);
    await adminDb().collection('drive_trips').add({
      userId: uid,
      createdAt: new Date(),
      distanceM: clamp(params.distanceM, 200_000),
      durationS: clamp(params.durationS, 6 * 3600),
      alerts: clamp(params.alerts, 500),
      confirmations: clamp(params.confirmations, 500),
      reroutes: clamp(params.reroutes, 100),
      simulated: params.simulated === true,
      completed: params.completed === true,
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Bilan du test terrain (admins) : trajets réels des 14 derniers jours, par conducteur.
 * Critère de réussite du plan : au moins la moitié des testeurs l'utilisent plusieurs fois par semaine.
 */
export async function getDriveTripStatsAction(idToken: string) {
  try {
    await verifyAdmin(idToken);
    const since = new Date(Date.now() - 14 * 86_400_000);
    const snap = await adminDb().collection('drive_trips').where('createdAt', '>=', since).orderBy('createdAt', 'desc').limit(2000).get();
    type Trip = { userId: string; distanceM: number; alerts: number; confirmations: number; reroutes: number; simulated: boolean; completed: boolean; createdAt: { toDate: () => Date } };
    const trips = snap.docs.map(d => d.data() as Trip);
    const real = trips.filter(t => !t.simulated);
    const days = new Map<string, Set<string>>();
    for (const t of real) {
      const d = days.get(t.userId) ?? new Set<string>();
      d.add(t.createdAt.toDate().toISOString().slice(0, 10));
      days.set(t.userId, d);
    }
    return {
      success: true as const,
      realTrips: real.length,
      demoTrips: trips.length - real.length,
      drivers: days.size,
      regularDrivers: [...days.values()].filter(d => d.size >= 4).length,   // ≥ 4 jours sur 14 ≈ plusieurs fois par semaine
      km: Math.round(real.reduce((s, t) => s + t.distanceM, 0) / 1000),
      completedRate: real.length ? Math.round((100 * real.filter(t => t.completed).length) / real.length) : 0,
      alerts: real.reduce((s, t) => s + t.alerts, 0),
      confirmations: real.reduce((s, t) => s + t.confirmations, 0),
      reroutes: real.reduce((s, t) => s + t.reroutes, 0),
    };
  } catch (e) {
    return { success: false as const, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
