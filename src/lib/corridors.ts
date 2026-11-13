/**
 * Les 20 axes chargés de Kinshasa et les points noirs connus (liste pratique, pas un classement).
 * Partagé client / serveur.
 *
 * - `roadId` : l'axe est un grand axe déjà tracé et mesuré par un carrefour (ROADS de live-city-map).
 * - `pts`    : tracé de l'axe (lat, lng), simplifié depuis OpenStreetMap (© contributeurs OSM, ODbL),
 *              sauf `approx: true` (axe absent ou sans nom dans OSM : tracé approximatif).
 * - `seg`    : tronçon mesuré en direct (origine, passage facultatif, destination), ~3 km max. Chaque
 *              tronçon a été vérifié : la distance routée par Google reste proche de sa longueur
 *              (sens et point de passage choisis pour éviter les demi-tours des voies séparées).
 * - `nodeId` : axe mesuré directement par un carrefour du tableau de bord.
 * - `sameAs` : autre nom du même axe (route renommée) → dessiné et mesuré une seule fois.
 */
export type LatLng = [number, number];

export interface Corridor {
  rank: number;
  id: string;
  name: string;
  aliases?: string[];
  roadId?: string;
  pts?: LatLng[];
  seg?: { o: LatLng; v?: LatLng; d: LatLng };
  nodeId?: string;
  sameAs?: string;
  approx?: boolean;
  note?: string;
}

