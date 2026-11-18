/**
 * Mode Conduite, phase 2 : alertes le long de l'itinéraire (partagé client / serveur, sans état React).
 *
 * Sources : carrefours et tronçons mesurés en direct, signalements récents des usagers, presse et
 * ministère (src/data/road-reports.json), pluie (Open-Meteo). Chaque danger est placé à sa distance
 * le long de l'itinéraire ; l'annonceur choisit quoi dire et quand, sans saturer le conducteur.
 */
import { distanceM, type LatLng, type PreparedRoute } from '@/lib/drive';
import { PRESS_REPORTS, type PressReportView } from '@/lib/road-reports';

// ───────────────────────────── Données reçues du serveur ─────────────────────────────
export interface DriveIntel {
  nodes: Array<{ id: string; name: string; point: LatLng; status: string; delayMin: number | null; isLive: boolean; cause: string | null; lingala: string | null; escape: string | null }>;
  corridors: Array<{ id: string; name: string; pts: LatLng[]; status: string; delayMin: number | null; isLive: boolean }>;
  reports: Array<{ id: string; type: string; description: string; locationName: string | null; point: LatLng; ageMin: number; votes: number }>;
  weather: { rainMmH: number; rainProbNext2h: number } | null;
  fetchedAt: number;
}

export type HazardKind = 'traffic' | 'closure' | 'flood' | 'road' | 'accident' | 'police' | 'works';
export type Severity = 1 | 2 | 3;

export interface Hazard {
  id: string;
  kind: HazardKind;
  severity: Severity;
  title: string;          // titre court, lu à voix haute
  detail: string | null;  // une ligne de contexte (cause, ancienneté, source)
  ln: string | null;      // la même alerte en lingala (affichée ; voix enregistrée plus tard)
  atM: number;            // position le long de l'itinéraire (m depuis le départ)
  point: LatLng;
  source: 'mesure' | 'usager' | 'presse' | 'ministère' | 'historique';
  delayMin: number | null;
  precise: boolean;       // position connue au tronçon près (sinon « quelque part sur l'avenue »)
  vote?: { nodeId: string; nodeName: string };   // carrefour suivi : vote « toujours bouché / dégagé »
  reportId?: string;                               // signalement d'usager : « toujours là ? »
}

export const HAZARD_STYLE: Record<HazardKind, { icon: string; color: string; label: string }> = {
  traffic: { icon: '🚗', color: '#ef4444', label: 'Bouchon' },
  closure: { icon: '⛔', color: '#dc2626', label: 'Route fermée' },
  flood: { icon: '🌊', color: '#2563eb', label: 'Inondation' },
  road: { icon: '⚠️', color: '#ea580c', label: 'Route abîmée' },
  accident: { icon: '💥', color: '#111827', label: 'Accident' },
  police: { icon: '🚓', color: '#3b82f6', label: 'Contrôle' },
  works: { icon: '🚧', color: '#7c3aed', label: 'Travaux' },
};

// Lingala court et courant ; à faire relire, puis à enregistrer par une vraie voix kinoise.
const LN: Record<HazardKind | 'rain' | 'rainSoon' | 'slow', string> = {
  traffic: 'Bouchon liboso, bongisa ndenge okoleka.',
  closure: 'Nzela ekangami liboso.',
  flood: 'Mai etondi nzela liboso, keba.',
  road: 'Nzela ebebi liboso, kende malembe.',
  accident: 'Likama liboso, keba.',
  police: 'Ba polisi bazali liboso.',
  works: 'Misala ezali na nzela liboso.',
  rain: 'Mbula ezali kobeta, kende malembe.',
  rainSoon: 'Mbula ekoya mwa moke.',
  slow: 'Kende malembe !',
};
export const LINGALA = LN;

