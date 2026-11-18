#!/usr/bin/env node
/**
 * Nettoie le CSV des états de route (presse, ministère, réseaux sociaux) et place chaque
 * signalement sur la carte à partir d'OpenStreetMap.
 *
 *   node scripts/road-reports/build-road-reports.mjs            # utilise le cache data/osm/
 *   node scripts/road-reports/build-road-reports.mjs --refresh  # re-télécharge OSM
 *   node scripts/road-reports/build-road-reports.mjs --csv autre.csv
 *
 * Entrées  : data/sources/kinshasa_roads_conditions_2026_merged.csv
 *            data/osm/kinshasa-{roads,admin,landmarks}.json (cache OSM, non versionné)
 * Sortie   : src/data/road-reports.json (+ un bilan des correspondances dans la console)
 *
 * Données routières © contributeurs OpenStreetMap, licence ODbL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CSV_PATH = path.resolve(ROOT, argVal('--csv', 'data/sources/kinshasa_roads_conditions_2026_merged.csv'));
const OSM_DIR = path.join(ROOT, 'data', 'osm');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'road-reports.json');
const BBOX = '-4.60,15.10,-4.25,15.60';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// ───────────────────────────── Téléchargement OSM (avec cache) ─────────────────────────────
const QUERIES = {
  'kinshasa-roads.json': `[out:json][timeout:180];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|road)(_link)?$"]["name"](${BBOX});out tags geom;`,
  'kinshasa-admin.json': `[out:json][timeout:280];relation["boundary"="administrative"]["admin_level"~"^(7|8)$"](${BBOX});out body geom;`,
  'kinshasa-landmarks.json': `[out:json][timeout:180];(nwr["name"]["place"](${BBOX});node["name"]["highway"="bus_stop"](${BBOX});nwr["name"]["junction"="roundabout"](${BBOX});nwr["name"]["amenity"~"^(marketplace|prison|place_of_worship|hospital|university|bus_station)$"](${BBOX});nwr["name"]["leisure"="stadium"](${BBOX});nwr["name"]["bridge"](${BBOX});nwr["name"]["shop"="supermarket"](${BBOX}););out tags center;`,
};

async function loadOsm(file) {
  const p = path.join(OSM_DIR, file);
  if (!args.includes('--refresh') && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  fs.mkdirSync(OSM_DIR, { recursive: true });
  for (let attempt = 0; attempt < 6; attempt++) {
    const ep = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'road-reports-build/1.0' },
        body: 'data=' + encodeURIComponent(QUERIES[file]),
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) { fs.writeFileSync(p, text); return JSON.parse(text); }
      console.warn(`  ${ep} → ${res.status}, nouvel essai…`);
    } catch (e) { console.warn(`  ${ep} → ${e.message}, nouvel essai…`); }
    await new Promise(r => setTimeout(r, 5000 * 2 ** attempt));
  }
  throw new Error(`Téléchargement OSM impossible : ${file}`);
}

// ───────────────────────────── Outils texte ─────────────────────────────
const deaccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = s => deaccent(String(s ?? '')).toLowerCase().replace(/[’`]/g, "'");
const compact = s => norm(s).replace(/[^a-z0-9]/g, '');
const ROAD_WORDS = ['avenue', 'avenues', 'av', 'boulevard', 'boulevards', 'bd', 'blvd', 'route', 'routes', 'rue', 'rues', 'rocade', 'chaussee', 'axe', 'nationale'];
const STOP = new Set(['avenue', 'av', 'boulevard', 'bd', 'blvd', 'route', 'rue', 'chaussee', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et',
  'colonel', 'general', 'commandant', 'docteur', 'maitre', 'empereur']);
/** Nom réduit à l'essentiel : « Avenue du Colonel Ebeya » → « ebeya ». */
function core(name) {
  const t = norm(name).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w && !STOP.has(w));
  return t.join('');
}
const startsWithRoadWord = s => ROAD_WORDS.some(w => norm(s).trim().startsWith(w + ' ')) || /^(rond[- ]?point|echangeur|pont)\b/.test(norm(s).trim());
/** Repère (arrêt, rond-point, marché…) réduit à son nom propre : « Arrêt Fulu » → « fulu ». */
const LM_STOP = new Set([...STOP, 'arret', 'stop', 'marche', 'market', 'stade', 'prison', 'centrale', 'roundabout', 'rond', 'point', 'quartier',
  'eglise', 'church', 'the', 'entrance', 'exit', 'crossing', 'carrefour', 'near', 'pk', '0']);
