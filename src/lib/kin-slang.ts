/**
 * Voix de Kinshasa Flow : narration, argot kinois et lingala.
 *
 * Le narrateur s'appelle « K-Flow » — un chauffeur de Kin qui connaît chaque libulu et chaque bouchon.
 * Il parle comme la rue : français de Kin + lingala. Chaque ligne garde une traduction courte
 * pour que tout le monde suive, même ceux qui débarquent à Kin.
 */

export type Mood = 'fluide' | 'dense' | 'bloque' | 'pluie' | 'nuit' | 'neutre';

/** Petit lexique affiché sur l'accueil et en info-bulle. */
export const LEXIQUE: Array<{ mot: string; sens: string }> = [
  { mot: 'Tokende !', sens: 'On y va !' },
  { mot: 'Mbote', sens: 'Salut' },
  { mot: 'Ndeko', sens: 'Frère, sœur, ami·e' },
  { mot: 'Wewa', sens: 'Moto-taxi (et son chauffeur)' },
  { mot: 'Nzela ekangami', sens: 'La route est bloquée' },
  { mot: 'Nzela ezali polele', sens: 'La route est libre' },
  { mot: 'Keba !', sens: 'Attention !' },
  { mot: 'Malembe', sens: 'Doucement' },
  { mot: 'Mbangu', sens: 'Vite' },
  { mot: 'Libulu', sens: 'Trou, nid-de-poule' },
  { mot: 'Mbula', sens: 'La pluie' },
  { mot: 'Roulage', sens: 'La police de circulation' },
  { mot: 'Esprit de mort', sens: 'Le vieux minibus 207' },
  { mot: 'Ketch', sens: 'Petite voiture taxi' },
  { mot: 'Mbongo', sens: "L'argent" },
  { mot: 'Tshombo', sens: 'Le téléphone' },
  { mot: 'Mokonzi ya nzela', sens: 'Le chef de la route' },
];

/** Les « runs » : les axes que tout Kinois connaît, chacun avec sa réputation. */
export const RUNS: Array<{ id: string; nom: string; commune: string; reputation: string; danger: 1 | 2 | 3 }> = [
  { id: 'lumumba', nom: 'Bd Lumumba', commune: 'Limete → Ndjili', reputation: 'La grande ligne droite. Esprits de mort partout.', danger: 3 },
  { id: 'echangeur', nom: 'Échangeur', commune: 'Limete', reputation: 'Tout Kin passe sous la tour. Keba aux fula-fula.', danger: 3 },
  { id: 'victoire', nom: 'Rond-point Victoire', commune: 'Kalamu', reputation: 'Ambiance, musique… et bouchon jusqu’à minuit.', danger: 2 },
  { id: 'matonge', nom: 'Matonge', commune: 'Kalamu', reputation: 'Les ngandas débordent sur la route le week-end.', danger: 2 },
  { id: 'kintambo', nom: 'Magasin Kintambo', commune: 'Kintambo', reputation: 'Bus, piétons, marché : malembe malembe.', danger: 2 },
  { id: '30juin', nom: 'Bd du 30 Juin', commune: 'Gombe', reputation: 'Large et rapide… sauf quand le cortège passe.', danger: 1 },
  { id: 'upn', nom: 'Rond-point UPN', commune: 'Ngaliema', reputation: 'Les étudiants, les taxis-bus et la pente.', danger: 2 },
  { id: 'aeroport', nom: 'Route de l’Aéroport', commune: "N'djili", reputation: 'Le run des pressés. Libulu en embuscade.', danger: 2 },
];

/** Le récit : l'histoire de K-Flow, racontée sur l'accueil. */
export const EPISODES: Array<{ num: string; titre: string; texte: string }> = [
  {
    num: '01',
    titre: 'Kin bouge, mais Kin bloque',
    texte: '6 h 30 à Limete. K-Flow démarre sa voiture. Devant lui : 3 esprits de mort, un fula-fula en panne et un roulage qui siffle. « Nzela ekangami… encore ! »',
  },
  {
    num: '02',
    titre: 'Les yeux de la ville',
    texte: 'K-Flow comprend : chaque Kinois voit un bout de route. Si on met nos yeux ensemble, on voit tout Kin. Un vote, un signalement — et la ville entière sait.',
  },
  {
    num: '03',
    titre: 'Tokende, ndeko !',
    texte: 'Toi aussi, rejoins l’équipe. Dis ce que tu vois, gagne tes XP et tes FC, fais gagner ta commune. Le chef de la route, ce sera peut-être toi.',
  },
];

/** Accroches par rang (les rangs viennent de lib/game). */
export const RANK_TAGLINES: Record<string, string> = {
  'Piéton': 'Tu marches encore, ndeko. Vote un carrefour et monte sur la moto.',
  'Wewa': 'Te voilà wewa ! Tu connais déjà les raccourcis.',
  'Taximan': 'Taximan confirmé : les clients te font confiance.',
  'Chauffeur Esprit de Mort': 'Rien ne te fait peur. Même pas Victoire à 18 h.',
  'Pilote de Kin': 'Pilote de Kin ! Les roulages te saluent.',
  'Mokonzi ya Nzela': 'Mokonzi ya nzela — la route t’appartient.',
};

