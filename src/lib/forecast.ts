/**
 * Modèle de prévision du trafic (partagé serveur / tests), sans dépendance Firebase.
 *
 * Données : des mesures { t (ms), delay (min) } d'un même tronçon, une au plus par créneau de 15 min.
 *
 * Prévision à l'horizon h :
 *   1. Profil habituel à l'heure visée : médiane pondérée des retards mesurés autour de la même heure
 *      (± 90 min, poids gaussien), en privilégiant le même type de jour (semaine / samedi / dimanche)
 *      et les semaines récentes (demi-vie 4 semaines). La médiane ignore les jours d'accident isolés.
 *   2. Écart du moment : si une mesure en direct existe, on compare au profil habituel de maintenant.
 *      Cet écart (bouchon anormal, route anormalement vide) persiste puis s'efface :
 *      prévision = profil(visé) + écart × e^(−h/50 min).
 *   3. Sans profil fiable (moins de ~2 jours de mesures autour de l'heure visée), pas de prévision.
 *
 * `backtest` rejoue l'historique pour mesurer le taux de bonnes prévisions sans tricher :
 * chaque prévision n'utilise que les mesures connues au moment où elle aurait été faite.
 */

export type Sample = { t: number; delay: number };
export type Level = 0 | 1 | 2 | 3; // fluide, modéré, dense, bloqué

const KIN_OFFSET_MS = 3600 * 1000; // UTC+1, pas d'heure d'été
export const SLOT_MIN = 15;

/** Réglages du modèle (choisis par rejeu de l'historique ; voir `backtest`). */
export const FORECAST_CFG = {
  todSigmaMin: 35,
  todWindowMin: 90,
  halfLifeDays: 28,
  anomalyTauMin: 50,
  /** poids minimum du profil (≈ 2 jours de mesures autour de l'heure visée) */
  minWeight: 1.5,
  /** 'median' résiste aux jours d'accident ; 'mean' suit mieux les pointes */
  stat: 'median' as 'median' | 'mean',
};

/** Niveaux des 8 carrefours (mêmes seuils que la carte). */
export function levelOfDelay(delay: number): Level {
  return delay >= 20 ? 3 : delay >= 8 ? 2 : delay >= 3 ? 1 : 0;
}

