/**
 * Mode Conduite : itinéraire, progression et consignes en français (partagé client / serveur).
 * Coordonnées [lat, lng].
 */
import { TRACKED_NODES } from '@/lib/places';

export type LatLng = [number, number];

/** Zone acceptée pour le guidage : Kinshasa et ses abords. [[sud, ouest], [nord, est]] */
export const KINSHASA_BOUNDS: [LatLng, LatLng] = [[-4.75, 15.0], [-4.0, 15.9]];

export interface DriveStep {
  type: string;            // depart, turn, new name, continue, merge, fork, roundabout, rotary, end of road, arrive…
  modifier: string | null; // left, right, slight left, sharp right, straight, uturn
  name: string;
  distance: number;        // m, jusqu'à la manœuvre suivante
  duration: number;        // s
  location: LatLng;        // point de la manœuvre
  exit: number | null;     // sortie de rond-point
}

export interface DriveRoute {
  distance: number;        // m
  duration: number;        // s
  coords: LatLng[];
  steps: DriveStep[];
}

/** Destinations proposées : les carrefours déjà mesurés en direct par l'app. */
export const DRIVE_PLACES = TRACKED_NODES.map(n => ({ id: n.id, name: n.name, point: [n.lat, n.lng] as LatLng }));

export const inKinshasa = ([lat, lng]: LatLng) => {
  const [[s, w], [n, e]] = KINSHASA_BOUNDS;
  return lat >= s && lat <= n && lng >= w && lng <= e;
};

// ───────────────────────────── Géométrie ─────────────────────────────
const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng) {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Cap en degrés (0 = nord, sens horaire). */
export function bearing(a: LatLng, b: LatLng) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function project(p: LatLng, a: LatLng, b: LatLng) {
  const k = Math.cos(rad(p[0]));
  const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0];
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return { t, point: [ay + t * dy, (ax + t * dx) / k] as LatLng };
}

// ───────────────────────────── Itinéraire préparé ─────────────────────────────
export interface PreparedRoute extends DriveRoute {
  along: number[];      // distance cumulée (m) à chaque sommet
  stepAlong: number[];  // distance cumulée (m) au début de chaque étape
}

export function prepareRoute(r: DriveRoute): PreparedRoute {
  const along = [0];
  for (let i = 1; i < r.coords.length; i++) along.push(along[i - 1] + distanceM(r.coords[i - 1], r.coords[i]));
  // Les étapes d'OSRM se suivent : chacune commence là où la précédente s'arrête.
  const stepAlong: number[] = [];
  let acc = 0;
  for (const s of r.steps) { stepAlong.push(acc); acc += s.distance; }
  // Remise à l'échelle sur la longueur réellement tracée (les arrondis d'OSRM s'additionnent)
  const scale = acc ? along[along.length - 1] / acc : 1;
  return { ...r, along, stepAlong: stepAlong.map(x => x * scale) };
}

export interface DriveProgress {
  index: number;         // segment courant (à réutiliser comme point de départ de la recherche suivante)
  snapped: LatLng;       // position ramenée sur l'itinéraire
  offRouteM: number;     // écart entre le GPS et l'itinéraire
  doneM: number;         // distance parcourue sur l'itinéraire
  remainingM: number;
  remainingS: number;
  heading: number;       // cap de la route à cet endroit
  nextStep: DriveStep | null;
  nextStepIndex: number;
  toNextStepM: number;
}

/** Où en est le conducteur ? Recherche autour du dernier segment connu (le GPS avance, il ne saute pas). */
export function progressOn(r: PreparedRoute, pos: LatLng, lastIndex = 0): DriveProgress {
  const n = r.coords.length;
  let best = { d: Infinity, i: 0, t: 0, point: r.coords[0] };
  const from = Math.max(0, lastIndex - 5), to = Math.min(n - 1, lastIndex + 80);
  const scan = (a: number, b: number) => {
    for (let i = a; i < b; i++) {
      const pr = project(pos, r.coords[i], r.coords[i + 1]);
      const d = distanceM(pos, pr.point);
      if (d < best.d) best = { d, i, t: pr.t, point: pr.point };
    }
  };
  scan(from, to);
  if (best.d > 80) scan(0, n - 1);   // perdu (ou demi-tour) : on cherche partout

  const segLen = r.along[best.i + 1] - r.along[best.i];
  const doneM = r.along[best.i] + best.t * segLen;
  const total = r.along[n - 1];
  let k = r.stepAlong.findIndex(a => a > doneM + 5);
  if (k < 0) k = r.steps.length - 1;   // la dernière étape est l'arrivée
  return {
    index: best.i,
    snapped: best.point,
    offRouteM: best.d,
    doneM,
    remainingM: Math.max(0, total - doneM),
    remainingS: total ? r.duration * Math.max(0, total - doneM) / total : 0,
    heading: bearing(r.coords[best.i], r.coords[Math.min(best.i + 1, n - 1)]),
    nextStep: r.steps[k] ?? null,
    nextStepIndex: k,
    toNextStepM: Math.max(0, r.stepAlong[k] - doneM),
  };
}