/** Ce que K-Flow dit selon l'état de la route. */
export const MOOD_LINES: Record<Mood, string[]> = {
  fluide: [
    'Nzela ezali polele ! Tokende mbangu.',
    'Ça roule comme un dimanche matin, ndeko.',
    'Route libre. Profite, ça ne va pas durer !',
  ],
  dense: [
    'Ça commence à serrer… malembe malembe.',
    'Les esprits de mort se réveillent. Garde tes distances.',
    'Dense mais ça avance. Pas besoin de klaxonner, ndeko.',
  ],
  bloque: [
    'Nzela ekangami ! Prends une voie bis, crois-moi.',
    'Bouchon total. Même les wewa ne passent plus.',
    'Ça ne bouge plus. Signale-le pour sauver les autres !',
  ],
  pluie: [
    'Mbula ezali kobeta ! Les libulu se cachent sous l’eau, keba.',
    'Il pleut sur Kin : tout le monde rentre en même temps.',
  ],
  nuit: [
    'Kin la nuit : moins de bouchons, plus de prudence.',
    'Rentre bien, ndeko. Phares allumés.',
  ],
  neutre: [
    'Mbote ndeko ! Dis-moi ce que tu vois sur ta route.',
    'Chaque vote aide un Kinois à arriver à l’heure.',
    'Ta commune compte sur toi cette semaine !',
  ],
};

/** Lignes d'attente (chargements). */
export const LOADING_LINES = [
  'K-Flow démarre la voiture…',
  'On demande aux roulages…',
  'On évite les libulu…',
  'On compte les esprits de mort…',
  'Malembe, ça arrive…',
];

/** Réactions après une action du joueur. */
export const CHEERS = [
  'Merci mingi, ndeko !',
  'Ezali malamu ! Toute la ville te remercie.',
  'Mokonzi ! Continue comme ça.',
  'Boom ! XP dans la poche.',
];

/** Piques amicales des rivaux, pour la bataille des communes. */
export function rivalTaunt(leader?: string, mine?: string) {
  if (!leader) return 'Aucune commune n’a encore bougé. Lance la première, ndeko !';
  if (mine && leader === mine) return `${mine} mène la danse ! Les autres communes vous regardent… ne lâchez rien.`;
  if (mine) return `${leader} se moque de ${mine} : « Bozali wapi ? » Réponds-leur avec tes votes !`;
  return `${leader} fait le malin en tête. Choisis ta commune et viens les déranger.`;
}

/** Choix déterministe sur la journée (stable entre les rendus, change chaque heure). */
export function pickLine(lines: string[], seed = Math.floor(Date.now() / 3_600_000)) {
  return lines[Math.abs(seed) % lines.length];
}

/** Humeur à partir d'un statut de trafic texte. */
export function moodFromStatus(status?: string | null): Mood {
  const s = (status || '').toLowerCase();
  if (/bloqu|satur|ferm|embouteill/.test(s)) return 'bloque';
  if (/dense|ralenti|modér|moder/.test(s)) return 'dense';
  if (/fluide|libre|dégag|degag/.test(s)) return 'fluide';
  return 'neutre';
}

/** Humeur liée à l'heure de Kinshasa, si on n'a rien de mieux. */
export function moodFromClock(date = new Date()): Mood {
  const h = (date.getUTCHours() + 1) % 24;
  if (h >= 21 || h < 5) return 'nuit';
  if ((h >= 6 && h < 9) || (h >= 16 && h < 20)) return 'dense';
  return 'neutre';
}

// ───────────────────────────── Récit d'un trajet recherché ─────────────────────────────

export type RouteLevel = 'ok' | 'mod' | 'dense' | 'block' | 'none';

export function routeLevel(status?: string | null): RouteLevel {
  const s = (status || '').toUpperCase();
  if (s.startsWith('BLOQU')) return 'block';
  if (s.startsWith('EMBOUTEILL') || s === 'DENSE') return 'dense';
  if (s.startsWith('MOD')) return 'mod';
  if (s.startsWith('FLUIDE')) return 'ok';
  return 'none';
}

export interface RouteFacts {
  name: string;
  status?: string | null;
  delay?: number | null;
  speedKmh?: number | null;
  durationMin?: number | null;
  isLive?: boolean;
  cause?: string | null;
  reportAgeMin?: number | null;
  typicalCause?: string | null;
  typicalAlternative?: string | null;
  alternatives?: Array<{ description?: string; duration?: string; delay?: number | null }>;
  raining?: boolean;
}

