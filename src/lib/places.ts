/**
 * Lieux de référence partagés (client / serveur) : les 8 nœuds suivis par la carte et le
 * centre approximatif des 24 communes (pour « Mon trajet » quand on ne partage pas sa position).
 * Les coordonnées des nœuds sont celles de getRealtimeCommandDashboardAction.
 */
export const TRACKED_NODES: Array<{ id: string; name: string; lat: number; lng: number; keywords: string[] }> = [
  { id: 'limete-echangeur', name: 'Échangeur de Limete', lat: -4.357, lng: 15.358, keywords: ['limete', 'echangeur'] },
  { id: 'kintambo-magasin', name: 'Kintambo Magasin', lat: -4.327, lng: 15.274, keywords: ['kintambo', 'magasin', 'mondjiba'] },
  { id: 'matadi-upn', name: 'Route de Matadi (UPN)', lat: -4.38, lng: 15.258, keywords: ['upn', 'matadi', 'binza'] },
  { id: 'lumumba-pascal', name: 'Boulevard Lumumba (Pascal)', lat: -4.385, lng: 15.42, keywords: ['pascal', 'lumumba', 'masina', 'tchangu'] },
  { id: 'bypass-triangle', name: 'Avenue By-Pass (Triangle)', lat: -4.41, lng: 15.315, keywords: ['bypass', 'by-pass', 'triangle', 'lemba'] },
  { id: 'mandela-30juin', name: 'Rond-point Mandela (Bd du 30 Juin)', lat: -4.312, lng: 15.298, keywords: ['mandela', '30 juin', 'gombe', 'batetela'] },
  { id: 'kalamu-victoire', name: 'Avenue Kasa-Vubu (Victoire)', lat: -4.343, lng: 15.312, keywords: ['victoire', 'kasa-vubu', 'kasavubu', 'kalamu'] },
  { id: 'universite-pontgabu', name: "Av. de l'Université (Pont Gabu)", lat: -4.355, lng: 15.318, keywords: ['pont gabu', 'gabu', 'universite', 'université'] },
];

/** Centre approximatif de chaque commune (repère, pas une adresse précise). */
export const COMMUNE_CENTERS: Record<string, { lat: number; lng: number }> = {
  Bandalungwa: { lat: -4.345, lng: 15.285 },
  Barumbu: { lat: -4.315, lng: 15.325 },
  Bumbu: { lat: -4.37, lng: 15.29 },
  Gombe: { lat: -4.305, lng: 15.305 },
  Kalamu: { lat: -4.345, lng: 15.315 },
  'Kasa-Vubu': { lat: -4.34, lng: 15.3 },
  Kimbanseke: { lat: -4.43, lng: 15.38 },
  Kinshasa: { lat: -4.325, lng: 15.315 },
  Kintambo: { lat: -4.33, lng: 15.27 },
  Kisenso: { lat: -4.405, lng: 15.345 },
  Lemba: { lat: -4.395, lng: 15.32 },
  Limete: { lat: -4.355, lng: 15.345 },
  Lingwala: { lat: -4.322, lng: 15.3 },
  Makala: { lat: -4.38, lng: 15.305 },
  Maluku: { lat: -4.07, lng: 15.55 },
  Masina: { lat: -4.38, lng: 15.4 },
  Matete: { lat: -4.375, lng: 15.345 },
  'Mont-Ngafula': { lat: -4.43, lng: 15.27 },
  "N'djili": { lat: -4.39, lng: 15.375 },
  "N'sele": { lat: -4.38, lng: 15.48 },
  Ngaba: { lat: -4.385, lng: 15.33 },
  Ngaliema: { lat: -4.36, lng: 15.255 },
  'Ngiri-Ngiri': { lat: -4.355, lng: 15.295 },
  Selembao: { lat: -4.385, lng: 15.28 },
};

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** Nœud suivi le plus proche, s'il est à moins de `maxKm`. */
export function nearestNode(p: { lat: number; lng: number }, maxKm = 0.6) {
  let best: (typeof TRACKED_NODES)[number] | null = null;
  let bestD = Infinity;
  for (const n of TRACKED_NODES) {
    const d = distanceKm(p, n);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best && bestD <= maxKm ? { node: best, km: bestD } : null;
}

/** Recherche d'un nœud dans un texte libre (bot WhatsApp). */
export function findNodeInText(text: string) {
  const t = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return TRACKED_NODES.find(n => n.keywords.some(k => t.includes(k.normalize('NFD').replace(/[̀-ͯ]/g, '')))) ?? null;
}
