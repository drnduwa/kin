import { NextResponse } from 'next/server';
import { KINSHASA_BOUNDS, type DriveRoute, type DriveStep, type LatLng } from '@/lib/drive';

/**
 * Itinéraire pour le Mode Conduite.
 *   GET /api/drive-route?from=lat,lng&to=lat,lng → { routes: DriveRoute[] } (le premier est le meilleur)
 *
 * Calculé par OSRM sur les routes OpenStreetMap (pas par Google : leurs conditions interdisent le
 * guidage en temps réel avec le service d'itinéraires). Par défaut on utilise le serveur de
 * démonstration d'OSRM, réservé aux essais (≈ 1 requête/s) : en production, mettre OSRM_URL vers
 * notre propre serveur OSRM. Seuls les trajets dans Kinshasa sont acceptés.
 */
const OSRM_URL = process.env.OSRM_URL ?? 'https://router.project-osrm.org';

function parsePoint(s: string | null): LatLng | null {
  const m = s?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const p: LatLng = [Number(m[1]), Number(m[2])];
  const [[s0, w], [n, e]] = KINSHASA_BOUNDS;
  return p[0] >= s0 && p[0] <= n && p[1] >= w && p[1] <= e ? p : null;
}

interface OsrmStep {
  distance: number;
  duration: number;
  name: string;
  ref?: string;
  maneuver: { type: string; modifier?: string; location: [number, number]; exit?: number; bearing_after?: number };
}
interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { steps: OsrmStep[] }[];
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = parsePoint(params.get('from'));
  const to = parsePoint(params.get('to'));
  if (!from || !to) {
    return NextResponse.json({ error: 'Départ et arrivée doivent être dans Kinshasa (from=lat,lng&to=lat,lng).' }, { status: 400 });
  }

  const url = `${OSRM_URL}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=true&alternatives=true`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'KinshasaFlow-ModeConduite/0.1' }, cache: 'no-store' });
    const data = await res.json() as { code: string; routes?: OsrmRoute[] };
    if (!res.ok || data.code !== 'Ok' || !data.routes?.length) {
      return NextResponse.json({ error: 'Aucun itinéraire trouvé.' }, { status: 404 });
    }
    const routes: DriveRoute[] = data.routes.map(r => ({
      distance: r.distance,
      duration: r.duration,
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng),
      steps: r.legs.flatMap(l => l.steps).map((s): DriveStep => ({
        type: s.maneuver.type,
        modifier: s.maneuver.modifier ?? null,
        name: s.name || s.ref || '',
        distance: s.distance,
        duration: s.duration,
        location: [s.maneuver.location[1], s.maneuver.location[0]],
        exit: s.maneuver.exit ?? null,
      })),
    }));
    return NextResponse.json({ routes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Le calcul d’itinéraire ne répond pas. Réessayez.' }, { status: 502 });
  }
}