const lmCore = name => norm(name).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w && !LM_STOP.has(w)).join('');
function lev(a, b) {
  const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// ───────────────────────────── Géométrie ─────────────────────────────
const M_PER_DEG = 111320;
const distM = (a, b) => { const dy = (a[0] - b[0]) * M_PER_DEG, dx = (a[1] - b[1]) * M_PER_DEG * Math.cos(a[0] * Math.PI / 180); return Math.hypot(dx, dy); };
function projSeg(p, a, b) {
  const k = Math.cos(p[0] * Math.PI / 180);
  const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0];
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return [ay + t * dy, (ax + t * dx) / k];
}
/** Point le plus proche entre deux ensembles de polylignes. */
function closestApproach(linesA, linesB) {
  let best = { d: Infinity, a: null, b: null };
  for (const la of linesA) for (const p of la) for (const lb of linesB) for (let i = 1; i < lb.length; i++) {
    const q = projSeg(p, lb[i - 1], lb[i]); const d = distM(p, q);
    if (d < best.d) best = { d, a: p, b: q };
  }
  return best;
}
const lineLen = l => l.reduce((s, p, i) => i ? s + distM(l[i - 1], p) : 0, 0);
function midpointAlong(l) {
  const half = lineLen(l) / 2; let acc = 0;
  for (let i = 1; i < l.length; i++) { const d = distM(l[i - 1], l[i]); if (acc + d >= half) { const t = d ? (half - acc) / d : 0; return [l[i - 1][0] + t * (l[i][0] - l[i - 1][0]), l[i - 1][1] + t * (l[i][1] - l[i - 1][1])]; } acc += d; }
  return l[0];
}
function simplify(l, tol = 8) {
  if (l.length < 3) return l;
  let maxD = 0, idx = 0;
  for (let i = 1; i < l.length - 1; i++) { const d = distM(l[i], projSeg(l[i], l[0], l[l.length - 1])); if (d > maxD) { maxD = d; idx = i; } }
  if (maxD <= tol) return [l[0], l[l.length - 1]];
  return [...simplify(l.slice(0, idx + 1), tol).slice(0, -1), ...simplify(l.slice(idx), tol)];
}
const r5 = p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];
/** Pair-impair sur toutes les arêtes extérieures (les anneaux n'ont pas besoin d'être reconstitués). */
function inside(p, poly) {
  let c = false; const [y, x] = p;
  for (const [a, b] of poly.edges) {
    if ((a[0] > y) !== (b[0] > y) && x < (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]) + a[1]) c = !c;
  }
  return c;
}
/** Assemble les tronçons d'une même rue en chaînes continues. */
function stitch(lines) {
  const pool = lines.map(l => l.slice()); const chains = [];
  while (pool.length) {
    let ch = pool.shift(), grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i], s = w[0], e = w[w.length - 1], cs = ch[0], ce = ch[ch.length - 1];
        if (distM(ce, s) < 25) ch = [...ch, ...w.slice(1)];
        else if (distM(ce, e) < 25) ch = [...ch, ...w.slice(0, -1).reverse()];
        else if (distM(cs, e) < 25) ch = [...w.slice(0, -1), ...ch];
        else if (distM(cs, s) < 25) ch = [...w.slice(1).reverse(), ...ch];
        else continue;
        pool.splice(i, 1); grew = true; break;
      }
    }
    chains.push(ch);
  }
  return chains;
}