// ───────────────────────────── Placement sur l'itinéraire ─────────────────────────────
function projectAlong(r: PreparedRoute, p: LatLng): { atM: number; lateral: number } {
  let best = { atM: 0, lateral: Infinity };
  const k = Math.cos((p[0] * Math.PI) / 180);
  for (let i = 0; i < r.coords.length - 1; i++) {
    const a = r.coords[i], b = r.coords[i + 1];
    const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p[1] * k - ax) * dx + (p[0] - ay) * dy) / L)) : 0;
    const q: LatLng = [ay + t * dy, (ax + t * dx) / k];
    const d = distanceM(p, q);
    if (d < best.lateral) best = { atM: r.along[i] + t * (r.along[i + 1] - r.along[i]), lateral: d };
  }
  return best;
}

/** Un point (carrefour, signalement) est-il sur l'itinéraire ? → sa position, sinon null. */
function pointOnRoute(r: PreparedRoute, p: LatLng, maxLateral: number) {
  const pr = projectAlong(r, p);
  return pr.lateral <= maxLateral ? pr.atM : null;
}

/** Un tronçon (liste de points) emprunté par l'itinéraire ? Il faut ≥ 2 de ses points sur la route (1 s'il est court). */
function lineOnRoute(r: PreparedRoute, pts: LatLng[], maxLateral: number) {
  const hits = pts.map(p => projectAlong(r, p)).filter(h => h.lateral <= maxLateral);
  if (hits.length >= Math.min(2, pts.length)) return Math.min(...hits.map(h => h.atM));
  return null;
}

const congestedSeverity = (status: string): Severity | null =>
  status === 'BLOQUÉ' ? 3 : status === 'EMBOUTEILLAGE' ? 2 : null;

const PRESS_KIND: Partial<Record<PressReportView['category'], { kind: HazardKind; severity: Severity }>> = {
  closure: { kind: 'closure', severity: 3 },
  flood: { kind: 'flood', severity: 3 },
  erosion: { kind: 'road', severity: 2 },
  pothole: { kind: 'road', severity: 2 },
  accident: { kind: 'accident', severity: 2 },
  works: { kind: 'works', severity: 1 },
  congestion: { kind: 'traffic', severity: 1 },
};

const USER_KIND: Record<string, { kind: HazardKind; severity: Severity; title: string }> = {
  blockage: { kind: 'closure', severity: 3, title: 'Route bloquée signalée' },
  damaged_road: { kind: 'road', severity: 2, title: 'Route abîmée signalée' },
  pothole: { kind: 'road', severity: 2, title: 'Nid-de-poule signalé' },
  police: { kind: 'police', severity: 1, title: 'Contrôle de police signalé' },
};

/**
 * Tous les dangers présents sur cet itinéraire, triés par position.
 * `press` = signalements presse/ministère actifs ; `raining` ajoute les tronçons qui inondent d'habitude.
 */
