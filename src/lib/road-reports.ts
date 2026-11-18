/**
 * Signalements routiers de la presse, du ministère provincial et des réseaux sociaux,
 * placés sur les rues OpenStreetMap par scripts/road-reports/build-road-reports.mjs.
 * Tracés © contributeurs OpenStreetMap (ODbL).
 */
import data from '@/data/road-reports.json';

export type LatLng = [number, number];
export type PressCategory = 'flood' | 'closure' | 'erosion' | 'pothole' | 'works' | 'congestion' | 'accident' | 'reopened' | 'other';
export type GeoQuality =
  | 'segment' | 'intersection' | 'near_landmark' | 'road' | 'road_fuzzy' | 'road_ambiguous'
  | 'intersection_approx' | 'quarter_center' | 'commune_center';

export interface PressRoadReport {
  id: string;
  observedAt: string | null;
  expiresAt: string | null;
  category: PressCategory;
  appType: 'pothole' | 'blockage' | 'damaged_road' | null;
  status: string;
  severity: 'high' | 'medium' | 'low' | 'unknown';
  trend: string | null;
  title: string;
  area: string | null;
  road: string | null;
  segment: string | null;
  detours: string[];
  source: { tier: 'official' | 'press' | 'social'; type: string; name: string; urls: string[] };
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  flags: string[];
  geo: null | {
    quality: GeoQuality;
    point: LatLng;
    lines: LatLng[][] | null;
    osmWayIds: number[];
    osmNames?: string[];
    area?: string;
  };
}

export const PRESS_REPORTS = (data as { reports: PressRoadReport[] }).reports;
export const PRESS_SOURCES = (data as { sources: { osm: { snapshot: string | null; attribution: string } } }).sources;

export const PRESS_CATEGORIES: Record<PressCategory, { label: string; color: string; icon: string }> = {
  flood: { label: 'Inondation', color: '#2563eb', icon: '🌊' },
  closure: { label: 'Route fermée', color: '#dc2626', icon: '⛔' },
  erosion: { label: 'Érosion', color: '#92400e', icon: '🕳️' },
  pothole: { label: 'Chaussée abîmée', color: '#ea580c', icon: '⚠️' },
  works: { label: 'Travaux', color: '#7c3aed', icon: '🚧' },
  congestion: { label: 'Embouteillage', color: '#ca8a04', icon: '🚗' },
  accident: { label: 'Accident', color: '#111827', icon: '💥' },
  reopened: { label: 'Rouverte / refaite', color: '#16a34a', icon: '✅' },
  other: { label: 'Autre', color: '#64748b', icon: '📍' },
};

export const PRESS_STATUS_LABELS: Record<string, string> = {
  closed: 'Fermée', impassable: 'Impraticable', flooded: 'Inondée', at_risk: 'Menacée', degraded: 'Dégradée',
  works: 'En travaux', congested: 'Embouteillée', incident: 'Incident', open: 'Ouverte', unknown: 'État inconnu',
};

export const SOURCE_TIER_LABELS = {
  official: 'Ministère',
  press: 'Presse',
  social: 'Réseaux sociaux · non vérifié',
} as const;

/** Durée d'affichage quand la source ne donne pas de date de fin. */
const LIFESPAN_DAYS: Record<PressCategory, number> = {
  flood: 2, accident: 2, congestion: 3, other: 14, reopened: 21, closure: 30, pothole: 60, erosion: 90, works: 180,
};
const DAY = 86_400_000;

/** « 2026-11-18 » = midi, heure de Kinshasa ; sinon la date ISO complète. */
export function reportTime(s: string | null): number {
  if (!s) return NaN;
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00+01:00` : s).getTime();
}

export function reportEnd(r: PressRoadReport): number {
  if (r.expiresAt) return reportTime(r.expiresAt);
  return reportTime(r.observedAt) + LIFESPAN_DAYS[r.category] * DAY;
}

/** Un chantier ou une réouverture plus récents sur les mêmes rues rendent caducs les signalements plus anciens. */
function supersededIds(reports: PressRoadReport[]): Set<string> {
  const out = new Set<string>();
  const fresh = reports.filter(r => (r.category === 'works' || r.category === 'reopened') && r.geo?.osmWayIds.length);
  for (const r of reports) {
    if (!r.geo?.osmWayIds.length || !['pothole', 'erosion', 'flood', 'works'].includes(r.category)) continue;
    const t = reportTime(r.observedAt);
    const ways = new Set(r.geo.osmWayIds);
    if (fresh.some(f => f.id !== r.id && reportTime(f.observedAt) > t && f.geo!.osmWayIds.some(w => ways.has(w)))) out.add(r.id);
  }
  return out;
}

export interface PressReportView extends PressRoadReport {
  active: boolean;
  supersededBy: boolean;
}

/** Signalements placés sur la carte, avec leur état à l'instant `now`. */
export function pressReportsAt(now: number = Date.now()): PressReportView[] {
  const sup = supersededIds(PRESS_REPORTS);
  return PRESS_REPORTS.filter(r => r.geo).map(r => {
    const start = reportTime(r.observedAt);
    const active = !sup.has(r.id) && start <= now && now < reportEnd(r);
    return { ...r, active, supersededBy: sup.has(r.id) };
  });
}

/** Libellé de précision de la position, affiché quand elle est approximative. */
export function positionNote(q: GeoQuality, area?: string): string | null {
  switch (q) {
    case 'commune_center': return `Position approximative : centre de la commune ${area ?? ''}`.trim();
    case 'quarter_center': return `Position approximative : centre du quartier ${area ?? ''}`.trim();
    case 'intersection_approx': return 'Croisement approximatif';
    case 'road_ambiguous': return 'Plusieurs rues portent ce nom : à vérifier';
    case 'road': return 'Tronçon exact non précisé : toute la rue est indiquée';
    default: return null;
  }
}