/** Choix stable selon le nom de la route : la même recherche raconte la même histoire. */
function pick<T>(arr: T[], key: string, salt = 0): T {
  let h = salt;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

const OPENERS: Record<RouteLevel, string[]> = {
  ok: [
    'Mbote ndeko ! {r} ezali polele : la route est à toi.',
    'Bonne nouvelle : sur {r}, ça roule comme un dimanche matin.',
    'Ndeko, {r} est libre. Même les esprits de mort roulent sagement.',
  ],
  mod: [
    'Ça commence à serrer sur {r}… rien de grave, ndeko.',
    'Sur {r}, ça avance malembe malembe.',
    '{r} : ni bouchon, ni autoroute. Kin normale, quoi.',
  ],
  dense: [
    'Aïe ndeko… sur {r}, nzela ekangami moke !',
    '{r} a chauffé : les 207 font la loi et les wewa se faufilent.',
    'Ça klaxonne sur {r}. Pin pin ! Patience, mon frère.',
  ],
  block: [
    'Nzela ekangami makasi ! {r} ne bouge presque plus.',
    'Keba ! {r} est bloquée, même les wewa calent.',
    'Bouchon total sur {r}. Là, ce n’est plus la route, c’est un parking.',
  ],
  none: [
    'Je n’ai pas encore de mesure pour {r}.',
    '{r}, je ne la vois pas encore en direct.',
  ],
};

const CLOSERS: Record<RouteLevel, string[]> = {
  ok: ['Tokende mbangu ! Mais malembe aux libulu.', 'Profite, ndeko, avant que les esprits de mort se réveillent.', 'Roule cool, mets un peu de rumba.'],
  mod: ['Malembe, on arrive quand même.', 'Garde tes distances, pas besoin de klaxonner.', 'Pars maintenant, ça ne va pas s’améliorer.'],
  dense: ['Sinon, mets de la rumba et respire.', 'Si tu peux attendre, prends d’abord un café.', 'Ne force pas, ndeko : la voie bis est ton amie.'],
  block: ['Ne force pas : contourne, ou attends que ça se libère.', 'Signale ce que tu vois : tu sauves la matinée de toute la ville.', 'Mokili eza pasi… mais toi, tu as K-Flow.'],
  none: ['Dis-moi ce que tu vois sur place : je préviens toute la ville !', 'Un vote de ta part et tout Kin saura.'],
};

/** Récit en 3 ou 4 phrases, construit seulement à partir des données reçues. */
export function routeStory(f: RouteFacts): { level: RouteLevel; mood: Mood; lines: string[] } {
  const level = routeLevel(f.status);
  const r = f.name || 'cette route';
  const lines: string[] = [pick(OPENERS[level], r).replace('{r}', r)];

  if (level !== 'none') {
    const est = f.isLive ? 'Mesuré en direct' : 'Estimation selon l’heure';
    const bits: string[] = [];
    if (typeof f.speedKmh === 'number') bits.push(`${f.speedKmh} km/h`);
    if (typeof f.delay === 'number') bits.push(f.delay > 0 ? `+${f.delay} min de retard` : 'pas de retard');
    if (typeof f.durationMin === 'number') bits.push(`${f.durationMin} min pour ce tronçon`);
    if (bits.length) lines.push(`${est} : ${bits.join(', ')}.`);
  }

  if (f.cause) {
    lines.push(`Un Kinois a signalé${typeof f.reportAgeMin === 'number' ? ` il y a ${f.reportAgeMin} min` : ''} : « ${f.cause} ».`);
  } else if ((level === 'dense' || level === 'block') && f.typicalCause) {
    lines.push(`D’habitude ici, c’est : ${f.typicalCause.replace(/\.$/, '')}.`);
  }

  if (f.raining) lines.push('Et mbula ezali kobeta : les libulu se cachent sous l’eau, keba !');

  if (level === 'dense' || level === 'block' || level === 'mod') {
    const alt = f.alternatives?.find(a => a.description);
    if (alt) {
      lines.push(`Ma voie bis : ${alt.description}${alt.duration ? `, ${alt.duration}` : ''}${typeof alt.delay === 'number' ? ` (+${alt.delay} min mesuré)` : ''}.`);
    } else if (f.typicalAlternative && level !== 'mod') {
      lines.push(`Ma voie bis habituelle : ${f.typicalAlternative.replace(/\.$/, '')}.`);
    }
  }

  lines.push(pick(CLOSERS[level], r, 7));
  const mood: Mood = f.raining ? 'pluie' : level === 'block' || level === 'dense' ? 'bloque' : level === 'mod' ? 'dense' : level === 'ok' ? 'fluide' : 'neutre';
  return { level, mood, lines };
}

/** Phrases d'attente pendant la reconnaissance d'une route. */
export const SCOUT_LINES = [
  'K-Flow part en reconnaissance…',
  'On interroge les capteurs de la ville…',
  'On compte les esprits de mort…',
  'On demande aux roulages…',
  'On vérifie les voies bis…',
];