export function hazardsOnRoute(r: PreparedRoute, intel: DriveIntel | null, press: PressReportView[], raining: boolean): Hazard[] {
  const out: Hazard[] = [];

  for (const n of intel?.nodes ?? []) {
    const sev = congestedSeverity(n.status);
    if (!sev) continue;
    const atM = pointOnRoute(r, n.point, 150);
    if (atM == null) continue;
    out.push({
      id: `node:${n.id}`, kind: 'traffic', severity: sev, atM, point: n.point,
      title: sev === 3 ? `Ça bloque à ${n.name}` : `Bouchon à ${n.name}`,
      detail: [n.delayMin != null ? `+${n.delayMin} min` : null, n.cause, n.isLive ? 'mesuré en direct' : 'estimation'].filter(Boolean).join(' · '),
      ln: n.lingala ?? LN.traffic, source: 'mesure', delayMin: n.delayMin, precise: true,
      vote: { nodeId: n.id, nodeName: n.name },
    });
  }

  for (const c of intel?.corridors ?? []) {
    const sev = congestedSeverity(c.status);
    if (!sev) continue;
    const atM = lineOnRoute(r, c.pts, 60);
    if (atM == null) continue;
    out.push({
      id: `corridor:${c.id}`, kind: 'traffic', severity: sev, atM, point: c.pts[0],
      title: sev === 3 ? `${c.name} : ça bloque` : `Bouchon sur ${c.name}`,
      detail: [c.delayMin != null ? `+${c.delayMin} min` : null, c.isLive ? 'mesuré en direct' : 'estimation'].filter(Boolean).join(' · '),
      ln: LN.traffic, source: 'mesure', delayMin: c.delayMin, precise: true,
    });
  }

  for (const rep of intel?.reports ?? []) {
    const k = USER_KIND[rep.type];
    if (!k) continue;
    const atM = pointOnRoute(r, rep.point, 60);
    if (atM == null) continue;
    out.push({
      id: `report:${rep.id}`, kind: k.kind, severity: k.severity, atM, point: rep.point, title: k.title,
      detail: [rep.description.slice(0, 80) || null, `il y a ${rep.ageMin} min`, rep.votes ? `${rep.votes} confirmation${rep.votes > 1 ? 's' : ''}` : null].filter(Boolean).join(' · '),
      ln: LN[k.kind], source: 'usager', delayMin: null, precise: true, reportId: rep.id,
    });
  }

  for (const p of press) {
    const k = PRESS_KIND[p.category];
    if (!k || !p.geo || p.geo.quality.endsWith('_center') || p.geo.quality === 'manual_area') continue;
    const atM = p.geo.lines?.length
      ? Math.min(...p.geo.lines.map(l => lineOnRoute(r, l, 40) ?? Infinity))
      : pointOnRoute(r, p.geo.point, 80);
    if (atM == null || !Number.isFinite(atM)) continue;
    const where = p.geo.osmNames?.[0] ?? p.geo.area ?? p.road ?? '';
    const precise = p.geo.quality === 'segment' || p.geo.quality === 'near_landmark' || p.geo.quality.startsWith('intersection') || p.geo.quality === 'manual_point';
    out.push({
      id: `press:${p.id}`, kind: k.kind, severity: k.severity, atM, point: p.geo.point,
      title: `${HAZARD_STYLE[k.kind].label}${where ? ` ${precise ? 'sur' : 'quelque part sur'} ${where}` : ''}`,
      detail: `${p.source.tier === 'official' ? 'Ministère' : p.source.tier === 'social' ? 'Réseaux sociaux (non vérifié)' : 'Presse'} · ${p.title.slice(0, 90)}`,
      ln: LN[k.kind], source: p.source.tier === 'official' ? 'ministère' : 'presse', delayMin: null, precise,
    });
  }

  // Sous la pluie : les tronçons où la presse a déjà signalé des inondations cette année
  if (raining) {
    const seen = new Set<string>();
    for (const p of PRESS_REPORTS) {
      if (p.category !== 'flood' || !p.geo?.lines?.length) continue;
      const key = (p.geo.osmNames?.[0] ?? p.road ?? p.id).toLowerCase();
      if (seen.has(key)) continue;
      const atM = Math.min(...p.geo.lines.map(l => lineOnRoute(r, l, 40) ?? Infinity));
      if (!Number.isFinite(atM)) continue;
      seen.add(key);
      out.push({
        id: `history:${key}`, kind: 'flood', severity: 2, atM, point: p.geo.point,
        title: `${p.geo.osmNames?.[0] ?? p.road} inonde souvent quand il pleut`,
        detail: 'Inondations signalées par la presse cette année', ln: LN.flood, source: 'historique', delayMin: null, precise: false,
      });
    }
  }

  // Un seul danger du même type à moins de 150 m : on garde le plus grave
  out.sort((a, b) => a.atM - b.atM || b.severity - a.severity);
  const kept: Hazard[] = [];
  for (const h of out) {
    const dup = kept.find(k => k.kind === h.kind && Math.abs(k.atM - h.atM) < 150);
    if (!dup) kept.push(h);
    else if (h.severity > dup.severity) kept[kept.indexOf(dup)] = h;
  }
  return kept;
}