/** Minute du jour à Kinshasa (0–1439). */
export function kinMinuteOfDay(t: number) {
  const d = new Date(t + KIN_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** 0 = semaine, 1 = samedi, 2 = dimanche (jour de Kinshasa). */
export function kinDayType(t: number) {
  const dow = new Date(t + KIN_OFFSET_MS).getUTCDay();
  return dow === 0 ? 2 : dow === 6 ? 1 : 0;
}

/** Jour de Kinshasa « AAAA-MM-JJ » et index du créneau de 15 min (0–95). */
export function kinDaySlot(t: number) {
  const d = new Date(t + KIN_OFFSET_MS);
  const day = d.toISOString().slice(0, 10);
  const slot = Math.floor((d.getUTCHours() * 60 + d.getUTCMinutes()) / SLOT_MIN);
  return { day, slot };
}

/** Instant (ms UTC) du début d'un créneau d'un jour de Kinshasa. */
export function slotToTime(day: string, slot: number) {
  return Date.parse(`${day}T00:00:00Z`) - KIN_OFFSET_MS + slot * SLOT_MIN * 60 * 1000;
}

function weightedMedian(pairs: Array<{ v: number; w: number }>) {
  const s = [...pairs].sort((a, b) => a.v - b.v);
  const total = s.reduce((a, p) => a + p.w, 0);
  let acc = 0;
  for (const p of s) {
    acc += p.w;
    if (acc >= total / 2) return p.v;
  }
  return s[s.length - 1].v;
}

/** Profil habituel autour de l'instant `at`, d'après les mesures antérieures à `knownBefore`. */
export function profileAt(samples: Sample[], at: number, knownBefore: number) {
  const tod = kinMinuteOfDay(at);
  const type = kinDayType(at);
  const pairs: Array<{ v: number; w: number }> = [];
  let weight = 0;
  for (const s of samples) {
    if (s.t >= knownBefore) continue;
    let d = Math.abs(kinMinuteOfDay(s.t) - tod);
    d = Math.min(d, 1440 - d);
    if (d > FORECAST_CFG.todWindowMin) continue;
    const wTod = Math.exp(-0.5 * (d / FORECAST_CFG.todSigmaMin) ** 2);
    const st = kinDayType(s.t);
    const wDay = st === type ? 1 : st !== 0 && type !== 0 ? 0.6 : 0.3;
    const ageDays = Math.max(0, (knownBefore - s.t) / 86400000);
    const wRec = Math.pow(0.5, ageDays / FORECAST_CFG.halfLifeDays);
    const w = wTod * wDay * wRec;
    if (w < 0.02) continue;
    pairs.push({ v: s.delay, w });
    weight += w;
  }
  if (!pairs.length) return null;
  const delay = FORECAST_CFG.stat === 'median' ? weightedMedian(pairs) : pairs.reduce((a, p) => a + p.v * p.w, 0) / weight;
  return { delay, weight };
}

export type Prediction = { delay: number; confidence: number; basis: 'profil' | 'profil+direct' };

/**
 * Retard prévu (min) à `now + horizonMin`. `live` = retard mesuré maintenant (ou null).
 * null quand on ne sait pas : mieux vaut « pas de données » qu'une couleur inventée.
 */
export function predict(samples: Sample[], now: number, horizonMin: number, live: number | null): Prediction | null {
  const target = now + horizonMin * 60000;
  const pTarget = profileAt(samples, target, now);
  const decay = Math.exp(-horizonMin / FORECAST_CFG.anomalyTauMin);

  if (pTarget && pTarget.weight >= FORECAST_CFG.minWeight) {
    const pNow = live != null ? profileAt(samples, now, now) : null;
    const confidence = Math.round(Math.min(92, 35 + 9 * pTarget.weight));
    if (live != null && pNow && pNow.weight >= FORECAST_CFG.minWeight) {
      const delay = Math.max(0, Math.round(pTarget.delay + (live - pNow.delay) * decay));
      return { delay, confidence, basis: 'profil+direct' };
    }
    if (live != null) {
      // Profil de maintenant inconnu : on mélange la mesure du moment et le profil visé.
      const delay = Math.max(0, Math.round(decay * live + (1 - decay) * pTarget.delay));
      return { delay, confidence: Math.max(30, confidence - 10), basis: 'profil+direct' };
    }
    return { delay: Math.round(pTarget.delay), confidence: Math.max(30, confidence - 10), basis: 'profil' };
  }

  // Sans profil, prolonger la mesure du moment trompe juste avant les pointes (7 h « fluide » → 8 h bloqué) :
  // on préfère ne rien prévoir.
  return null;
}

/** Ancien modèle (moyenne à la même heure, même jour sinon toute la semaine), pour comparer. */
function oldModel(samples: Sample[], now: number, horizonMin: number): number | null {
  const target = now + horizonMin * 60000;
  const hour = Math.floor(kinMinuteOfDay(target) / 60);
  const dow = new Date(target + KIN_OFFSET_MS).getUTCDay();
  const known = samples.filter(s => s.t < now);
  let m = known.filter(s => Math.floor(kinMinuteOfDay(s.t) / 60) === hour && new Date(s.t + KIN_OFFSET_MS).getUTCDay() === dow);
  if (m.length < 3) m = known.filter(s => Math.floor(kinMinuteOfDay(s.t) / 60) === hour);
  if (m.length < 3) return null;
  return m.reduce((a, s) => a + s.delay, 0) / m.length;
}

export type BacktestScore = {
  horizonMin: number;
  /** prévisions vérifiées (une mesure réelle existait à l'heure visée) */
  checked: number;
  /** bon niveau (fluide / modéré / dense / bloqué) */
  hits: number;
  /** au plus un niveau d'écart */
  near: number;
  /** erreur moyenne en minutes */
  mae: number;
  /** cas où le modèle n'a rien prévu faute de données */
  abstained: number;
  oldModel: { checked: number; hits: number };
  persistence: { checked: number; hits: number };
};

/**
 * Rejoue l'historique d'un tronçon : pour chaque mesure réelle, la prévision qu'on aurait faite
 * `horizonMin` plus tôt (avec la mesure de ce moment-là comme « direct »).
 */
export function backtest(samples: Sample[], horizonMin: number, opts: { since?: number; stepMin?: number } = {}): BacktestScore {
  const s = [...samples].sort((a, b) => a.t - b.t);
  const out: BacktestScore = {
    horizonMin, checked: 0, hits: 0, near: 0, mae: 0, abstained: 0,
    oldModel: { checked: 0, hits: 0 }, persistence: { checked: 0, hits: 0 },
  };
  const slotMs = SLOT_MIN * 60000;
  const bySlot = new Map(s.map(x => [Math.round(x.t / slotMs), x] as const));
  const step = (opts.stepMin ?? SLOT_MIN) * 60000;
  let absErr = 0;
  for (const target of s) {
    if (opts.since && target.t < opts.since) continue;
    if (step > slotMs && Math.round(target.t / slotMs) % Math.round(step / slotMs) !== 0) continue;
    const anchorT = target.t - horizonMin * 60000;
    const anchor = bySlot.get(Math.round(anchorT / slotMs));
    const now = anchor ? anchor.t : anchorT;
    const h = (target.t - now) / 60000;
    const truth = levelOfDelay(target.delay);
    const p = predict(s, now, h, anchor ? anchor.delay : null);
    if (!p) { out.abstained++; } else {
      out.checked++;
      const lv = levelOfDelay(p.delay);
      if (lv === truth) out.hits++;
      if (Math.abs(lv - truth) <= 1) out.near++;
      absErr += Math.abs(p.delay - target.delay);
    }
    const o = oldModel(s, now, h);
    if (o != null) { out.oldModel.checked++; if (levelOfDelay(o) === truth) out.oldModel.hits++; }
    if (anchor) { out.persistence.checked++; if (levelOfDelay(anchor.delay) === truth) out.persistence.hits++; }
  }
  out.mae = out.checked ? Math.round((absErr / out.checked) * 10) / 10 : 0;
  return out;
}

/** Additionne les scores de plusieurs tronçons. */
export function mergeScores(scores: BacktestScore[], horizonMin: number): BacktestScore {
  const out: BacktestScore = {
    horizonMin, checked: 0, hits: 0, near: 0, mae: 0, abstained: 0,
    oldModel: { checked: 0, hits: 0 }, persistence: { checked: 0, hits: 0 },
  };
  let err = 0;
  for (const s of scores) {
    out.checked += s.checked; out.hits += s.hits; out.near += s.near; out.abstained += s.abstained;
    err += s.mae * s.checked;
    out.oldModel.checked += s.oldModel.checked; out.oldModel.hits += s.oldModel.hits;
    out.persistence.checked += s.persistence.checked; out.persistence.hits += s.persistence.hits;
  }
  out.mae = out.checked ? Math.round((err / out.checked) * 10) / 10 : 0;
  return out;
}
