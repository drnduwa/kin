/**
 * Catalogue de prix faisant foi. Le serveur recalcule toujours le montant et les Stars à partir
 * de l'identifiant de l'article : un client ne peut plus choisir « 100 000 Stars pour 100 FC ».
 * Garder en phase avec les cartes affichées dans src/app/mes-stars/page.tsx.
 */
export const STAR_PACK_CATALOG: Record<string, { stars: number; prices: { CDF: number; USD: number } }> = {
  pack_50: { stars: 50, prices: { CDF: 5000, USD: 2 } },
  pack_150: { stars: 150, prices: { CDF: 13000, USD: 5 } },
  pack_400: { stars: 400, prices: { CDF: 26000, USD: 10 } },
  pack_1000: { stars: 1000, prices: { CDF: 50000, USD: 20 } },
};

export const PASS_CATALOG: Record<string, { passType: 'weekly' | 'monthly'; days: number; prices: { CDF: number; USD: number } }> = {
  pass_weekly: { passType: 'weekly', days: 7, prices: { CDF: 10000, USD: 4 } },
  pass_monthly: { passType: 'monthly', days: 30, prices: { CDF: 30000, USD: 12 } },
};

/** Forfaits data payables avec le solde E-Wallet (prix en FC). */
export const DATA_PACK_CATALOG: Record<string, number> = {
  'Pass Jour 500 Mo': 1500,
  'Pass Semaine 2 Go': 4500,
  'Pass Mois 5 Go': 11000,
};

/** Gains citoyens (FC) et garde-fous anti-abus. */
export const REWARD_CDF = { upvote: 25, incident_report: 200 } as const;
export const DAILY_REWARD_CAP_CDF = 1000;
export const MIN_CASHOUT_CDF = 1000;
export const CDF_PER_USD = 2800;