// ───────────────────────────── Temps de trajet et itinéraires bis ─────────────────────────────
const assumedDelay = (h: Hazard) => (h.kind !== 'traffic' ? 0 : h.delayMin ?? (h.severity === 3 ? 8 : h.severity === 2 ? 4 : 1));

/** Retard des bouchons mesurés encore devant soi (minutes). */
export function delayAheadMin(hazards: Hazard[], doneM: number) {
  return hazards.filter(h => h.atM > doneM - 50).reduce((s, h) => s + assumedDelay(h), 0);
}

/** Coût d'un itinéraire en minutes : temps à vide + bouchons + forte pénalité si fermé ou inondé. */
export function routeCostMin(r: PreparedRoute, hazards: Hazard[]) {
  const blockers = hazards.filter(h => (h.kind === 'closure' || h.kind === 'flood') && h.severity === 3).length;
  return r.duration / 60 + hazards.reduce((s, h) => s + assumedDelay(h), 0) + blockers * 30;
}

// ───────────────────────────── Annonceur ─────────────────────────────
const ANNOUNCE_AT_M: Record<HazardKind, number> = { traffic: 1500, closure: 1200, flood: 1200, accident: 800, road: 500, works: 500, police: 400 };

export interface AnnouncerState { announced: Set<string>; lastAt: number }
export const newAnnouncer = (): AnnouncerState => ({ announced: new Set(), lastAt: -Infinity });

/**
 * Quelle alerte annoncer maintenant ? Une par une, au plus une toutes les 30 s (10 s si c'est grave),
 * chacune une seule fois par trajet, la plus grave puis la plus proche d'abord.
 */
export function nextAnnouncement(state: AnnouncerState, hazards: Hazard[], doneM: number, now: number): Hazard | null {
  // Les infos vagues et mineures (travaux « quelque part sur l'avenue ») restent dans la liste, sans voix.
  const due = hazards.filter(h => (h.precise || h.severity >= 2) && !state.announced.has(h.id) && h.atM - doneM > -20 && h.atM - doneM <= ANNOUNCE_AT_M[h.kind]);
  if (!due.length) return null;
  due.sort((a, b) => b.severity - a.severity || a.atM - b.atM);
  const h = due[0];
  const gap = h.severity === 3 ? 10_000 : 30_000;
  if (now - state.lastAt < gap) return null;
  state.announced.add(h.id);
  state.lastAt = now;
  return h;
}

/** « Ralentissez » : un danger sur la chaussée à moins de 250 m et plus de 40 km/h. */
export function shouldSlowDown(hazards: Hazard[], doneM: number, speedKmh: number) {
  return speedKmh > 40 && hazards.some(h => h.precise && h.kind !== 'traffic' && h.kind !== 'police' && h.atM - doneM > 0 && h.atM - doneM < 250);
}

/** Message pluie (ville entière) : il pleut, ou forte probabilité dans les 2 h. */
export function rainMessage(w: DriveIntel['weather']): { level: 'raining' | 'soon'; fr: string; ln: string } | null {
  if (!w) return null;
  if (w.rainMmH >= 0.3) return { level: 'raining', fr: 'Il pleut : roulez doucement, des avenues peuvent être inondées.', ln: LN.rain };
  if (w.rainProbNext2h >= 60) return { level: 'soon', fr: `Pluie probable dans les 2 heures (${Math.round(w.rainProbNext2h)} %).`, ln: LN.rainSoon };
  return null;
}

/** Phrase lue à voix haute pour une alerte : « Dans 800 mètres, bouchon à Rond-point Victoire. » */
export function spokenAlert(h: Hazard, distM: number) {
  const d = distM < 80 ? 'Attention' : `Dans ${distM >= 1000 ? `${(distM / 1000).toFixed(1).replace('.', ',')} kilomètre` : `${Math.round(distM / 50) * 50} mètres`}`;
  return `${d}, ${h.title.charAt(0).toLowerCase()}${h.title.slice(1)}.`;
}
