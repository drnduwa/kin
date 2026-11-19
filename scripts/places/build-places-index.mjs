#!/usr/bin/env node
/**
 * Index de recherche des lieux de Kinshasa pour le Mode Conduite (départ / arrivée par nom).
 *
 *   node scripts/places/build-places-index.mjs
 *
 * Entrées : data/osm/kinshasa-{roads,landmarks,admin}.json (téléchargés par
 *           « npm run data:road-reports -- --refresh » si absents).
 * Sortie  : src/data/kinshasa-places.json : [nom, type, commune, lat, lng][]
 *
 * Une rue qui porte le même nom dans plusieurs communes donne une entrée par commune
 * (« Avenue Kabambare — Kinshasa », « Avenue Kabambare — Barumbu »…).
 * Données © contributeurs OpenStreetMap, licence ODbL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OSM = path.join(ROOT, 'data', 'osm');
const OUT = path.join(ROOT, 'src', 'data', 'kinshasa-places.json');
const read = f => {
  const p = path.join(OSM, f);
  if (!fs.existsSync(p)) throw new Error(`${p} manquant : lancez d'abord « npm run data:road-reports -- --refresh ».`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

// ── Communes (pour situer chaque lieu) ──
const communes = read('kinshasa-admin.json').elements.filter(e => e.tags.admin_level === '7').map(rel => {
  const edges = [];
  for (const m of rel.members ?? []) if (m.type === 'way' && m.role !== 'inner' && m.geometry)
    for (let i = 1; i < m.geometry.length; i++) edges.push([[m.geometry[i - 1].lat, m.geometry[i - 1].lon], [m.geometry[i].lat, m.geometry[i].lon]]);
  return { name: rel.tags.name, edges, bounds: rel.bounds };
});
const inside = ([y, x], edges) => {
  let c = false;
  for (const [a, b] of edges) if ((a[0] > y) !== (b[0] > y) && x < (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]) + a[1]) c = !c;
  return c;
};
const communeOf = p => communes.find(c => {
  const b = c.bounds;
  return (!b || (p[0] >= b.minlat && p[0] <= b.maxlat && p[1] >= b.minlon && p[1] <= b.maxlon)) && inside(p, c.edges);
})?.name ?? '';
const r5 = n => Math.round(n * 1e5) / 1e5;
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const out = [];
const seen = new Set();
const push = (name, kind, p) => {
  const commune = communeOf(p);
  // Hors des communes de Kinshasa à l'ouest = Brazzaville, de l'autre côté du fleuve (Maluku, à l'est, n'a pas de limite dans OSM)
  if (!commune && p[1] < 15.45) return;
  const key = `${norm(name)}|${kind}|${commune}`;
  if (!name || seen.has(key)) return;
  seen.add(key);
  out.push([name, kind, commune, r5(p[0]), r5(p[1])]);
};

// ── Rues : une entrée par nom et par commune, placée au milieu de son plus long tronçon ──
const groups = new Map();
for (const w of read('kinshasa-roads.json').elements) {
  if (!w.geometry?.length || !w.tags.name) continue;
  const mid = w.geometry[Math.floor(w.geometry.length / 2)];
  const p = [mid.lat, mid.lon];
  const key = `${norm(w.tags.name)}|${communeOf(p)}`;
  const len = w.geometry.length;
  const g = groups.get(key);
  if (!g || len > g.len) groups.set(key, { name: w.tags.name, p, len });
}
for (const g of groups.values()) push(g.name, 'rue', g.p);

// ── Repères : marchés, ronds-points, arrêts, quartiers, hôpitaux, écoles… ──
const KIND = t =>
  t.junction === 'roundabout' ? 'rond-point'
  : t.amenity === 'marketplace' ? 'marché'
  : t.amenity === 'bus_station' || t.highway === 'bus_stop' ? 'arrêt'
  : t.amenity === 'hospital' ? 'hôpital'
  : t.amenity === 'university' ? 'université'
  : t.amenity === 'place_of_worship' ? 'église'
  : t.amenity === 'prison' ? 'lieu'
  : t.leisure === 'stadium' ? 'stade'
  : t.bridge ? 'pont'
  : t.shop === 'supermarket' ? 'supermarché'
  : ['quarter', 'suburb', 'neighbourhood', 'locality', 'village', 'hamlet', 'town', 'square'].includes(t.place) ? 'quartier'
  : null;
for (const e of read('kinshasa-landmarks.json').elements) {
  const kind = KIND(e.tags);
  const p = e.lat != null ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null;
  if (kind && p && e.tags.name) push(e.tags.name, kind, p);
}

// ── Communes elles-mêmes ──
for (const c of communes) if (c.bounds) push(c.name, 'commune', [(c.bounds.minlat + c.bounds.maxlat) / 2, (c.bounds.minlon + c.bounds.maxlon) / 2]);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const byKind = {};
for (const e of out) byKind[e[1]] = (byKind[e[1]] ?? 0) + 1;
console.log(`${out.length} lieux → ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko)`, byKind);