export const CORRIDORS: Corridor[] = [
  { rank: 1, id: '30juin', name: 'Boulevard du 30 Juin', roadId: '30juin' },
  { rank: 2, id: 'lumumba', name: 'Boulevard Lumumba', roadId: 'lumumba' },
  {
    rank: 3, id: 'congo-japon', name: 'Boulevard Congo-Japon', aliases: ['ex-Avenue des Poids Lourds'], roadId: 'poids', approx: true,
    seg: { o: [-4.3803, 15.3525], d: [-4.3847, 15.3576] },
    note: 'Mesuré sur le tronçon nommé « Poids Lourd » dans OpenStreetMap (Matete). Le tronçon de Kingabwa n’y a pas de nom : son tracé reste approximatif.',
  },
  { rank: 4, id: 'matadi', name: 'Route de Matadi', roadId: 'matadi' },
  {
    rank: 5, id: 'aeroport', name: "Route de l'aéroport N'djili", aliases: ['Bd Lumumba, Masina → aéroport'],
    pts: [[-4.4056, 15.4151], [-4.4054, 15.4235], [-4.4037, 15.4277], [-4.4007, 15.4325], [-4.3983, 15.4361], [-4.3955, 15.4405], [-4.3927, 15.4449], [-4.3883, 15.4517]],
    seg: { o: [-4.3922, 15.4456], d: [-4.4054, 15.4223] },
  },
  {
    rank: 6, id: 'sendwe', name: 'Boulevard Sendwe',
    pts: [[-4.3317, 15.3142], [-4.333, 15.3175], [-4.3341, 15.3202], [-4.3349, 15.322], [-4.336, 15.3247], [-4.3369, 15.3269]],
    seg: { o: [-4.3369, 15.3269], d: [-4.3317, 15.3142] },
  },
  {
    rank: 7, id: 'triomphal', name: 'Boulevard Triomphal',
    pts: [[-4.3371, 15.2959], [-4.3359, 15.2999], [-4.335, 15.303], [-4.334, 15.3063], [-4.3334, 15.3086], [-4.3323, 15.312], [-4.3319, 15.3146]],
    seg: { o: [-4.3371, 15.2959], d: [-4.3319, 15.3146] },
  },
  { rank: 8, id: 'kasavubu', name: 'Avenue Kasa-Vubu', roadId: 'kasavubu' },
  {
    rank: 9, id: 'huileries', name: 'Avenue des Huileries',
    pts: [[-4.3059, 15.3014], [-4.3115, 15.3024], [-4.3163, 15.3037], [-4.3208, 15.3054], [-4.3254, 15.3067], [-4.3298, 15.3077], [-4.334, 15.3063]],
    seg: { o: [-4.307, 15.3016], v: [-4.32, 15.3051], d: [-4.3329, 15.3067] },
  },
  {
    rank: 10, id: 'mulele', name: 'Avenue du 24 Novembre', aliases: ['Avenue Pierre Mulele'],
    pts: [[-4.3925, 15.3433], [-4.3962, 15.3446], [-4.3992, 15.3449], [-4.4024, 15.3451], [-4.4052, 15.345], [-4.4083, 15.3448], [-4.4105, 15.3448]],
    seg: { o: [-4.3925, 15.3433], d: [-4.4105, 15.3448] },
    note: 'Tracé de l’« Avenue Mulele » d’OpenStreetMap ; le nom officiel actuel est à confirmer.',
  },
  { rank: 11, id: 'universite', name: "Avenue de l'Université", roadId: 'univ' },
  { rank: 12, id: 'bypass', name: 'Route de contournement (By-pass)', roadId: 'bypass' },
  {
    rank: 13, id: 'nguma', name: 'Avenue Nguma',
    pts: [[-4.3716, 15.2536], [-4.3658, 15.2503], [-4.3604, 15.2526], [-4.3532, 15.2508], [-4.35, 15.2504], [-4.3439, 15.2536], [-4.3382, 15.2565], [-4.3335, 15.2581]],
    seg: { o: [-4.3651, 15.2505], v: [-4.3524, 15.2507], d: [-4.3402, 15.2552] },
  },
  { rank: 14, id: 'poids-lourds', name: 'Avenue des Poids Lourds', sameAs: 'congo-japon', note: 'Devenue en partie le Boulevard Congo-Japon.' },
  {
    rank: 15, id: 'liberation', name: 'Avenue de la Libération', aliases: ['ex-24 Novembre'],
    pts: [[-4.4073, 15.2564], [-4.4033, 15.2703], [-4.3991, 15.2759], [-4.3906, 15.2814], [-4.3839, 15.2833], [-4.3723, 15.284], [-4.3607, 15.2876], [-4.348, 15.2917]],
    seg: { o: [-4.3967, 15.2777], v: [-4.3845, 15.2831], d: [-4.3713, 15.2843] },
  },
  {
    rank: 16, id: 'bokasa', name: 'Avenue Bokasa', approx: true,
    pts: [[-4.314, 15.312], [-4.322, 15.316], [-4.330, 15.319]],
    seg: { o: [-4.314, 15.312], v: [-4.322, 15.316], d: [-4.330, 15.319] },
    note: 'Absente d’OpenStreetMap : tracé et point de mesure approximatifs, à vérifier sur place.',
  },
  {
    rank: 17, id: 'funa', name: 'Avenue de la Funa', approx: true,
    pts: [[-4.3295, 15.3141], [-4.3304, 15.3165], [-4.3314, 15.3191], [-4.3312, 15.3208], [-4.3304, 15.3227], [-4.3302, 15.325]],
    seg: { o: [-4.3295, 15.3141], v: [-4.3314, 15.3195], d: [-4.3302, 15.325] },
    note: 'Seul tronçon nommé « Funa » dans OpenStreetMap ; il est très court : à vérifier sur place.',
  },
  {
    rank: 18, id: 'victoire', name: 'Avenue de la Victoire',
    pts: [[-4.3408, 15.3138], [-4.3415, 15.316], [-4.3421, 15.3177], [-4.3427, 15.3196], [-4.3433, 15.3215], [-4.3441, 15.3239]],
    nodeId: 'kalamu-victoire',
    note: 'Avenue courte : mesurée au carrefour Rond-point Victoire.',
  },
  {
    rank: 19, id: 'assossa', name: 'Avenue Assossa',
    pts: [[-4.3818, 15.2913], [-4.3728, 15.2941], [-4.3653, 15.2965], [-4.3585, 15.2987], [-4.3511, 15.3008], [-4.3435, 15.3035], [-4.3386, 15.3049]],
    seg: { o: [-4.373, 15.294], v: [-4.3602, 15.2982], d: [-4.3473, 15.302] },
  },
  {
    rank: 20, id: 'tourisme', name: 'Avenue du Tourisme', aliases: ['Nzela ya Mayi'],
    pts: [[-4.3442, 15.2192], [-4.3368, 15.2207], [-4.3338, 15.2261], [-4.3315, 15.2319], [-4.3269, 15.2368], [-4.3258, 15.2427], [-4.3249, 15.2453], [-4.3287, 15.2524]],
    seg: { o: [-4.3362, 15.2214], v: [-4.3305, 15.2332], d: [-4.325, 15.2449] },
  },
];

/** Points noirs connus. `nodeId` = carrefour déjà mesuré ; sinon on mesure le tronçon `seg`. */
export const BLACK_SPOTS: Array<{ id: string; name: string; c: LatLng; nodeId?: string; seg?: { o: LatLng; v?: LatLng; d: LatLng } }> = [
  { id: 'kintambo-magasin', name: 'Kintambo-Magasin', c: [-4.3270, 15.2740], nodeId: 'kintambo-magasin' },
  { id: 'rp-victoire', name: 'Rond-point Victoire', c: [-4.3430, 15.3120], nodeId: 'kalamu-victoire' },
  { id: 'rp-ngaba', name: 'Rond-point Ngaba', c: [-4.3899, 15.3148], seg: { o: [-4.380, 15.316], v: [-4.3899, 15.3148], d: [-4.400, 15.314] } },
];

/** Axes mesurés par leur propre tronçon (les autres le sont par leur carrefour). */
export const MEASURED_SEGMENTS = CORRIDORS.filter(c => c.seg && !c.sameAs && !c.nodeId);

/** Milieu d'un tronçon (point de passage s'il existe). */
export const segMid = (s: { o: LatLng; v?: LatLng; d: LatLng }): LatLng => s.v ?? [(s.o[0] + s.d[0]) / 2, (s.o[1] + s.d[1]) / 2];