// ───────────────────────────── CSV ─────────────────────────────
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(v => v !== '')) rows.push(row); row = []; }
    else f += c;
  }
  if (f || row.length) { row.push(f); if (row.some(v => v !== '')) rows.push(row); }
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
/** « 2026-11-18 », « 11/18/2026 14:30:00 », « 3/14/2026 1:00:00 AM » → ISO, heure de Kinshasa (UTC+1). */
function isoDate(s) {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return m[4] ? `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, '0')}:${m[5]}:00+01:00` : `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i);
  if (!m) return null;
  const [, mo, d, y, hh, mm, ap] = m; const date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  if (!hh) return date;
  let h = +hh; if (ap) { if (/pm/i.test(ap) && h < 12) h += 12; if (/am/i.test(ap) && h === 12) h = 0; }
  return `${date}T${String(h).padStart(2, '0')}:${mm}:00+01:00`;
}

// ───────────────────────────── Normalisation des champs ─────────────────────────────
const STATUS = {
  flooded: 'flooded', flooded_recurrent: 'flooded',
  cut: 'impassable', blocked: 'impassable', impassable: 'impassable',
  restricted: 'closed',
  at_risk: 'at_risk', degraded: 'degraded', damaged: 'degraded',
  under_reconstruction: 'works', under_construction: 'works', works: 'works',
  congested: 'congested', incident: 'incident',
  open: 'open', rehabilitated: 'open', unknown: 'unknown',
};
function category(type, status) {
  const t = norm(type);
  if (/closure|restriction/.test(t)) return 'closure';
  if (/flood|standing_water|overflow/.test(t) && !/drainage_works/.test(t)) return 'flood';
  if (/erosion|landslide|road_cut/.test(t)) return 'erosion';
  if (/reopen|new_bridge/.test(t) || status === 'open') return 'reopened';
  if (/road_works|roadworks|concreting|asphalt|drainage_works|sanitation|interchange|dredging/.test(t)) return 'works';
  if (/pothole|damage|degraded|crack|mud/.test(t)) return 'pothole';
  if (/accident|crash|fatal/.test(t)) return 'accident';
  if (/traffic|congest|jam|checks|obstruction|market|shortage/.test(t)) return 'congestion';
  return 'other';
}
/** Correspondance avec les types de signalement déjà affichés par la carte des dangers. */
const APP_TYPE = { closure: 'blockage', flood: 'blockage', erosion: 'damaged_road', pothole: 'pothole' };
function severity(s) {
  const v = norm(s);
  if (v === 'improving' || v === 'good') return { severity: 'low', trend: v };
  return { severity: ['high', 'medium', 'low'].includes(v) ? v : 'unknown', trend: null };
}
function sourceTier(r) {
  if (/ministry|ministere/i.test(r.source_name)) return 'official';
  if (/facebook|social/i.test(r.source_type) || /social media/i.test(r.source_name)) return 'social';
  return 'press';
}
const UNOFFICIAL_MIRRORS = ['teapawt.org'];

// ───────────────────────────── Index OSM ─────────────────────────────
function buildRoadIndex(osm) {
  const byCore = new Map();
  for (const w of osm.elements) {
    if (!w.geometry) continue;
    const line = w.geometry.map(g => [g.lat, g.lon]);
    for (const n of new Set([w.tags.name, w.tags['name:fr'], w.tags.alt_name, w.tags.old_name].filter(Boolean).flatMap(x => x.split(';')))) {
      const k = core(n); if (k.length < 3) continue;
      if (!byCore.has(k)) byCore.set(k, []);
      byCore.get(k).push({ id: w.id, name: w.tags.name, surface: w.tags.surface ?? null, highway: w.tags.highway, line });
    }
  }
  return byCore;
}
/** Regroupe les tronçons homonymes en rues distinctes (deux avenues Uele dans deux communes…). */
function clusters(ways) {
  const parent = ways.map((_, i) => i); const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < ways.length; i++) for (let j = i + 1; j < ways.length; j++) {
    if (find(i) === find(j)) continue;
    const a = ways[i].line, b = ways[j].line;
    const ends = [a[0], a[a.length - 1], b[0], b[b.length - 1]];
    const near = [[ends[0], b], [ends[1], b], [ends[2], a], [ends[3], a]].some(([p, l]) => l.some(q => distM(p, q) < 150));
    if (near) parent[find(i)] = find(j);
  }
  const g = new Map(); ways.forEach((w, i) => { const r = find(i); if (!g.has(r)) g.set(r, []); g.get(r).push(w); });
  return [...g.values()].map(ws => ({ ways: ws, lines: ws.map(w => w.line), len: ws.reduce((s, w) => s + lineLen(w.line), 0) }));
}
function buildAreas(admin) {
  const areas = admin.elements.map(rel => {
    const edges = [];
    for (const m of rel.members ?? []) if (m.type === 'way' && m.role !== 'inner' && m.geometry)
      for (let i = 1; i < m.geometry.length; i++) edges.push([[m.geometry[i - 1].lat, m.geometry[i - 1].lon], [m.geometry[i].lat, m.geometry[i].lon]]);
    const pts = edges.flat(); const b = rel.bounds;
    return { id: rel.id, level: +rel.tags.admin_level, name: rel.tags.name, key: compact(rel.tags.name.replace(/\(.*\)/, '')), edges, pts,
      center: b ? [(b.minlat + b.maxlat) / 2, (b.minlon + b.maxlon) / 2] : pts[0] };
  });
  const communes = areas.filter(a => a.level === 7);
  for (const q of areas.filter(a => a.level === 8)) q.commune = communes.find(c => inside(q.center, c))?.name ?? null;
  return { communes, quarters: areas.filter(a => a.level === 8) };
}

// ───────────────────────────── Lecture des champs « lieu » ─────────────────────────────
/** Communes et quartiers cités dans le champ commune_or_area (et « quartier X » dans le tronçon). */
function resolveArea(r, A) {
  // les noms de rue cités ne sont pas des quartiers (« Route de Matadi » ≠ quartier Matadi)
  const text = norm(r.commune_or_area).replace(/\b(avenues?|boulevards?|routes?|rues?|rocades?|bd|av)\s+((de|du|des|la|l')\s*)*[a-z0-9'-]+(\s+[a-z0-9'-]+)?/g, ' ');
  const words = ' ' + text.replace(/[^a-z0-9]+/g, ' ') + ' ';
  const wordsC = text.replace(/[^a-z0-9]/g, '');
  const vague = /city-wide|several communes|commune not stated|centre|western communes/.test(text);
  const communes = A.communes.filter(c => {
    if (c.key === 'kinshasa') return /\/\s*kinshasa|kinshasa\s*\//.test(text);   // « Kinshasa » seul = la ville
    return wordsC.includes(c.key);
  });
  const qText = words + ' ' + (norm(r.segment).match(/([a-z' -]+) quarter/)?.[1] ?? '').replace(/[^a-z0-9]+/g, ' ') + ' ';
  const quarters = A.quarters.filter(q => q.key.length >= 4 && !A.communes.some(c => c.key === q.key) &&
    qText.replace(/ /g, '').includes(q.key) && new RegExp(`\\b${norm(q.name.replace(/\(.*\)/, '')).trim().replace(/[^a-z0-9]+/g, '\\W*')}\\b`).test(qText) &&
    (!communes.length || communes.some(c => c.name === q.commune)));
  return { communes, quarters, vague };
}

/** Découpe le champ « road » en noms de rues : listes, croisements, pluriels (« Avenues A, B »). */
function parseRoads(raw) {
  let s = deaccent(raw).replace(/[’]/g, "'");
  const ex = [];
  const segInParen = [];
  s = s.replace(/\(([^)]*)\)/g, (_, inner) => {
    if (/^\s*ex[- ]/i.test(inner)) ex.push(inner.replace(/^\s*ex[- ]\s*/i, ''));
    else if (/\bto\b/i.test(inner)) segInParen.push(inner);
    else if (startsWithRoadWord(inner)) ex.push('@' + inner);               // le vrai nom est entre parenthèses
    else if (/^RN\s*1$/i.test(inner.trim())) ex.push('Route de Matadi');
    return ' ';
  });
  const intersection = /\bx\b|intersection|croisement|crossing/i.test(raw);
  s = s.replace(/^\s*intersection of\s+/i, '').replace(/\s+intersection\s*$/i, '').replace(/^\s*axis from .*$/i, '');
  let parts = s.split(/\s+x\s+|\s+and\s+|\s*,\s*|\s+\/\s+|\s+-\s+|\s*&\s*/i).map(p => p.trim()).filter(Boolean);
  // « Avenues A, B et C » / « Boulevards A and B » : on reporte le mot « Avenue » sur chaque nom
  const plural = deaccent(raw).match(/^\s*(?:intersection of\s+)?(Avenues|Boulevards|Routes)\b/i);
  if (plural) {
    const word = plural[1].replace(/s$/i, '');
    parts = parts.map((p, i) => (i === 0 ? p.replace(/^(?:intersection of\s+)?(Avenues|Boulevards|Routes)\s+/i, '') : p)).map(p => startsWithRoadWord(p) ? p : `${word} ${p}`);
  }
  if (/^Route Nationale 1/i.test(raw)) parts = ['Route de Matadi'];
  const names = parts.filter(p => startsWithRoadWord(p) && !/surrounding|not specified|in .* quarter|^roads? in/i.test(p));
  const promoted = ex.filter(e => e.startsWith('@')).map(e => e.slice(1));
  return { names: [...names, ...promoted], aliases: ex.filter(e => !e.startsWith('@')), intersection, segInParen: segInParen[0] ?? null };
}
/** « A to B », « from A toward B », « Between A and B » → [A, B] (rues seulement). */
function parseSegmentEnds(seg) {
  if (!seg) return null;
  const s = deaccent(seg).replace(/\([^)]*\)/g, ' ').replace(/,.*$/, '').trim();
  let m = s.match(/^between\s+(.+?)\s+and\s+(.+)$/i) || s.match(/^(?:.*?\bfrom\s+)?(.+?)\s+(?:to|toward|towards|vers)\s+(?:the\s+)?(.+)$/i);
  if (!m) return null;
  return [m[1], m[2]].map(x => x.replace(/^(PK\s*\d+\s*)/i, '').trim());
}

// ───────────────────────────── Placement d'un signalement ─────────────────────────────
function makeMatcher(index, A, aliases, landmarks, manual) {
  const manualFor = name => manual.get(core(name));
  const coreKeys = [...index.keys()];
  function lookup(name) {
    const k = core(name); if (k.length < 3) return { ways: [], how: null };
    if (index.has(k)) return { ways: index.get(k), how: 'exact' };
    for (const a of aliases.get(k) ?? []) if (index.has(a)) return { ways: index.get(a), how: 'alias', matched: a };
    if (k.length >= 7) {
      const near = coreKeys.filter(c => Math.abs(c.length - k.length) <= 1 && c[0] === k[0] && lev(c, k) <= 1);
      if (near.length === 1) return { ways: index.get(near[0]), how: 'fuzzy', matched: near[0] };
    }
    return { ways: [], how: null };
  }
  const touchesArea = (cl, polys) => polys.some(p => cl.lines.some(l => l.some(pt => inside(pt, p))));
  const nearArea = (cl, polys, m) => polys.some(p => cl.lines.some(l => l.some(pt => p.pts.some(q => distM(pt, q) < m))));

  /** Choisit la (ou les) rue(s) OSM qui correspondent au nom, dans la zone citée si elle est connue. */
  function pick(name, area) {
    const { ways, how, matched } = lookup(name);
    if (!ways.length) return null;
    const cls = clusters(ways).sort((a, b) => b.len - a.len);
    // table manuelle : « la rue OSM de ce nom la plus proche de tel repère », quelle que soit la commune citée
    const m = manualFor(name);
    if (m?.kind === 'osm_near') {
      const near = cls.filter(c => c.lines.some(l => l.some(p => distM(p, m.near) <= (m.radiusM ?? 1000))));
      if (near.length) return { clusters: near, how: 'manual', matched, placed: 'manual' };
    }
    const zones = area.quarters.length ? [area.quarters, area.communes] : [area.communes];
    for (const z of zones) {
      if (!z.length) continue;
      const inZ = cls.filter(c => touchesArea(c, z));
      if (inZ.length) return { clusters: inZ, how, matched, placed: z === area.quarters ? 'quarter' : 'commune' };
      const nearZ = cls.filter(c => nearArea(c, z, 800));
      if (nearZ.length) return { clusters: nearZ.slice(0, 1), how, matched, placed: 'near_area' };
    }
    // la zone est citée mais aucune rue de ce nom n'y passe : on ne la place pas ailleurs
    if (area.communes.length || area.quarters.length) return { outside: true };
    const ambiguous = cls.length > 1 && cls[1].len > cls[0].len * 0.5;
    return { clusters: [cls[0]], how, matched, placed: ambiguous ? 'ambiguous' : 'name' };
  }
  /** Garde la partie de la rue située dans la commune citée (plus un sommet de part et d'autre). */
  function clip(lines, polys) {
    if (!polys.length) return lines;
    const out = [];
    for (const l of lines) {
      const ins = l.map(p => polys.some(z => inside(p, z)));
      let run = [];
      for (let i = 0; i < l.length; i++) {
        const keep = ins[i] || ins[i - 1] || ins[i + 1];
        if (keep) run.push(l[i]); else if (run.length) { if (run.length > 1) out.push(run); run = []; }
      }
      if (run.length > 1) out.push(run);
    }
    return out.length ? out : lines;
  }
  /** Coupe la rue entre les deux rues transversales citées (« Kasa-Vubu to Rond-point Huileries »). */
  /**
   * Repère cité (rue transversale, rond-point, arrêt, marché) projeté sur la rue principale.
   * Le nom seul est peu fiable (homonymes) : on n'accepte que ce qui est à moins de `maxM` de la rue.
   */
  function anchor(text, lines, maxM = 150) {
    let best = { d: Infinity };
    const ways = lookup(text).ways;
    if (ways.length) { const ca = closestApproach(ways.map(w => w.line), lines); if (ca.d < best.d) best = { d: ca.d, p: ca.b, via: ways[0].name }; }
    const k = lmCore(text);
    if (k.length >= 3) for (const lm of landmarks) {
      if (!(lm.k === k || (lm.k.length >= 3 && (lm.k.includes(k) || k.includes(lm.k))))) continue;
      const ca = closestApproach([[lm.c]], lines);
      const d = Math.max(0, ca.d - 100);                       // un rond-point ou un marché a de l'emprise
      if (d < best.d) best = { d, p: ca.b, via: lm.name };
    }
    return best.d <= maxM ? best : null;
  }
  function cutBetween(lines, ends) {
    const pts = [];
    for (const e of ends) { const a = anchor(e, lines); if (!a) return null; pts.push(a.p); }
    const out = [];
    for (const ch of stitch(lines)) {
      const idx = pts.map(p => { let bi = 0, bd = Infinity; ch.forEach((q, i) => { const d = distM(p, q); if (d < bd) { bd = d; bi = i; } }); return { bi, bd }; });
      if (idx.every(x => x.bd < 120)) { const [a, b] = [idx[0].bi, idx[1].bi].sort((x, y) => x - y); if (b > a) out.push([pts[idx[0].bi <= idx[1].bi ? 0 : 1], ...ch.slice(a + 1, b), pts[idx[0].bi <= idx[1].bi ? 1 : 0]]); }
    }
    return out.length ? out : null;
  }

  return function place(r) {
    const area = resolveArea(r, A);
    const pr = parseRoads(r.road);
    const notes = [];
    const ok = x => x.p && !x.p.outside;
    let picks = pr.names.map(n => ({ n, p: pick(n, area) }));
    if (!picks.some(ok) && pr.aliases.length) picks = pr.aliases.map(n => ({ n, p: pick(n.match(/^(avenue|boulevard|route)/i) ? n : `Avenue ${n}`, area) }));
    const found = picks.filter(ok);
    for (const x of picks.filter(x => !ok(x))) notes.push(x.p?.outside ? `aucune rue « ${x.n} » dans la zone citée (${r.commune_or_area})` : `rue introuvable dans OSM : ${x.n}`);
    for (const x of found) if (x.p.how === 'alias') notes.push(`autre nom : « ${x.n} » = ${x.p.clusters[0].ways[0].name}`);
    for (const x of found) if (x.p.how === 'fuzzy') notes.push(`orthographe proche : « ${x.n} » ≈ ${x.p.clusters[0].ways[0].name}`);
    for (const x of found) if (x.p.placed === 'ambiguous') notes.push(`plusieurs rues « ${x.n} » dans Kinshasa : la plus longue a été retenue`);

    const areaFallback = () => {
      const z = area.quarters[0] ?? area.communes[0];
      if (!z || area.vague && !area.quarters.length && area.communes.length !== 1) return null;
      return { quality: area.quarters[0] ? 'quarter_center' : 'commune_center', point: r5(z.center), lines: null, osmWayIds: [], area: z.name };
    };

    // Croisement de deux rues → un point
    if (pr.intersection && found.length >= 2) {
      const a = found[0].p.clusters, b = found[1].p.clusters;
      // on réessaie sans contrainte de zone pour trouver le vrai carrefour (homonymes)
      const A1 = clusters(lookup(found[0].n).ways), B1 = clusters(lookup(found[1].n).ways);
      let ca = closestApproach(a.flatMap(c => c.lines), b.flatMap(c => c.lines));
      if (ca.d > 200) ca = closestApproach(A1.flatMap(c => c.lines), B1.flatMap(c => c.lines));
      const wayIds = [...a, ...b].flatMap(c => c.ways.map(w => w.id));
      if (ca.d <= 200) return { geo: { quality: 'intersection', point: r5(ca.b), lines: null, osmWayIds: wayIds }, notes };
      if (ca.d <= 600) {
        notes.push(`les deux rues ne se touchent pas dans OSM (écart ${Math.round(ca.d)} m) : point placé entre les deux`);
        return { geo: { quality: 'intersection_approx', point: r5([(ca.a[0] + ca.b[0]) / 2, (ca.a[1] + ca.b[1]) / 2]), lines: null, osmWayIds: wayIds }, notes };
      }
      notes.push(`les deux rues ne se croisent pas dans OSM (écart ${Math.round(ca.d)} m)`);
    }
    if (!found.length) {
      // table manuelle : position connue d'une rue absente d'OSM
      const areaText = norm(r.commune_or_area);
      for (const x of picks) {
        const m = manualFor(x.n);
        if (m?.kind !== 'point' || (m.onlyWhenArea && !areaText.includes(m.onlyWhenArea))) continue;
        notes.push(`position tirée de la table manuelle : ${m.source}`);
        return { geo: { quality: m.precision === 'street' ? 'manual_point' : 'manual_area', point: r5(m.point), lines: null, osmWayIds: [], area: m.area ?? m.name }, notes };
      }
      return { geo: areaFallback(), notes };
    }

    let lines = found.flatMap(x => x.p.clusters.flatMap(c => c.lines));
    const ids = found.flatMap(x => x.p.clusters.flatMap(c => c.ways.map(w => w.id)));
    const ends = parseSegmentEnds(pr.segInParen ?? r.segment);
    let quality = found.some(x => x.p.placed === 'ambiguous') ? 'road_ambiguous' : found.some(x => x.p.how === 'fuzzy') ? 'road_fuzzy' : 'road';
    // un croisement ou un échangeur demandé mais introuvable : dessiner les rues entières tromperait
    if (pr.intersection) return { geo: areaFallback(), notes };
    let point = null;
    const cut = ends && found.length === 1 ? cutBetween(lines, ends) : null;
    // « near Avenue Kikwit entrance », « Gombe, near Mandela crossing » : un repère sur la rue
    const nearText = [r.segment, r.commune_or_area].map(t => deaccent(t || '').match(/\bnear\s+([^,;]+)/i)?.[1]).find(Boolean);
    const near = !cut && nearText ? anchor(nearText.replace(/\s+(entrance|exit|crossing|stop|junction)\b.*$/i, ''), lines, 200) : null;
    if (cut) { lines = cut; quality = 'segment'; }
    else if (near) {
      point = near.p; quality = 'near_landmark';
      notes.push(`placé près de ${near.via}`);
      lines = stitch(lines).flatMap(ch => { const keep = ch.filter(p => distM(p, near.p) <= 300); return keep.length > 1 ? [keep] : []; });
      if (!lines.length) lines = null;
    } else {
      if (ends && found.length === 1) notes.push(`tronçon « ${ends.join(' → ')} » non découpé (extrémités introuvables)`);
      lines = clip(stitch(lines), area.communes);
    }
    lines = lines ? lines.map(l => simplify(l).map(r5)).filter(l => l.length > 1) : null;
    if (!point) point = midpointAlong(lines.slice().sort((a, b) => lineLen(b) - lineLen(a))[0]);
    const surfaces = [...new Set(found.flatMap(x => x.p.clusters.flatMap(c => c.ways.map(w => w.surface))).filter(Boolean))];
    return { geo: { quality, point: r5(point), lines, osmWayIds: [...new Set(ids)], osmNames: [...new Set(found.flatMap(x => x.p.clusters.map(c => c.ways[0].name)))], osmSurface: surfaces }, notes };
  };
}

// ───────────────────────────── Programme ─────────────────────────────
const roadsOsm = await loadOsm('kinshasa-roads.json');
const adminOsm = await loadOsm('kinshasa-admin.json');
const landmarksOsm = await loadOsm('kinshasa-landmarks.json');
const index = buildRoadIndex(roadsOsm);
const A = buildAreas(adminOsm);
const landmarks = landmarksOsm.elements
  .map(e => ({ name: e.tags.name, k: lmCore(e.tags.name), c: e.lat != null ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null }))
  .filter(l => l.c && l.k.length >= 3);

const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8').replace(/^﻿/, ''));

// Autres noms d'une même rue : ceux de l'inventaire du CSV (« Aliases: … ») + quelques équivalences connues.
const aliases = new Map();
const addAlias = (a, b) => { const ka = core(a), kb = core(b); if (!ka || !kb || ka === kb) return;
  for (const [x, y] of [[ka, kb], [kb, ka]]) { if (!aliases.has(x)) aliases.set(x, []); aliases.get(x).push(y); } };
for (const r of rows.filter(x => x.record_kind === 'road_inventory')) {
  // un ancien nom (« former name ») a souvent été réattribué à une autre rue depuis : on ne s'en sert pas
  const list = (r.summary.match(/^Aliases:\s*(.*)$/)?.[1] ?? '').split(/;|,/)
    .filter(s => !/former name|ancien nom/i.test(s)).map(s => s.replace(/\(.*\)/, '').trim()).filter(Boolean);
  for (const a of list) addAlias(r.road.replace(/\(.*\)/, ''), a);
}
addAlias('Route Nationale 1', 'Route de Matadi');
// Pas d'équivalence « Rocade Sud-Ouest » = « Rocade Ouest de Kinshasa » : le tracé OSM s'arrête à ~2 km de la Route de Matadi.
// Rues absentes d'OSM : positions sourcées à la main (data/sources/manual-streets.json)
const MANUAL_PATH = path.join(ROOT, 'data', 'sources', 'manual-streets.json');
const manual = new Map();
for (const m of fs.existsSync(MANUAL_PATH) ? JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf8')).streets : []) {
  if (m.kind === 'todo') continue;
  for (const n of [m.name, ...(m.aliases ?? [])]) manual.set(core(n), m);
  if (m.kind === 'osm_alias') addAlias(m.name, m.osmName);
  // un point connu sert aussi de repère pour découper les tronçons (« … → Rond-point Huileries »)
  if (m.kind === 'point' && m.precision === 'street') landmarks.push({ name: m.name, k: lmCore(m.name), c: m.point });
}
const place = makeMatcher(index, A, aliases, landmarks, manual);
const urlCount = new Map();
for (const r of rows) if (r.record_kind === 'condition_report' && r.source_url) urlCount.set(r.source_url, (urlCount.get(r.source_url) ?? 0) + 1);

// Textes en français, rédigés à la main (data/sources/road-reports-fr.json, clé = record_id)
const FR_PATH = path.join(ROOT, 'data', 'sources', 'road-reports-fr.json');
const fr = fs.existsSync(FR_PATH) ? JSON.parse(fs.readFileSync(FR_PATH, 'utf8')) : {};
const notesById = {};
const reports = [];
for (const r of rows.filter(x => x.record_kind === 'condition_report')) {
  const status = STATUS[norm(r.status)] ?? 'unknown';
  const cat = category(r.condition_type, status);
  const { severity: sev, trend } = severity(r.severity);
  const urls = [...new Set([r.source_url, ...(r.source_urls || '').split(';')].map(u => u.trim()).filter(Boolean))];
  const flags = [];
  if (!urls.length) flags.push('no_source_url');
  if (urls.some(u => UNOFFICIAL_MIRRORS.some(d => u.includes(d)))) flags.push('unofficial_mirror');
  if (r.source_url && urlCount.get(r.source_url) > 1) flags.push('shared_source_url');
  const { geo, notes } = place(r);
  notesById[r.record_id] = notes;
  reports.push({
    id: r.record_id,
    observedAt: isoDate(r.observed_at) ?? isoDate(r.post_date),
    expiresAt: isoDate(r.expires_at),
    category: cat,
    appType: APP_TYPE[cat] ?? null,
    status,
    severity: sev,
    trend,
    title: fr[r.record_id] ?? r.summary,
    titleOriginal: r.summary,
    translated: r.record_id in fr,
    area: r.commune_or_area || null,
    road: r.road || null,
    segment: r.segment && r.segment !== r.commune_or_area ? r.segment : null,
    surface: r.surface && r.surface !== 'unknown' ? r.surface : null,
    detours: r.detours ? r.detours.split(';').map(s => s.trim()).filter(Boolean) : [],
    source: { tier: sourceTier(r), type: r.source_type, name: r.source_name, urls },
    confidence: ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'unknown',
    flags,
    geo,
  });
}
reports.sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)));

const out = {
  generatedAt: new Date().toISOString(),
  sources: {
    csv: path.basename(CSV_PATH),
    osm: { snapshot: roadsOsm.osm3s?.timestamp_osm_base ?? null, attribution: '© contributeurs OpenStreetMap', licence: 'ODbL 1.0' },
  },
  reports,
};
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(out));

// Bilan
const q = {}; reports.forEach(r => { const k = r.geo?.quality ?? 'none'; q[k] = (q[k] ?? 0) + 1; });
console.log(`${reports.length} signalements → ${path.relative(ROOT, OUT_PATH)} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(0)} Ko)`);
console.log('Placement :', q);
const untranslated = reports.filter(r => !r.translated).map(r => r.id);
if (untranslated.length) console.warn(`Sans texte français (${untranslated.length}) : ${untranslated.join(', ')}`);
if (args.includes('--verbose')) for (const r of reports) {
  console.log(`- ${r.id} [${r.geo?.quality ?? 'none'}] ${r.road} | ${r.area}${r.geo?.osmNames ? ' → ' + r.geo.osmNames.join(', ') : r.geo?.area ? ' → ' + r.geo.area : ''}`);
  for (const n of notesById[r.id]) console.log('    · ' + n);
}