/** Point situé à `m` mètres du départ, le long de l'itinéraire (pour la conduite simulée). */
export function pointAlong(r: PreparedRoute, m: number): { point: LatLng; heading: number } {
  const n = r.coords.length;
  if (m <= 0) return { point: r.coords[0], heading: bearing(r.coords[0], r.coords[1] ?? r.coords[0]) };
  for (let i = 1; i < n; i++) {
    if (r.along[i] >= m) {
      const t = (m - r.along[i - 1]) / ((r.along[i] - r.along[i - 1]) || 1);
      const a = r.coords[i - 1], b = r.coords[i];
      return { point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], heading: bearing(a, b) };
    }
  }
  return { point: r.coords[n - 1], heading: bearing(r.coords[n - 2] ?? r.coords[0], r.coords[n - 1]) };
}

// ───────────────────────────── Consignes ─────────────────────────────
export type ArrowKind = 'straight' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right' | 'uturn' | 'roundabout' | 'arrive';

export function arrowFor(s: DriveStep | null): ArrowKind {
  if (!s) return 'straight';
  if (s.type === 'arrive') return 'arrive';
  if (s.type === 'roundabout' || s.type === 'rotary' || s.type === 'roundabout turn') return 'roundabout';
  switch (s.modifier) {
    case 'left': return 'left';
    case 'right': return 'right';
    case 'slight left': return 'slight-left';
    case 'slight right': return 'slight-right';
    case 'sharp left': return 'sharp-left';
    case 'sharp right': return 'sharp-right';
    case 'uturn': return 'uturn';
    default: return 'straight';
  }
}

const DIR: Record<string, string> = {
  left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite',
  'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit', uturn: 'demi-tour',
};
const onto = (name: string) => (name ? ` sur ${name}` : '');
const ordinal = (n: number) => (n === 1 ? '1re' : `${n}e`);

/** Consigne en français, courte, lisible d'un coup d'œil. */
export function instruction(s: DriveStep | null): string {
  if (!s) return 'Suivez la route';
  const dir = s.modifier ? DIR[s.modifier] ?? '' : '';
  if (s.modifier === 'uturn' && s.type !== 'arrive' && s.type !== 'depart') return `Faites demi-tour${onto(s.name)}`;
  switch (s.type) {
    case 'depart': return `Démarrez${onto(s.name)}`;
    case 'arrive': return 'Vous êtes arrivé';
    case 'roundabout':
    case 'rotary':
      return s.exit ? `Au rond-point, prenez la ${ordinal(s.exit)} sortie${onto(s.name)}` : `Au rond-point, continuez${onto(s.name)}`;
    case 'roundabout turn': return `Au rond-point, tournez ${dir}${onto(s.name)}`;
    case 'fork': return `À l'embranchement, restez ${dir || 'sur la voie'}${onto(s.name)}`;
    case 'merge': return `Rejoignez la voie${onto(s.name)}`;
    case 'on ramp': return `Prenez la bretelle${onto(s.name)}`;
    case 'off ramp': return `Sortez${onto(s.name)}`;
    case 'end of road': return `Au bout de la route, tournez ${dir}${onto(s.name)}`;
    case 'new name':
    case 'continue':
      return s.modifier && s.modifier !== 'straight' ? `Continuez ${dir}${onto(s.name)}` : `Continuez${onto(s.name)}`;
    default:
      if (s.modifier === 'uturn') return `Faites demi-tour${onto(s.name)}`;
      if (s.modifier === 'straight') return `Continuez tout droit${onto(s.name)}`;
      return `Tournez ${dir}${onto(s.name)}`;
  }
}

/** « 350 m », « 1,2 km » : arrondi comme le ferait un copilote. */
export function formatDistance(m: number) {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1).replace('.', ',')} km`;
  if (m >= 100) return `${Math.round(m / 50) * 50} m`;
  return `${Math.max(10, Math.round(m / 10) * 10)} m`;
}

export function formatDuration(s: number) {
  const min = Math.max(1, Math.round(s / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}
