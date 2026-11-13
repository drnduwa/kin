/**
 * Les 20 axes chargés de Kinshasa et les points noirs connus (liste pratique, pas un classement).
 *
 * - `roadId` : l'axe est déjà tracé et mesuré sur la carte (ROADS de live-city-map) → son état est réel.
 * - `pts`    : tracé illustratif approximatif (lat, lng) d'un axe pas encore mesuré en direct.
 * - `sameAs` : autre nom du même axe (routes renommées) → on dessine une seule fois.
 *
 * Les tracés propres à ce fichier sont approximatifs : ils servent à situer l'axe, pas à naviguer.
 */
export type LatLng = [number, number];

export interface Corridor {
  rank: number;
  id: string;
  name: string;
  aliases?: string[];
  roadId?: string;
  pts?: LatLng[];
  sameAs?: string;
  note?: string;
}

export const CORRIDORS: Corridor[] = [
  { rank: 1, id: '30juin', name: 'Boulevard du 30 Juin', roadId: '30juin' },
  { rank: 2, id: 'lumumba', name: 'Boulevard Lumumba', roadId: 'lumumba' },
  { rank: 3, id: 'congo-japon', name: 'Boulevard Congo-Japon', aliases: ['ex-Avenue des Poids Lourds'], roadId: 'poids' },
  { rank: 4, id: 'matadi', name: 'Route de Matadi', roadId: 'matadi' },
  { rank: 5, id: 'aeroport', name: "Route de l'aéroport N'djili", pts: [[-4.385, 15.420], [-4.387, 15.434], [-4.388, 15.448], [-4.380, 15.460], [-4.372, 15.475]] },
  { rank: 6, id: 'sendwe', name: 'Boulevard Sendwe', pts: [[-4.330, 15.300], [-4.338, 15.311], [-4.345, 15.322], [-4.352, 15.340]] },
  { rank: 7, id: 'triomphal', name: 'Boulevard Triomphal', pts: [[-4.322, 15.300], [-4.329, 15.306], [-4.335, 15.312], [-4.343, 15.312]] },
  { rank: 8, id: 'kasavubu', name: 'Avenue Kasa-Vubu', roadId: 'kasavubu' },
  { rank: 9, id: 'huileries', name: 'Avenue des Huileries', pts: [[-4.309, 15.288], [-4.314, 15.300], [-4.318, 15.312], [-4.321, 15.326]] },
  {
    rank: 10, id: 'mulele', name: 'Avenue du 24 Novembre', aliases: ['Avenue Pierre Mulele'],
    pts: [[-4.316, 15.287], [-4.330, 15.288], [-4.345, 15.290], [-4.358, 15.295], [-4.372, 15.300], [-4.392, 15.300]],
    note: 'Nom officiel à confirmer : « 24 Novembre », « Libération » et « Pierre Mulele » désignent probablement le même axe ou des tronçons voisins.',
  },
  { rank: 11, id: 'universite', name: "Avenue de l'Université", roadId: 'univ' },
  { rank: 12, id: 'bypass', name: 'Route de contournement (By-pass)', roadId: 'bypass' },
  { rank: 13, id: 'nguma', name: 'Avenue Nguma', pts: [[-4.333, 15.266], [-4.344, 15.262], [-4.356, 15.258], [-4.366, 15.255]] },
  { rank: 14, id: 'poids-lourds', name: 'Avenue des Poids Lourds', sameAs: 'congo-japon', note: 'Devenue en partie le Boulevard Congo-Japon.' },
  { rank: 15, id: 'liberation', name: 'Avenue de la Libération', aliases: ['ex-24 Novembre'], sameAs: 'mulele' },
  { rank: 16, id: 'bokasa', name: 'Avenue Bokasa', pts: [[-4.314, 15.312], [-4.322, 15.316], [-4.330, 15.319]] },
  { rank: 17, id: 'funa', name: 'Avenue de la Funa', pts: [[-4.345, 15.330], [-4.355, 15.337], [-4.366, 15.343]] },
  { rank: 18, id: 'victoire', name: 'Avenue Victoire', pts: [[-4.338, 15.300], [-4.343, 15.312], [-4.348, 15.326]] },
  { rank: 19, id: 'assossa', name: 'Avenue Assossa', pts: [[-4.330, 15.296], [-4.340, 15.298], [-4.352, 15.300]] },
  { rank: 20, id: 'tourisme', name: 'Avenue du Tourisme', aliases: ['Nzela ya Mayi'], roadId: 'berges' },
];

/** Points noirs connus. `nodeId` = carrefour déjà mesuré ; sinon point connu mais pas encore mesuré. */
export const BLACK_SPOTS: Array<{ id: string; name: string; c: LatLng; nodeId?: string }> = [
  { id: 'kintambo-magasin', name: 'Kintambo-Magasin', c: [-4.3270, 15.2740], nodeId: 'kintambo-magasin' },
  { id: 'rp-victoire', name: 'Rond-point Victoire', c: [-4.3430, 15.3120], nodeId: 'kalamu-victoire' },
  { id: 'rp-ngaba', name: 'Rond-point Ngaba', c: [-4.3860, 15.3170] },
];
