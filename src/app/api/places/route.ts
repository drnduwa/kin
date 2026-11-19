import { NextResponse } from 'next/server';
import places from '@/data/kinshasa-places.json';

/**
 * Recherche de lieux à Kinshasa pour le Mode Conduite : rues, marchés, ronds-points, arrêts, quartiers…
 *   GET /api/places?q=kabambare → { results: [{ name, kind, commune, lat, lng }] } (8 au plus)
 *
 * Index construit depuis OpenStreetMap par scripts/places/build-places-index.mjs (pas de géocodage
 * Google : ses conditions n'autorisent ses résultats que sur une carte Google).
 */
type Entry = [string, string, string, number, number];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['avenue', 'av', 'boulevard', 'bd', 'route', 'rue', 'de', 'du', 'des', 'la', 'le', 'l', 'd']);
// Les repères que l'on cite pour se situer passent avant les rues homonymes et les églises
const KIND_BONUS: Record<string, number> = { 'rond-point': 12, marché: 10, quartier: 10, commune: 10, arrêt: 8, stade: 8, université: 6, hôpital: 5, pont: 4, rue: 3, supermarché: 2, lieu: 2, église: 0 };

const INDEX = (places as Entry[]).map(e => ({ e, n: norm(e[0]), c: norm(e[2]) }));

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('q') ?? '';
  const q = norm(raw).slice(0, 60);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const words = q.split(' ').filter(w => w && !STOP.has(w));
  if (!words.length) return NextResponse.json({ results: [] });

  const scored: Array<{ e: Entry; s: number }> = [];
  for (const { e, n, c } of INDEX) {
    // chaque mot doit se trouver dans le nom… ou dans la commune (« kabambare barumbu »)
    let s = 0, ok = true;
    for (const w of words) {
      if (new RegExp(`(^| )${w}`).test(n)) s += 20;
      else if (n.includes(w)) s += 8;
      else if (c.startsWith(w)) s += 6;
      else { ok = false; break; }
    }
    if (!ok) continue;
    if (n === q || n.endsWith(` ${q}`)) s += 30;
    s += KIND_BONUS[e[1]] ?? 0;
    s -= Math.min(10, n.length / 8);   // à score égal, le nom le plus court est le plus précis
    scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s);
  const results = scored.slice(0, 8).map(({ e }) => ({ name: e[0], kind: e[1], commune: e[2], lat: e[3], lng: e[4] }));
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
