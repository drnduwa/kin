/**
 * Règles du jeu Kinshasa Flow (partagées client / serveur).
 *
 * Boucle : on vote ou on signale → XP (+ FC dans la limite journalière) → niveaux, missions,
 * séries, badges et classement des communes. Toutes les écritures de score sont faites par le
 * serveur (Admin SDK) : le client ne fait que lire.
 */

export const XP = {
  vote: 15,
  report: 40,
  streakDay: 10,
} as const;

/** Niveau n atteint à 50·n·(n−1) XP : 0, 100, 300, 600, 1 000, 1 500… */
export function xpForLevel(level: number) {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current: xp - start, needed: next - start, pct: Math.round(((xp - start) / (next - start)) * 100) };
}

/** Rangs en mots que les Kinois utilisent déjà. */
export const RANKS: Array<{ from: number; name: string }> = [
  { from: 1, name: 'Piéton' },
  { from: 3, name: 'Wewa' },
  { from: 6, name: 'Taximan' },
  { from: 10, name: 'Chauffeur Esprit de Mort' },
  { from: 15, name: 'Pilote de Kin' },
  { from: 20, name: 'Mokonzi ya Nzela' },
];

export function rankFor(level: number) {
  return [...RANKS].reverse().find(r => level >= r.from)!.name;
}

export type MissionKind = 'vote' | 'clearVote' | 'report';

/** Missions du jour : elles demandent exactement les données dont la carte a besoin. */
export const DAILY_MISSIONS: Array<{ id: string; kind: MissionKind; target: number; xp: number; label: string; href: string }> = [
  { id: 'vote3', kind: 'vote', target: 3, xp: 60, label: 'Donne l’état de 3 carrefours', href: '/verifier-trafic' },
  { id: 'clear1', kind: 'clearVote', target: 1, xp: 30, label: 'Dis « c’est dégagé » quand la route est libre', href: '/verifier-trafic' },
  { id: 'report1', kind: 'report', target: 1, xp: 80, label: 'Signale un problème sur la carte', href: '/hazard-map' },
];

export const BADGES: Array<{ id: string; label: string; hint: string; test: (s: { votes: number; reports: number; streak: number; level: number }) => boolean }> = [
  { id: 'premier-vote', label: 'Premier pas', hint: '1er vote', test: s => s.votes >= 1 },
  { id: 'premier-signal', label: 'Premier signal', hint: '1er signalement', test: s => s.reports >= 1 },
  { id: 'oeil', label: 'Œil du carrefour', hint: '25 votes', test: s => s.votes >= 25 },
  { id: 'sentinelle', label: 'Sentinelle', hint: '10 signalements', test: s => s.reports >= 10 },
  { id: 'serie-7', label: 'Série de 7', hint: '7 jours de suite', test: s => s.streak >= 7 },
  { id: 'taximan', label: 'Taximan', hint: 'Niveau 6', test: s => s.level >= 6 },
  { id: 'centurion', label: 'Centurion', hint: '100 votes', test: s => s.votes >= 100 },
  { id: 'mokonzi', label: 'Mokonzi ya Nzela', hint: 'Niveau 20', test: s => s.level >= 20 },
];

/** Les 24 communes de Kinshasa. */
export const COMMUNES = [
  'Bandalungwa', 'Barumbu', 'Bumbu', 'Gombe', 'Kalamu', 'Kasa-Vubu', 'Kimbanseke', 'Kinshasa',
  'Kintambo', 'Kisenso', 'Lemba', 'Limete', 'Lingwala', 'Makala', 'Maluku', 'Masina', 'Matete',
  'Mont-Ngafula', "N'djili", "N'sele", 'Ngaba', 'Ngaliema', 'Ngiri-Ngiri', 'Selembao',
];

/** Jour et semaine ISO à l'heure de Kinshasa (UTC+1). */
export function kinshasaDayKey(date = new Date()) {
  return new Date(date.getTime() + 3600 * 1000).toISOString().slice(0, 10);
}

export function kinshasaWeekId(date = new Date()) {
  const d = new Date(date.getTime() + 3600 * 1000);
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // jeudi de la semaine ISO
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Fin de la semaine de jeu (lundi 00:00 Kinshasa), pour le compte à rebours. */
export function weekEndsAt(date = new Date()) {
  const d = new Date(date.getTime() + 3600 * 1000);
  const day = (d.getUTCDay() + 6) % 7;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 7);
  return new Date(monday - 3600 * 1000);
}
