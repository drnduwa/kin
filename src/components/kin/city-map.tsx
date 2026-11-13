'use client';

/**
 * Carte illustrée et zoomable de Kinshasa pour le Centre de Contrôle Trafic.
 *
 * - Fleuve Congo, Pool Malebo, Brazzaville en face, collines, rivières N'djili et Kalamu.
 * - 23 communes (contours approximatifs) teintées d'après le carrefour mesuré le plus proche.
 * - Grands axes colorés par l'état mesuré, avec des voitures qui roulent à la vitesse du niveau
 *   (pare-chocs contre pare-chocs quand c'est bloqué, feux stop allumés).
 * - Repères (Tour de l'Échangeur, Stade des Martyrs, aéroport, Beach Ngobila…), bac vers
 *   Brazzaville, avions à N'djili, pirogues sur le Pool.
 * - Signalements des usagers posés à leur vraie position.
 * - Zoom molette / pincer / boutons / double-clic, glisser pour se déplacer, plein écran.
 *
 * Aucune couleur de trafic n'est inventée : sans mesure, la route reste grise et la commune neutre.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import { Plus, Minus, LocateFixed, Maximize2, Minimize2, Layers, CloudRain, Moon, Sun, Radio, ChevronRight, Check, X as XIcon, Route } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROADS, LEVEL_COLOR, LEVEL_LABEL, type MapLevel } from '@/components/game/live-city-map';
import { BLACK_SPOTS, CORRIDORS, type Corridor } from '@/lib/corridors';

// ───────────────────────────── Projection ─────────────────────────────
const W = 1200, H = 780;
const LNG0 = 15.215, LNG1 = 15.475, LAT0 = -4.262, LAT1 = -4.431;
const X = (lng: number) => ((lng - LNG0) / (LNG1 - LNG0)) * W;
const Y = (lat: number) => ((lat - LAT0) / (LAT1 - LAT0)) * H;
type LatLng = [number, number];
type P = [number, number];
const proj = (pts: LatLng[]): P[] => pts.map(([a, g]) => [X(g), Y(a)]);
const line = (pts: P[]) => 'M' + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L');
const smooth = (pts: P[]) => {
  if (pts.length < 3) return line(pts);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const l = pts[pts.length - 1];
  return d + `L${l[0].toFixed(1)},${l[1].toFixed(1)}`;
};

// ───────────────────────────── Géographie (approximative) ─────────────────────────────
const KIN_BANK: LatLng[] = [[-4.345, 15.215], [-4.330, 15.228], [-4.318, 15.240], [-4.316, 15.262], [-4.302, 15.282], [-4.293, 15.305], [-4.296, 15.335], [-4.304, 15.362], [-4.318, 15.392], [-4.328, 15.420], [-4.322, 15.445], [-4.312, 15.475]];
const BRAZZA: LatLng[] = [[-4.262, 15.215], [-4.262, 15.330], [-4.270, 15.322], [-4.276, 15.305], [-4.281, 15.288], [-4.290, 15.268], [-4.300, 15.250], [-4.315, 15.232], [-4.330, 15.215]];
const MBAMU: LatLng[] = [[-4.262, 15.383], [-4.268, 15.392], [-4.273, 15.410], [-4.271, 15.430], [-4.262, 15.447]];
const SANDBANKS: LatLng[][] = [
  [[-4.284, 15.352], [-4.288, 15.362], [-4.286, 15.372], [-4.282, 15.364]],
  [[-4.300, 15.400], [-4.305, 15.414], [-4.301, 15.424], [-4.297, 15.410]],
];
const RIVERS: Array<{ name: string; pts: LatLng[] }> = [
  { name: "Rivière N'djili", pts: [[-4.431, 15.352], [-4.412, 15.362], [-4.392, 15.374], [-4.370, 15.386], [-4.345, 15.396], [-4.326, 15.402]] },
  { name: 'Rivière Kalamu', pts: [[-4.425, 15.305], [-4.400, 15.318], [-4.372, 15.328], [-4.345, 15.336], [-4.322, 15.340], [-4.300, 15.345]] },
];
const HILLS: Array<{ c: LatLng; rx: number; ry: number; name?: string }> = [
  { c: [-4.418, 15.268], rx: 110, ry: 62, name: 'Collines de Mont-Ngafula' },
  { c: [-4.322, 15.250], rx: 46, ry: 30 },
  { c: [-4.425, 15.350], rx: 60, ry: 34 },
];

const COMMUNES: Array<{ name: string; c: LatLng }> = [
  { name: 'Gombe', c: [-4.304, 15.300] }, { name: 'Barumbu', c: [-4.313, 15.322] }, { name: 'Kinshasa', c: [-4.323, 15.313] },
  { name: 'Lingwala', c: [-4.322, 15.298] }, { name: 'Kintambo', c: [-4.326, 15.272] }, { name: 'Ngaliema', c: [-4.360, 15.245] },
  { name: 'Bandalungwa', c: [-4.343, 15.283] }, { name: 'Kasa-Vubu', c: [-4.337, 15.300] }, { name: 'Kalamu', c: [-4.350, 15.318] },
  { name: 'Ngiri-Ngiri', c: [-4.352, 15.298] }, { name: 'Bumbu', c: [-4.368, 15.290] }, { name: 'Selembao', c: [-4.385, 15.270] },
  { name: 'Makala', c: [-4.380, 15.305] }, { name: 'Ngaba', c: [-4.385, 15.322] }, { name: 'Lemba', c: [-4.398, 15.335] },
  { name: 'Limete', c: [-4.338, 15.352] }, { name: 'Matete', c: [-4.375, 15.346] }, { name: 'Kisenso', c: [-4.412, 15.350] },
  { name: 'Mont-Ngafula', c: [-4.418, 15.275] }, { name: 'Masina', c: [-4.372, 15.405] }, { name: "N'djili", c: [-4.398, 15.380] },
  { name: 'Kimbanseke', c: [-4.425, 15.395] }, { name: "N'sele", c: [-4.360, 15.455] },
];

/** Petites rues non mesurées : donnent la trame de la ville, jamais colorées. */
const MINOR_ROADS: Array<{ id: string; label: string; pts: LatLng[] }> = [
  { id: 'kabinda', label: 'Av. Kabinda', pts: [[-4.315, 15.305], [-4.322, 15.325], [-4.328, 15.345]] },
  { id: 'kimwenza', label: 'Route de Kimwenza', pts: [[-4.405, 15.300], [-4.420, 15.296], [-4.431, 15.292]] },
  { id: 'kimbanseke', label: 'Av. Bongolo', pts: [[-4.395, 15.378], [-4.412, 15.385], [-4.431, 15.392]] },
  { id: 'lemba', label: 'Av. By-Pass Lemba', pts: [[-4.390, 15.320], [-4.395, 15.338], [-4.405, 15.355]] },
  { id: 'ngaliema', label: 'Av. Colonel Mondjiba', pts: [[-4.318, 15.262], [-4.330, 15.258], [-4.345, 15.250], [-4.365, 15.245]] },
];

type Icon = 'tower' | 'stadium' | 'market' | 'port' | 'train' | 'univ' | 'plane' | 'palace' | 'hill';
const LANDMARKS: Array<{ id: string; name: string; c: LatLng; icon: Icon; color: string }> = [
  { id: 'echangeur', name: "Tour de l'Échangeur", c: [-4.3605, 15.3505], icon: 'tower', color: '#7C3AED' },
  { id: 'stade', name: 'Stade des Martyrs', c: [-4.3300, 15.3045], icon: 'stadium', color: '#16A34A' },
  { id: 'palais', name: 'Palais du Peuple', c: [-4.3365, 15.3135], icon: 'palace', color: '#B45309' },
  { id: 'marche', name: 'Grand Marché', c: [-4.3170, 15.3130], icon: 'market', color: '#EA580C' },
  { id: 'ngobila', name: 'Beach Ngobila', c: [-4.2985, 15.3150], icon: 'port', color: '#0284C7' },
  { id: 'gare', name: 'Gare Centrale', c: [-4.3020, 15.3240], icon: 'train', color: '#475569' },
  { id: 'unikin', name: 'Université de Kinshasa', c: [-4.4185, 15.3095], icon: 'univ', color: '#1D4ED8' },
  { id: 'liberte', name: 'Marché de la Liberté', c: [-4.3790, 15.3990], icon: 'market', color: '#EA580C' },
  { id: 'ndjili', name: "Aéroport de N'djili", c: [-4.3790, 15.4300], icon: 'plane', color: '#0F766E' },
  { id: 'ngaliema', name: 'Mont Ngaliema', c: [-4.3180, 15.2530], icon: 'hill', color: '#15803D' },
];

const INCIDENT_STYLE: Record<string, { label: string; color: string; glyph: string }> = {
  accident: { label: 'Accident', color: '#DC2626', glyph: '!' },
  bouchon: { label: 'Bouchon signalé', color: '#EA580C', glyph: '≡' },
  blockage: { label: 'Route bloquée', color: '#DC2626', glyph: '⛔' },
  ralentissement: { label: 'Ralentissement', color: '#F59E0B', glyph: '~' },
  chantier: { label: 'Travaux', color: '#F59E0B', glyph: '⚒' },
  inondation: { label: 'Route inondée', color: '#0284C7', glyph: '≈' },
  nid_de_poule: { label: 'Libulu (nid-de-poule)', color: '#78350F', glyph: '◉' },
  pothole: { label: 'Libulu (nid-de-poule)', color: '#78350F', glyph: '◉' },
  panne: { label: 'Véhicule en panne', color: '#F59E0B', glyph: '⚙' },
  police: { label: 'Roulage / contrôle', color: '#1D4ED8', glyph: '★' },
};

// ───────────────────────────── Voronoï des communes ─────────────────────────────
function clipHalf(poly: P[], a: number, b: number, c: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const fp = a * p[0] + b * p[1] - c, fq = a * q[0] + b * q[1] - c;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}
function voronoi(sites: P[]): P[][] {
  return sites.map((s, i) => {
    let cell: P[] = [[-20, -20], [W + 20, -20], [W + 20, H + 20], [-20, H + 20]];
    sites.forEach((o, j) => {
      if (i === j) return;
      cell = clipHalf(cell, 2 * (o[0] - s[0]), 2 * (o[1] - s[1]), o[0] ** 2 + o[1] ** 2 - s[0] ** 2 - s[1] ** 2);
    });
    return cell;
  });
}

// ───────────────────────────── Types publics ─────────────────────────────
export interface CityMapNode {
  id: string;
  name: string;
  district?: string;
  coords: { lat: number; lng: number };
  level: MapLevel;
  isLive?: boolean;
  speedKmh?: number | null;
  delayMin?: number | null;
  cause?: string | null;
  typicalCause?: string | null;
  alt?: string | null;
  lingala?: string | null;
  source?: string;
  incidents?: Array<{ id: string; type?: string | null; description?: string; locationName?: string | null; coords: { lat: number; lng: number }; ageMin?: number }>;
}

type Sel = { kind: 'node'; id: string } | { kind: 'commune'; i: number } | { kind: 'landmark'; id: string } | { kind: 'incident'; id: string } | { kind: 'corridor'; id: string } | { kind: 'spot'; id: string } | null;
type LayerKey = 'traffic' | 'communes' | 'landmarks' | 'incidents';

const PALETTE = {
  day: { land: '#F2EADB', land2: '#ECE2CF', brazza: '#E4DCCB', water: '#8FCBEA', waterDeep: '#6DB7E0', bank: '#F8F3E8', hill: '#CFE0B4', hill2: '#BCD39C', border: '#CDBB98', label: '#6B5A43', road: '#FFFFFF', casing: '#D9CBB0', minor: '#FFFFFF', grid: '#E2D5BC', text: '#3D3426' },
  night: { land: '#1A2433', land2: '#1D293A', brazza: '#141C28', water: '#0D2A45', waterDeep: '#0A2238', bank: '#24324A', hill: '#1E3324', hill2: '#203A27', border: '#2E3F57', label: '#8EA8BD', road: '#3A4B63', casing: '#0E1622', minor: '#2C3B52', grid: '#223047', text: '#D8E3EE' },
};

function kinHour() {
  return (new Date().getUTCHours() + 1) % 24;
}

export default function KinshasaCityMap({
  nodes, selectedId, onSelect, onOpenDetails, raining = false, timeLabel, className,
}: {
  nodes: CityMapNode[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onOpenDetails?: (id: string) => void;
  raining?: boolean;
  timeLabel?: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const carsRef = useRef<SVGGElement>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [sel, setSel] = useState<Sel>(null);
  const [full, setFull] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ traffic: true, communes: true, landmarks: true, incidents: true });
  const [hour, setHour] = useState<number | null>(null);
  const [nightOverride, setNightOverride] = useState<boolean | null>(null);
  const dragged = useRef(false);

  useEffect(() => { setHour(kinHour()); const t = setInterval(() => setHour(kinHour()), 60_000); return () => clearInterval(t); }, []);
  const night = nightOverride ?? (hour !== null && (hour >= 19 || hour < 6));
  const C = night ? PALETTE.night : PALETTE.day;

  // Sélection pilotée par la page (liste des carrefours en dessous).
  useEffect(() => { if (selectedId) setSel({ kind: 'node', id: selectedId }); }, [selectedId]);

  // ── Géométrie mémorisée
  const geo = useMemo(() => {
    const sites = COMMUNES.map(c => [X(c.c[1]), Y(c.c[0])] as P);
    const cells = voronoi(sites);
    const bank = proj(KIN_BANK);
    const water = smooth(bank) + `L${W + 20},${bank[bank.length - 1][1]}L${W + 20},-20L-20,-20L-20,${bank[0][1]}Z`;
    return {
      sites, cells,
      water,
      bankLine: smooth(bank),
      brazza: smooth(proj(BRAZZA)) + `L-20,${Y(-4.330)}L-20,-20L${X(15.330)},-20Z`,
      mbamu: smooth(proj(MBAMU)) + 'Z',
      sandbanks: SANDBANKS.map(s => smooth(proj(s)) + 'Z'),
      rivers: RIVERS.map(r => ({ ...r, d: smooth(proj(r.pts)) })),
      roads: ROADS.map(r => ({ ...r, d: smooth(proj(r.points)) })),
      minor: MINOR_ROADS.map(r => ({ ...r, d: smooth(proj(r.pts)) })),
      corridors: CORRIDORS.filter(c => c.pts).map(c => ({ ...c, d: smooth(proj(c.pts!)) })),
    };
  }, []);

  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);
  const roadLevel = useCallback((nodeId: string | null): MapLevel => (nodeId ? byId[nodeId]?.level ?? 'none' : 'none'), [byId]);

  /** Un axe de la liste : sa géométrie (propre ou celle d'un grand axe mesuré) et son état réel. */
  const corridorInfo = useCallback((c: Corridor) => {
    const base = c.sameAs ? CORRIDORS.find(o => o.id === c.sameAs) ?? c : c;
    const road = base.roadId ? ROADS.find(r => r.id === base.roadId) : undefined;
    const node = road?.nodeId ? byId[road.nodeId] : undefined;
    const pts = (road ? road.points : base.pts) ?? [];
    return { base, road, node, level: (node?.level ?? 'none') as MapLevel, pts: proj(pts as LatLng[]) };
  }, [byId]);

  /** État d'une commune : celui du carrefour mesuré le plus proche, s'il est à moins de ~3,5 km. */
  const communeState = useMemo(() => geo.sites.map(s => {
    let best: CityMapNode | null = null, bd = Infinity;
    for (const n of nodes) {
      if (n.level === 'none') continue;
      const d = Math.hypot(X(n.coords.lng) - s[0], Y(n.coords.lat) - s[1]);
      if (d < bd) { bd = d; best = n; }
    }
    return bd < 150 && best ? { node: best, km: Math.round(bd * 0.024 * 10) / 10 } : null;
  }), [geo.sites, nodes]);

  const incidents = useMemo(() => {
    const seen = new Map<string, NonNullable<CityMapNode['incidents']>[number]>();
    nodes.forEach(n => n.incidents?.forEach(i => { if (i?.coords && !seen.has(i.id)) seen.set(i.id, i); }));
    return Array.from(seen.values());
  }, [nodes]);

  // ── Zoom / déplacement
  const bounds = useCallback((k: number) => {
    const el = wrapRef.current;
    if (!el) return { minX: W - W * k, maxX: 0, minY: H - H * k, maxY: 0 };
    const cw = el.clientWidth, ch = el.clientHeight;
    const s = Math.max(cw / W, ch / H);
    const vw = cw / s, vh = ch / s, ox = (W - vw) / 2, oy = (H - vh) / 2;
    return { minX: ox + vw - W * k, maxX: ox, minY: oy + vh - H * k, maxY: oy };
  }, []);
  const clampView = useCallback((v: { k: number; tx: number; ty: number }) => {
    const k = Math.min(8, Math.max(1, v.k));
    const b = bounds(k);
    return { k, tx: Math.min(b.maxX, Math.max(b.minX, v.tx)), ty: Math.min(b.maxY, Math.max(b.minY, v.ty)) };
  }, [bounds]);
  const toView = (clientX: number, clientY: number): P => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM();
    if (!m) return [W / 2, H / 2];
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const r = pt.matrixTransform(m.inverse());
    return [r.x, r.y];
  };
  const zoomAt = useCallback((p: P, factor: number) => {
    const v = viewRef.current;
    const k = Math.min(8, Math.max(1, v.k * factor));
    setView(clampView({ k, tx: p[0] - ((p[0] - v.tx) * k) / v.k, ty: p[1] - ((p[1] - v.ty) * k) / v.k }));
  }, [clampView]);

  const flyAnim = useRef<{ stop: () => void } | null>(null);
  const flyTo = useCallback((wx: number, wy: number, k: number) => {
    flyAnim.current?.stop();
    const from = viewRef.current;
    const b = bounds(k);
    const cx = (b.maxX + (b.minX + W * k)) / 2; // centre visible en coordonnées viewBox
    const cy = (b.maxY + (b.minY + H * k)) / 2;
    const to = clampView({ k, tx: cx - wx * k, ty: cy - wy * k });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setView(to); return; }
    flyAnim.current = animate(0, 1, {
      duration: 0.9, ease: [0.22, 1, 0.36, 1],
      onUpdate: t => {
        const k1 = from.k * Math.pow(to.k / from.k, t);
        // centre interpolé linéairement en coordonnées monde
        const fcx = (cx - from.tx) / from.k, fcy = (cy - from.ty) / from.k;
        const wcx = fcx + (wx - fcx) * t, wcy = fcy + (wy - fcy) * t;
        setView(clampView({ k: k1, tx: cx - wcx * k1, ty: cy - wcy * k1 }));
      },
    });
  }, [bounds, clampView]);

  const resetView = () => { flyAnim.current?.stop(); setView(clampView({ k: 1, tx: 0, ty: 0 })); };

  // Molette (non passive pour bloquer le défilement de la page au-dessus de la carte)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      flyAnim.current?.stop();
      zoomAt(toView(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.0018));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Glisser + pincer (Pointer Events)
  const pointers = useRef(new Map<number, P>());
  const pinch = useRef<{ d: number; k: number; mid: P; tx: number; ty: number } | null>(null);
  const downAt = useRef<P>([0, 0]);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-ui]')) return;
    // Pas de capture ici : sinon le « click » part sur la carte et jamais sur le carrefour touché.
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    downAt.current = [e.clientX, e.clientY];
    dragged.current = false;
    flyAnim.current?.stop();
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const v = viewRef.current;
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: v.k, mid: toView((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), tx: v.tx, ty: v.ty };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values());
      const pc = pinch.current;
      const k = Math.min(8, Math.max(1, pc.k * (Math.hypot(a[0] - b[0], a[1] - b[1]) / pc.d)));
      const mid = toView((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      const wx = (pc.mid[0] - pc.tx) / pc.k, wy = (pc.mid[1] - pc.ty) / pc.k;
      setView(clampView({ k, tx: mid[0] - wx * k, ty: mid[1] - wy * k }));
      dragged.current = true;
      return;
    }
    if (!dragged.current) {
      // Un vrai glissé commence après 4 px : on capture alors le pointeur.
      if (Math.hypot(e.clientX - downAt.current[0], e.clientY - downAt.current[1]) < 4) return;
      dragged.current = true;
      try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    }
    const m = svgRef.current?.getScreenCTM();
    const s = m ? m.a : 1;
    const v = viewRef.current;
    setView(clampView({ k: v.k, tx: v.tx + (e.clientX - prev[0]) / s, ty: v.ty + (e.clientY - prev[1]) / s }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const click = (fn: () => void) => () => { if (!dragged.current) fn(); };

  // Garde la vue valide quand la taille change (plein écran, rotation)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView(v => clampView(v)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampView, full]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [full]);

  // ── Voitures animées (une boucle pour toute la ville)
  useEffect(() => {
    const svg = svgRef.current, layer = carsRef.current;
    if (!svg || !layer) return;
    layer.replaceChildren();
    if (!layers.traffic) return;
    type Car = { el: SVGUseElement; p: SVGPathElement; L: number; o: number; sp: number; dir: 1 | -1; ph: number; lvl: MapLevel };
    const cars: Car[] = [];
    const NS = 'http://www.w3.org/2000/svg';
    const SPEED: Record<MapLevel, number> = { ok: 22, mod: 12, dense: 5, block: 1.4, none: 0 };
    const GAP: Record<MapLevel, number> = { ok: 34, mod: 22, dense: 12, block: 8, none: 999 };
    const kinds = ['kf-car-taxi', 'kf-car-white', 'kf-car-207', 'kf-car-dark', 'kf-car-taxi', 'kf-car-white', 'kf-car-red'];
    geo.roads.forEach(r => {
      const lvl = roadLevel(r.nodeId);
      if (lvl === 'none') return;
      const p = svg.querySelector<SVGPathElement>(`#kfm-road-${r.id}`);
      if (!p) return;
      const L = p.getTotalLength();
      ([1, -1] as const).forEach(dir => {
        const n = Math.max(2, Math.round(L / GAP[lvl]));
        for (let i = 0; i < n; i++) {
          const el = document.createElementNS(NS, 'use');
          el.setAttribute('href', `#${kinds[(i * 3 + (dir > 0 ? 0 : 1) + r.id.length) % kinds.length]}${lvl === 'dense' || lvl === 'block' ? '-brake' : ''}`);
          layer.appendChild(el);
          cars.push({ el, p, L, o: (i / n) * L + (dir < 0 ? GAP[lvl] / 2 : 0) + Math.random() * 3, sp: SPEED[lvl] * (0.85 + Math.random() * 0.3), dir, ph: Math.random() * 6, lvl });
        }
      });
    });
    const place = (t: number) => {
      for (const c of cars) {
        // bouchon : avance par à-coups (onde stop-and-go)
        const crawl = c.lvl === 'block' || c.lvl === 'dense' ? Math.max(0, Math.sin(t * 0.9 + c.ph)) * 1.6 : 1;
        let s = (c.o + c.dir * t * c.sp * crawl) % c.L;
        if (s < 0) s += c.L;
        const a = c.p.getPointAtLength(s), b = c.p.getPointAtLength(Math.min(c.L, s + 0.8));
        let ang = Math.atan2(b.y - a.y, b.x - a.x);
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        const off = c.dir > 0 ? 1.7 : -1.7;
        if (c.dir < 0) ang += Math.PI;
        c.el.setAttribute('transform', `translate(${(a.x + nx * off).toFixed(2)} ${(a.y + ny * off).toFixed(2)}) rotate(${(ang * 57.2958).toFixed(1)})`);
      }
    };
    // L'onde « crawl » utilise un temps intégré pour éviter les sauts.
    let raf = 0, last = 0, t = 0, running = false;
    const acc = new Map<Car, number>();
    const step = (now: number) => {
      if (!running) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now; t += dt;
      for (const c of cars) {
        const crawl = c.lvl === 'block' || c.lvl === 'dense' ? Math.max(0, Math.sin(t * 0.9 + c.ph)) * 1.6 : 1;
        acc.set(c, (acc.get(c) ?? 0) + dt * c.sp * crawl);
      }
      for (const c of cars) {
        let s = (c.o + c.dir * (acc.get(c) ?? 0)) % c.L;
        if (s < 0) s += c.L;
        const a = c.p.getPointAtLength(s), b = c.p.getPointAtLength(Math.min(c.L, s + 0.8));
        let ang = Math.atan2(b.y - a.y, b.x - a.x);
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        const off = c.dir > 0 ? 1.7 : -1.7;
        if (c.dir < 0) ang += Math.PI;
        c.el.setAttribute('transform', `translate(${(a.x + nx * off).toFixed(2)} ${(a.y + ny * off).toFixed(2)}) rotate(${(ang * 57.2958).toFixed(1)})`);
      }
      raf = requestAnimationFrame(step);
    };
    place(0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = () => { if (running) return; running = true; last = 0; raf = requestAnimationFrame(step); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    let vis = true;
    const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; vis && !document.hidden ? start() : stop(); });
    io.observe(svg);
    const onVis = () => (vis && !document.hidden ? start() : stop());
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [geo.roads, roadLevel, layers.traffic]);

  // ── Rendu
  const { k, tx, ty } = view;
  const inv = 1 / k; // garde les marqueurs à taille d'écran constante
  const ui = Math.pow(k, -0.75);
  const showDetail = k >= 2.2;
  const showRoadNames = k >= 2.6;

  const selNode = sel?.kind === 'node' ? byId[sel.id] : null;
  const selCommune = sel?.kind === 'commune' ? sel.i : null;
  const selLandmark = sel?.kind === 'landmark' ? LANDMARKS.find(l => l.id === sel.id) : null;
  const selIncident = sel?.kind === 'incident' ? incidents.find(i => i.id === sel.id) : null;

  const pickNode = (n: CityMapNode) => {
    setSel({ kind: 'node', id: n.id });
    onSelect?.(n.id);
    flyTo(X(n.coords.lng), Y(n.coords.lat), Math.max(3.2, viewRef.current.k));
  };
  const pickCommune = (i: number) => {
    setSel({ kind: 'commune', i });
    onSelect?.(null);
    flyTo(geo.sites[i][0], geo.sites[i][1], Math.max(2.4, viewRef.current.k));
  };
  const closeSel = () => { setSel(null); onSelect?.(null); };
  const selCorridor = sel?.kind === 'corridor' ? CORRIDORS.find(c => c.id === sel.id) ?? null : null;
  const selCorridorInfo = selCorridor ? corridorInfo(selCorridor) : null;
  const selSpot = sel?.kind === 'spot' ? BLACK_SPOTS.find(b => b.id === sel.id) ?? null : null;
  const pickCorridor = (c: Corridor) => {
    const info = corridorInfo(c);
    setSel({ kind: 'corridor', id: c.id });
    setListOpen(false);
    onSelect?.(null);
    if (!info.pts.length) return;
    const xs = info.pts.map(p => p[0]), ys = info.pts.map(p => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    const kk = Math.max(1.6, Math.min(4.5, Math.min((W * 0.55) / Math.max(bw, 1), (H * 0.55) / Math.max(bh, 1))));
    flyTo((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, kk);
  };
  const pickSpot = (id: string) => {
    const b = BLACK_SPOTS.find(x => x.id === id)!;
    setSel({ kind: 'spot', id });
    onSelect?.(null);
    flyTo(X(b.c[1]), Y(b.c[0]), Math.max(3.2, viewRef.current.k));
  };

  const ticker = nodes.filter(n => n.level !== 'none');

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative overflow-hidden select-none touch-none outline-none',
        full ? 'fixed inset-0 z-[90] rounded-none' : 'rounded-2xl border border-[#22425C] aspect-square sm:aspect-[1200/780] max-h-[78vh] w-full',
        className,
      )}
      style={{ background: C.water }}
      tabIndex={0}
      aria-label="Carte interactive du trafic de Kinshasa. Plus et moins pour zoomer, flèches pour se déplacer."
      onKeyDown={e => {
        const v = viewRef.current;
        if (e.key === '+' || e.key === '=') zoomAt([W / 2, H / 2], 1.4);
        else if (e.key === '-') zoomAt([W / 2, H / 2], 1 / 1.4);
        else if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          const d = 60;
          setView(clampView({ k: v.k, tx: v.tx + (e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0), ty: v.ty + (e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0) }));
        }
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className={cn('absolute inset-0 h-full w-full', dragged.current ? 'cursor-grabbing' : 'cursor-grab')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={e => zoomAt(toView(e.clientX, e.clientY), 2)}
        role="img"
        aria-label="Carte illustrée de Kinshasa"
      >
        <defs>
          <pattern id="kfm-grid" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(14)">
            <path d="M0 0 L7 0 M0 0 L0 7" stroke={C.grid} strokeWidth="0.6" />
          </pattern>
          <pattern id="kfm-grid2" width="6" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-22)">
            <path d="M0 0 L6 0 M0 0 L0 9" stroke={C.grid} strokeWidth="0.6" />
          </pattern>
          <pattern id="kfm-brazza" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill={C.brazza} />
            <path d="M0 0 L0 10" stroke={C.border} strokeWidth="1" opacity={0.5} />
          </pattern>
          <radialGradient id="kfm-glow">
            <stop offset="0" stopColor="#fff" stopOpacity={0.9} />
            <stop offset="1" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
          <filter id="kfm-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
          <filter id="kfm-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodOpacity="0.35" /></filter>
          {/* voitures vues du dessus (5,6 × 2,8 unités) */}
          {([['taxi', '#FACC15'], ['white', '#F8FAFC'], ['dark', '#334155'], ['red', '#DC2626']] as const).map(([id, col]) => (
            [false, true].map(br => (
              <g key={`${id}${br}`} id={`kf-car-${id}${br ? '-brake' : ''}`}>
                <rect x={-2.8} y={-1.4} width={5.6} height={2.8} rx={0.9} fill={col} stroke="#0B1118" strokeWidth={0.35} />
                <rect x={0.4} y={-1.05} width={1.3} height={2.1} rx={0.4} fill="#1E293B" />
                <rect x={-2.1} y={-1.05} width={0.9} height={2.1} rx={0.3} fill="#1E293B" opacity={0.8} />
                {br && <><rect x={-2.95} y={-1.3} width={0.5} height={0.8} fill="#FF2D2D" /><rect x={-2.95} y={0.5} width={0.5} height={0.8} fill="#FF2D2D" /></>}
                {night && <path d="M2.8 -1 L7 -2.2 L7 2.2 L2.8 1 Z" fill="#FFF3C4" opacity={0.35} />}
              </g>
            ))
          ))}
          {[false, true].map(br => (
            <g key={`207${br}`} id={`kf-car-207${br ? '-brake' : ''}`}>
              <rect x={-4} y={-1.6} width={8} height={3.2} rx={0.7} fill="#FACC15" stroke="#0B1118" strokeWidth={0.35} />
              <rect x={-4} y={-0.35} width={8} height={0.7} fill="#1D4ED8" />
              <rect x={1.6} y={-1.25} width={1.4} height={2.5} rx={0.4} fill="#1E293B" />
              {br && <><rect x={-4.15} y={-1.5} width={0.5} height={0.9} fill="#FF2D2D" /><rect x={-4.15} y={0.6} width={0.5} height={0.9} fill="#FF2D2D" /></>}
            </g>
          ))}
          <g id="kfm-plane">
            <path d="M0 -1 L9 -0.8 Q11 0 9 0.8 L0 1 L-5 1 L-7 3.2 L-8.4 3.2 L-7.4 0.9 L-9 0.8 Q-10 0 -9 -0.8 L-7.4 -0.9 L-8.4 -3.2 L-7 -3.2 L-5 -1 Z" fill="#F8FAFC" stroke="#0B1118" strokeWidth={0.3} />
            <path d="M1 -0.9 L-3 -8 L-5 -8 L-3 -0.9 Z M1 0.9 L-3 8 L-5 8 L-3 0.9 Z" fill="#E2E8F0" stroke="#0B1118" strokeWidth={0.3} />
          </g>
          <g id="kfm-boat">
            <path d="M-6 0 L6 0 L4 2.4 L-4 2.4 Z" fill="#7C2D12" />
            <rect x={-2.5} y={-2.2} width={5} height={2.2} fill="#F8FAFC" />
          </g>
          <g id="kfm-pirogue"><path d="M-5 0 Q0 2 5 0 Q0 1 -5 0 Z" fill="#78350F" stroke="#451A03" strokeWidth={0.4} /><circle cx={0.5} cy={-0.8} r={0.7} fill="#4E2C17" /></g>
        </defs>

        <g transform={`translate(${tx} ${ty}) scale(${k})`}>
          {/* terre */}
          <rect x={-20} y={-20} width={W + 40} height={H + 40} fill={C.land} />

          {/* communes */}
          {geo.cells.map((cell, i) => {
            const st = communeState[i];
            const active = selCommune === i;
            return (
              <g key={COMMUNES[i].name} onClick={click(() => pickCommune(i))} className="cursor-pointer">
                <path d={line(cell) + 'Z'} fill={i % 2 ? C.land : C.land2} />
                <path d={line(cell) + 'Z'} fill={`url(#${i % 3 ? 'kfm-grid' : 'kfm-grid2'})`} opacity={Math.min(1, Math.max(0, (k - 1.4) / 1.4))} />
                {layers.communes && st && (
                  <path d={line(cell) + 'Z'} fill={LEVEL_COLOR[st.node.level]} opacity={night ? 0.16 : 0.13} />
                )}
                <path d={line(cell) + 'Z'} fill="none" stroke={active ? '#FFD23F' : C.border} strokeWidth={(active ? 3 : 1.2) * inv} strokeDasharray={active ? undefined : `${5 * inv} ${4 * inv}`} />
              </g>
            );
          })}

          {/* collines */}
          {HILLS.map((h, i) => (
            <g key={i} transform={`translate(${X(h.c[1])} ${Y(h.c[0])})`} pointerEvents="none">
              <ellipse rx={h.rx} ry={h.ry} fill={C.hill} opacity={0.75} />
              <ellipse rx={h.rx * 0.68} ry={h.ry * 0.62} fill={C.hill2} opacity={0.75} />
              <ellipse rx={h.rx * 0.36} ry={h.ry * 0.3} fill={C.hill2} opacity={0.9} />
            </g>
          ))}

          {/* rivières */}
          {geo.rivers.map(r => (
            <g key={r.name} pointerEvents="none">
              <path d={r.d} fill="none" stroke={C.water} strokeWidth={4} strokeLinecap="round" />
              {showRoadNames && (
                <text fontSize={9 * inv * 1.6} fill={night ? '#7FB6DA' : '#2A7AB0'} fontStyle="italic" fontWeight={700} dy={-4 * inv}>
                  <textPath href={`#kfm-river-${r.name.length}`} startOffset="30%">{r.name}</textPath>
                </text>
              )}
              <path id={`kfm-river-${r.name.length}`} d={r.d} fill="none" stroke="none" />
            </g>
          ))}

          {/* fleuve, Pool Malebo, Brazzaville */}
          <path d={geo.water} fill={C.water} pointerEvents="none" />
          <path d={geo.bankLine} fill="none" stroke={C.bank} strokeWidth={3} pointerEvents="none" />
          <path d={geo.bankLine} fill="none" stroke="#fff" strokeOpacity={night ? 0.15 : 0.5} strokeWidth={1.2} strokeDasharray="6 10" transform="translate(0 -7)" className="kf-ripple" pointerEvents="none" />
          <path d={geo.bankLine} fill="none" stroke="#fff" strokeOpacity={night ? 0.1 : 0.35} strokeWidth={1} strokeDasharray="4 14" transform="translate(0 -16)" className="kf-ripple" style={{ animationDuration: '5s' }} pointerEvents="none" />
          <path d={geo.brazza} fill="url(#kfm-brazza)" stroke={C.bank} strokeWidth={2} pointerEvents="none" />
          <path d={geo.mbamu} fill={C.hill} stroke={C.bank} strokeWidth={2} pointerEvents="none" />
          {geo.sandbanks.map(d => <path key={d} d={d} fill={night ? '#3A4A5E' : '#EADFC4'} pointerEvents="none" />)}
          <g pointerEvents="none" fontWeight={800} textAnchor="middle">
            <text x={X(15.262)} y={Y(-4.283)} fontSize={15 * Math.max(inv, 0.4)} fill={C.label} letterSpacing={2}>BRAZZAVILLE</text>
            <text x={X(15.262)} y={Y(-4.283) + 14 * Math.max(inv, 0.4)} fontSize={9 * Math.max(inv, 0.4)} fill={C.label} fontWeight={600}>République du Congo</text>
            <text x={X(15.43)} y={Y(-4.292)} fontSize={16 * Math.max(inv, 0.45)} fill={night ? '#5E9BC4' : '#2A7AB0'} fontStyle="italic" letterSpacing={3}>POOL MALEBO</text>
            <text x={X(15.33)} y={Y(-4.284)} fontSize={12 * Math.max(inv, 0.45)} fill={night ? '#5E9BC4' : '#2A7AB0'} fontStyle="italic" letterSpacing={2}>Fleuve Congo</text>
            <text x={X(15.415)} y={Y(-4.266)} fontSize={9 * Math.max(inv, 0.4)} fill={C.label} fontWeight={600}>Île Mbamu</text>
          </g>

          {/* bac Kinshasa ⇄ Brazzaville, pirogues */}
          <g pointerEvents="none">
            <path id="kfm-ferry" d={`M${X(15.3150)},${Y(-4.2995)} Q${X(15.309)},${Y(-4.287)} ${X(15.300)},${Y(-4.2775)}`} fill="none" stroke={C.bank} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.7} />
            <use href="#kfm-boat">
              <animateMotion dur="40s" repeatCount="indefinite" rotate="auto" keyPoints="0;1;1;0;0" keyTimes="0;0.4;0.5;0.9;1" calcMode="linear">
                <mpath href="#kfm-ferry" />
              </animateMotion>
            </use>
            {[[`M${X(15.36)},${Y(-4.278)} q60 -6 140 4`, '52s'], [`M${X(15.44)},${Y(-4.300)} q-70 8 -150 -2`, '64s'], [`M${X(15.24)},${Y(-4.317)} q40 -8 90 -20`, '46s']].map(([d, dur], i) => (
              <g key={i}>
                <path id={`kfm-pir-${i}`} d={d} fill="none" />
                <use href="#kfm-pirogue">
                  <animateMotion dur={dur} repeatCount="indefinite" rotate="auto" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear"><mpath href={`#kfm-pir-${i}`} /></animateMotion>
                </use>
              </g>
            ))}
          </g>

          {/* aéroport de N'djili : piste + avions */}
          <g transform={`translate(${X(15.4446)} ${Y(-4.3858)}) rotate(-28)`} pointerEvents="none">
            <rect x={-92} y={-9} width={184} height={18} rx={3} fill={night ? '#2C3B52' : '#D7CDB9'} />
            <rect x={-80} y={-3.2} width={160} height={6.4} fill={night ? '#475569' : '#64748B'} />
            <path d="M-76 0 L76 0" stroke="#F8FAFC" strokeWidth={0.8} strokeDasharray="6 5" />
            {night && Array.from({ length: 12 }, (_, i) => <circle key={i} cx={-78 + i * 14} cy={-4.5} r={0.9} fill="#FDE68A" className="kf-beam" style={{ animationDelay: `${i * 0.1}s` }} />)}
            <path id="kfm-runway" d="M-76 0 L60 0 Q110 0 180 -40" fill="none" />
            <use href="#kfm-plane">
              <animateMotion dur="18s" repeatCount="indefinite" rotate="auto" keyPoints="0;0;1;1" keyTimes="0;0.35;0.75;1" calcMode="linear"><mpath href="#kfm-runway" /></animateMotion>
              <animate attributeName="opacity" values="1;1;1;0;0" keyTimes="0;0.35;0.72;0.75;1" dur="18s" repeatCount="indefinite" />
            </use>
          </g>

          {/* routes secondaires */}
          {geo.minor.map(r => (
            <g key={r.id} pointerEvents="none">
              <path d={r.d} fill="none" stroke={C.casing} strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" />
              <path id={`kfm-minor-${r.id}`} d={r.d} fill="none" stroke={C.minor} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
              {showRoadNames && (
                <text fontSize={6.5} fill={C.label} fontWeight={700} dy={-3}>
                  <textPath href={`#kfm-minor-${r.id}`} startOffset="20%">{r.label}</textPath>
                </text>
              )}
            </g>
          ))}

          {/* les 20 axes chargés (tracés propres, pas encore mesurés en direct) */}
          {geo.corridors.map(c => {
            const hi = selCorridor && (selCorridor.id === c.id || selCorridor.sameAs === c.id);
            return (
              <g key={c.id} onClick={click(() => pickCorridor(c))} className="cursor-pointer">
                {hi && <path d={c.d} fill="none" stroke="#FFD23F" strokeWidth={14} strokeLinecap="round" opacity={0.5} />}
                <path d={c.d} fill="none" stroke="transparent" strokeWidth={14} />
                <path d={c.d} fill="none" stroke={C.casing} strokeWidth={6.6} strokeLinecap="round" strokeLinejoin="round" />
                <path id={`kfm-cor-${c.id}`} d={c.d} fill="none" stroke={C.road} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
                <path d={c.d} fill="none" stroke={LEVEL_COLOR.none} strokeWidth={1.6} strokeDasharray="3 4" opacity={0.7} pointerEvents="none" />
                <title>{`${c.name} : pas encore mesuré en direct`}</title>
                {k >= 2 && (
                  <text fontSize={6.8} fill={C.text} fontWeight={800} dy={-5} pointerEvents="none" stroke={C.land} strokeWidth={2} paintOrder="stroke">
                    <textPath href={`#kfm-cor-${c.id}`} startOffset="10%">{c.name}</textPath>
                  </text>
                )}
              </g>
            );
          })}

          {/* grands axes */}
          {geo.roads.map(r => {
            const lvl = layers.traffic ? roadLevel(r.nodeId) : 'none';
            const hi = (selNode && r.nodeId === selNode.id) || (selCorridorInfo?.road?.id === r.id);
            return (
              <g key={r.id}>
                {hi && <path d={r.d} fill="none" stroke="#FFD23F" strokeWidth={16} strokeLinecap="round" opacity={0.45} />}
                <path d={r.d} fill="none" stroke={C.casing} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
                <path d={r.d} fill="none" stroke={C.road} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                <path
                  id={`kfm-road-${r.id}`} d={r.d} fill="none" stroke={LEVEL_COLOR[lvl]}
                  strokeWidth={lvl === 'none' ? 2 : 4.5} strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray={lvl === 'none' ? '4 5' : undefined} opacity={lvl === 'none' ? 0.6 : 0.95}
                  onClick={click(() => { const n = r.nodeId ? byId[r.nodeId] : null; if (n) pickNode(n); })}
                  className={r.nodeId ? 'cursor-pointer' : undefined}
                >
                  <title>{`${r.label} : ${LEVEL_LABEL[lvl]}`}</title>
                </path>
                {showRoadNames && (
                  <text fontSize={7} fill={C.text} fontWeight={800} dy={-6} pointerEvents="none" stroke={C.land} strokeWidth={2} paintOrder="stroke">
                    <textPath href={`#kfm-road-${r.id}`} startOffset="12%">{r.label}</textPath>
                  </text>
                )}
              </g>
            );
          })}

          {/* voitures */}
          <g ref={carsRef} pointerEvents="none" />

          {/* noms des communes */}
          {layers.communes && geo.sites.map((s, i) => (
            <text
              key={COMMUNES[i].name} x={s[0]} y={s[1]} textAnchor="middle" pointerEvents="none"
              fontSize={(COMMUNES[i].name === 'Gombe' || COMMUNES[i].name === 'Limete' ? 12.5 : 11) * Math.pow(k, -0.6)}
              fontWeight={900} letterSpacing={1.2 * Math.pow(k, -0.6)} fill={C.label} stroke={C.land} strokeWidth={3 * Math.pow(k, -0.6)} paintOrder="stroke"
              opacity={k > 4.5 ? 0.35 : 0.9}
            >
              {COMMUNES[i].name.toUpperCase()}
            </text>
          ))}

          {/* repères */}
          {layers.landmarks && LANDMARKS.map(l => {
            const x = X(l.c[1]), y = Y(l.c[0]);
            return (
              <g key={l.id} transform={`translate(${x} ${y}) scale(${ui})`} onClick={click(() => { setSel({ kind: 'landmark', id: l.id }); flyTo(x, y, Math.max(3, k)); })} className="cursor-pointer" filter="url(#kfm-shadow)">
                <circle r={12} fill="#fff" stroke={l.color} strokeWidth={2.2} />
                <LandmarkGlyph icon={l.icon} color={l.color} />
                {(showDetail || sel?.kind === 'landmark' && sel.id === l.id) && (
                  <text y={24} textAnchor="middle" fontSize={10} fontWeight={800} fill={C.text} stroke={night ? '#0B1118' : '#fff'} strokeWidth={3} paintOrder="stroke">{l.name}</text>
                )}
              </g>
            );
          })}

          {/* signalements des usagers */}
          {layers.incidents && incidents.map(inc => {
            const st = INCIDENT_STYLE[inc.type || ''] ?? { label: 'Signalement', color: '#F59E0B', glyph: '!' };
            const x = X(inc.coords.lng), y = Y(inc.coords.lat);
            return (
              <g key={inc.id} transform={`translate(${x} ${y}) scale(${ui})`} onClick={click(() => { setSel({ kind: 'incident', id: inc.id }); flyTo(x, y, Math.max(3.5, k)); })} className="cursor-pointer">
                <circle r={9} fill={st.color} opacity={0.25}>
                  <animate attributeName="r" values="9;18;9" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values=".35;0;.35" dur="2s" repeatCount="indefinite" />
                </circle>
                <path d="M0 -12 L11 8 L-11 8 Z" fill={st.color} stroke="#fff" strokeWidth={2} strokeLinejoin="round" filter="url(#kfm-shadow)" />
                <text y={5.5} textAnchor="middle" fontSize={10} fontWeight={900} fill="#fff">{st.glyph}</text>
              </g>
            );
          })}

          {/* points noirs connus */}
          {BLACK_SPOTS.map(b => {
            const x = X(b.c[1]), y = Y(b.c[0]);
            const measured = !!(b.nodeId && byId[b.nodeId]);
            return (
              <g key={b.id} transform={`translate(${x} ${y}) scale(${ui})`} onClick={click(() => pickSpot(b.id))} className="cursor-pointer">
                <circle r={26} fill="none" stroke="#F59E0B" strokeWidth={2.5} strokeDasharray="6 5">
                  <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite" />
                </circle>
                {!measured && (
                  <g filter="url(#kfm-shadow)">
                    <circle r={13} fill="#0B1622" stroke="#F59E0B" strokeWidth={3} />
                    <text y={5} textAnchor="middle" fontSize={15} fontWeight={900} fill="#F59E0B">!</text>
                  </g>
                )}
                {(k >= 1.5 || !measured) && (
                  <g transform={`translate(0 ${measured ? -40 : -36})`}>
                    <rect x={-34} y={-9} width={68} height={16} rx={8} fill="#F59E0B" />
                    <text y={3} textAnchor="middle" fontSize={8.5} fontWeight={900} fill="#0B1622" letterSpacing={0.8}>POINT NOIR</text>
                  </g>
                )}
                {!measured && k >= 1.7 && (
                  <text y={30} textAnchor="middle" fontSize={10} fontWeight={800} fill={C.text} stroke={night ? '#0B1118' : '#fff'} strokeWidth={3} paintOrder="stroke">{b.name}</text>
                )}
              </g>
            );
          })}

          {/* carrefours mesurés */}
          {nodes.map(n => {
            const x = X(n.coords.lng), y = Y(n.coords.lat);
            const color = LEVEL_COLOR[n.level];
            const isSel = selNode?.id === n.id;
            const delay = typeof n.delayMin === 'number' && n.delayMin > 0 ? `+${Math.round(n.delayMin)} min` : n.level === 'ok' ? 'fluide' : null;
            const showLabel = isSel || k >= 1.7;
            const short = n.name.replace(/\s*\(.*\)/, '');
            const labelW = Math.max(52, short.length * 6.4 + (delay ? delay.length * 6.2 + 16 : 0) + 22);
            return (
              <g
                key={n.id} transform={`translate(${x} ${y}) scale(${ui})`} role="button" tabIndex={0}
                aria-label={`${n.name}, ${LEVEL_LABEL[n.level]}${delay ? `, ${delay}` : ''}`}
                className="cursor-pointer outline-none" onClick={click(() => pickNode(n))}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickNode(n); } }}
              >
                {(n.level === 'block' || n.level === 'dense') && (
                  <circle r={14} fill={color} opacity={0.3}>
                    <animate attributeName="r" values="14;30;14" dur={n.level === 'block' ? '1.4s' : '2.2s'} repeatCount="indefinite" />
                    <animate attributeName="opacity" values=".4;0;.4" dur={n.level === 'block' ? '1.4s' : '2.2s'} repeatCount="indefinite" />
                  </circle>
                )}
                {isSel && <circle r={20} fill="none" stroke="#FFD23F" strokeWidth={3} />}
                <g filter="url(#kfm-shadow)">
                  <circle r={14} fill="#0B1622" stroke={color} strokeWidth={3.5} />
                  {/* pictogramme : voitures en file */}
                  <rect x={-8} y={-3.2} width={7} height={6.4} rx={1.6} fill={color} />
                  <rect x={1} y={-3.2} width={7} height={6.4} rx={1.6} fill={color} opacity={0.75} />
                  {n.isLive && <circle cx={10} cy={-10} r={4} fill="#22C55E" stroke="#0B1622" strokeWidth={1.5}><animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite" /></circle>}
                </g>
                {showLabel && (
                  <g transform="translate(20 -11)" filter="url(#kfm-shadow)">
                    <rect width={labelW} height={22} rx={11} fill="#0B1622" opacity={0.92} />
                    <text x={10} y={15} fontSize={10.5} fontWeight={800} fill="#F8FAFC">{short}</text>
                    {delay && (
                      <text x={labelW - 10} y={15} fontSize={10.5} fontWeight={900} textAnchor="end" fill={color}>{delay}</text>
                    )}
                  </g>
                )}
              </g>
            );
          })}

          {/* nuages qui passent (de jour) */}
          {!night && (
            <g pointerEvents="none" opacity={Math.max(0, 0.5 - (k - 1) * 0.2)}>
              {[[180, 0.32, 70], [520, 0.62, 95], [860, 0.18, 80]].map(([cx, cy, dur], i) => (
                <ellipse key={i} cx={0} cy={H * (cy as number)} rx={150} ry={46} fill="#fff" filter="url(#kfm-soft)">
                  <animateTransform attributeName="transform" type="translate" from={`${(cx as number) - 600} 0`} to={`${(cx as number) + 1000} 0`} dur={`${dur}s`} repeatCount="indefinite" />
                </ellipse>
              ))}
            </g>
          )}
        </g>
      </svg>

      {raining && <div className="pointer-events-none absolute inset-0 kf-rain opacity-70" />}
      {night && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(5,10,20,.45))]" />}

      {/* ── En-tête de carte : heure, météo, direct */}
      <div data-ui className="absolute left-2 top-2 sm:left-3 sm:top-3 flex flex-wrap items-center gap-1.5 max-w-[70%]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0B1622]/90 text-white px-2.5 py-1 text-[11px] font-black backdrop-blur">
          <Radio className="h-3 w-3 text-red-400 animate-pulse" />DIRECT
          {timeLabel && <span className="font-semibold text-white/60">· {timeLabel}</span>}
        </span>
        <button type="button" onClick={() => setNightOverride(v => !(v ?? night))} className="inline-flex items-center gap-1 rounded-full bg-[#0B1622]/90 text-white px-2.5 py-1 text-[11px] font-bold backdrop-blur hover:bg-[#0B1622]" aria-label={night ? 'Passer en vue de jour' : 'Passer en vue de nuit'}>
          {night ? <Moon className="h-3 w-3 text-sky-300" /> : <Sun className="h-3 w-3 text-amber-300" />}
          {hour !== null ? `${String(hour).padStart(2, '0')} h à Kin` : 'Kin'}
        </button>
        {raining && <span className="inline-flex items-center gap-1 rounded-full bg-sky-600/90 text-white px-2.5 py-1 text-[11px] font-bold"><CloudRain className="h-3 w-3" />Mbula</span>}
      </div>

      {/* ── Commandes */}
      <div data-ui className="absolute right-2 top-2 sm:right-3 sm:top-3 flex flex-col gap-1.5">
        {[
          { icon: <Plus className="h-4 w-4" />, label: 'Zoomer', on: () => zoomAt([W / 2, H / 2], 1.6) },
          { icon: <Minus className="h-4 w-4" />, label: 'Dézoomer', on: () => zoomAt([W / 2, H / 2], 1 / 1.6) },
          { icon: <LocateFixed className="h-4 w-4" />, label: 'Toute la ville', on: resetView },
          { icon: full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />, label: full ? 'Quitter le plein écran' : 'Plein écran', on: () => setFull(f => !f) },
          { icon: <Route className="h-4 w-4" />, label: 'Les 20 axes', on: () => { setListOpen(o => !o); setLayersOpen(false); } },
          { icon: <Layers className="h-4 w-4" />, label: 'Calques', on: () => { setLayersOpen(o => !o); setListOpen(false); } },
        ].map(b => (
          <button key={b.label} type="button" onClick={b.on} title={b.label} aria-label={b.label}
            className="grid h-9 w-9 place-items-center rounded-xl bg-white/95 text-[#0B1622] shadow-md border border-black/10 hover:bg-[#FFD23F] transition-colors">
            {b.icon}
          </button>
        ))}
        {layersOpen && (
          <div className="absolute right-11 top-0 w-48 rounded-2xl bg-white/97 text-[#0B1622] shadow-xl border border-black/10 p-2 text-xs">
            <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Calques</p>
            {([['traffic', 'Trafic & voitures'], ['incidents', 'Signalements'], ['communes', 'Communes'], ['landmarks', 'Repères']] as Array<[LayerKey, string]>).map(([key, lab]) => (
              <button key={key} type="button" onClick={() => setLayers(l => ({ ...l, [key]: !l[key] }))}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 font-bold hover:bg-slate-100">
                {lab}
                <span className={cn('grid h-4 w-4 place-items-center rounded border', layers[key] ? 'bg-[#0B1622] border-[#0B1622] text-white' : 'border-slate-300')}>
                  {layers[key] && <Check className="h-3 w-3" />}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Liste des 20 axes */}
      {listOpen && (
        <div data-ui className="absolute right-12 sm:right-14 top-2 sm:top-3 bottom-10 w-[min(300px,calc(100%-4rem))] flex flex-col rounded-2xl bg-[#0B1622]/95 text-white shadow-2xl border border-white/10 backdrop-blur overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#7DD3FC]">Axes chargés</p>
              <p className="text-sm font-black">Les 20 axes de Kin</p>
            </div>
            <button type="button" onClick={() => setListOpen(false)} className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Fermer la liste"><XIcon className="h-4 w-4" /></button>
          </div>
          <ol className="flex-1 overflow-y-auto overscroll-contain py-1">
            {CORRIDORS.map(c => {
              const info = corridorInfo(c);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => pickCorridor(c)} className={cn('flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/5', sel?.kind === 'corridor' && sel.id === c.id && 'bg-white/10')}>
                    <span className="w-5 text-[11px] font-black tabular-nums text-white/40">{c.rank}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-bold">{c.name}</span>
                      {c.aliases?.length ? <span className="block truncate text-[10px] text-white/45">{c.aliases.join(' · ')}</span> : null}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-white/70">
                      <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[info.level] }} />
                      {info.node ? LEVEL_LABEL[info.level] : 'Non mesuré'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="border-t border-white/10 px-3 py-2 text-[10px] text-white/50">Liste pratique, pas un classement. Tracés approximatifs pour les axes pas encore mesurés en direct.</p>
        </div>
      )}

      {/* ── Fiche de l'élément choisi */}
      {(selNode || selCommune !== null || selLandmark || selIncident || selCorridor || selSpot) && (
        <div data-ui className="absolute inset-x-2 bottom-10 sm:inset-x-auto sm:left-3 sm:bottom-12 sm:w-[340px] rounded-2xl bg-[#0B1622]/95 text-white shadow-2xl border border-white/10 backdrop-blur p-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button type="button" onClick={closeSel} className="absolute right-2 top-2 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Fermer la fiche"><XIcon className="h-4 w-4" /></button>
          {selNode && <NodeCard n={selNode} onOpen={onOpenDetails} />}
          {selCorridor && selCorridorInfo && (
            <div className="space-y-1.5 pr-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#7DD3FC]">Axe chargé n° {selCorridor.rank}</p>
              <h3 className="font-black text-base leading-tight text-white">{selCorridor.name}</h3>
              {(selCorridor.aliases?.length || selCorridor.sameAs) && (
                <p className="text-[11px] text-white/55">
                  {[...(selCorridor.aliases ?? []), ...(selCorridor.sameAs ? [`même axe que ${selCorridorInfo.base.name}`] : [])].join(' · ')}
                </p>
              )}
              {selCorridorInfo.node ? (
                <>
                  <p className="text-xs text-white/80">
                    Mesuré au carrefour <b>{selCorridorInfo.node.name}</b> :{' '}
                    <span className="font-black" style={{ color: LEVEL_COLOR[selCorridorInfo.level] }}>{LEVEL_LABEL[selCorridorInfo.level].toLowerCase()}</span>
                    {typeof selCorridorInfo.node.delayMin === 'number' && selCorridorInfo.node.delayMin > 0 ? ` (+${Math.round(selCorridorInfo.node.delayMin)} min)` : ''}.
                  </p>
                  <button type="button" onClick={() => pickNode(selCorridorInfo.node!)} className="inline-flex items-center gap-1 text-xs font-black text-[#FFD23F] hover:underline">
                    Voir le carrefour <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <p className="text-xs text-white/65">Pas encore mesuré en direct. Si tu y passes, signale ce que tu vois pour éclairer cet axe.</p>
              )}
              {(selCorridor.note || selCorridorInfo.base.note) && <p className="text-[11px] italic text-amber-200/80">{selCorridor.note || selCorridorInfo.base.note}</p>}
            </div>
          )}
          {selSpot && (() => {
            const n = selSpot.nodeId ? byId[selSpot.nodeId] : undefined;
            return (
              <div className="space-y-1.5 pr-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Point noir connu</p>
                <h3 className="font-black text-base leading-tight text-white">{selSpot.name}</h3>
                {n ? (
                  <>
                    <p className="text-xs text-white/80">
                      État mesuré : <span className="font-black" style={{ color: LEVEL_COLOR[n.level] }}>{LEVEL_LABEL[n.level].toLowerCase()}</span>
                      {typeof n.delayMin === 'number' && n.delayMin > 0 ? ` (+${Math.round(n.delayMin)} min)` : ''}.
                    </p>
                    <button type="button" onClick={() => pickNode(n)} className="inline-flex items-center gap-1 text-xs font-black text-[#FFD23F] hover:underline">
                      Voir le carrefour <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-white/65">Bouchon fréquent, mais pas encore mesuré en direct. Signale l'état quand tu y passes.</p>
                )}
              </div>
            );
          })()}
          {selCommune !== null && <CommuneCard name={COMMUNES[selCommune].name} st={communeState[selCommune]} onPick={pickNode} />}
          {selLandmark && (
            <div className="pr-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#FFD23F]">Repère</p>
              <h3 className="font-black text-base leading-tight text-white">{selLandmark.name}</h3>
              <p className="mt-1 text-xs text-white/60">Point de repère pour s'orienter. L'état du trafic est donné par les carrefours mesurés autour.</p>
            </div>
          )}
          {selIncident && (() => {
            const st = INCIDENT_STYLE[selIncident.type || ''] ?? { label: 'Signalement', color: '#F59E0B', glyph: '!' };
            return (
              <div className="pr-6">
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: st.color }}>Signalé par un Kinois</p>
                <h3 className="font-black text-base leading-tight text-white">{st.label}{selIncident.locationName ? ` · ${selIncident.locationName}` : ''}</h3>
                {selIncident.description && <p className="mt-1 text-sm text-white/80">« {selIncident.description} »</p>}
                {typeof selIncident.ageMin === 'number' && <p className="mt-1 text-[11px] text-white/50">il y a {selIncident.ageMin} min</p>}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Bandeau défilant + légende */}
      <div data-ui className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-[#0B1622]/90 text-white backdrop-blur border-t border-white/10 h-8 overflow-hidden">
        <span className="shrink-0 h-full grid place-items-center bg-[#FFD23F] text-[#0B1622] px-2.5 text-[10px] font-black uppercase tracking-widest">Radio Kin</span>
        <div className="relative flex-1 overflow-hidden">
          {ticker.length > 0 ? (
            <div className="flex w-max kf-marquee">
              {[0, 1].map(c => (
                <div key={c} className="flex shrink-0 items-center gap-6 pr-6 text-[11px] font-semibold whitespace-nowrap">
                  {ticker.map(n => (
                    <span key={n.id} className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[n.level] }} />
                      {n.name.replace(/\s*\(.*\)/, '')} : {LEVEL_LABEL[n.level].toLowerCase()}
                      {typeof n.delayMin === 'number' && n.delayMin > 0 ? ` · +${Math.round(n.delayMin)} min` : ''}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-white/60 px-1">On attend les premières mesures…</span>
          )}
        </div>
        <div className="hidden md:flex shrink-0 items-center gap-2 pr-3 text-[10px] font-semibold text-white/70">
          {(['ok', 'mod', 'dense', 'block', 'none'] as MapLevel[]).map(l => (
            <span key={l} className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-sm" style={{ background: LEVEL_COLOR[l] }} />{LEVEL_LABEL[l]}</span>
          ))}
        </div>
      </div>

      {k === 1 && !sel && (
        <p className="pointer-events-none absolute left-1/2 bottom-10 -translate-x-1/2 rounded-full bg-[#0B1622]/80 text-white/90 px-3 py-1 text-[11px] font-semibold whitespace-nowrap">
          <span className="sm:hidden">Pincez pour zoomer · touchez un carrefour</span>
          <span className="hidden sm:inline">Pincez ou molette pour zoomer · touchez un carrefour ou une commune</span>
        </p>
      )}
    </div>
  );
}

function NodeCard({ n, onOpen }: { n: CityMapNode; onOpen?: (id: string) => void }) {
  const color = LEVEL_COLOR[n.level];
  const live = n.source === 'google' || n.source === 'gps';
  return (
    <div className="space-y-2 pr-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/50">{n.district || 'Carrefour mesuré'}</p>
        <h3 className="font-black text-base leading-tight text-white">{n.name}</h3>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full px-2 py-0.5 text-[11px] font-black text-[#0B1622]" style={{ background: color }}>{LEVEL_LABEL[n.level]}</span>
        {typeof n.speedKmh === 'number' && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">{Math.round(n.speedKmh)} km/h</span>}
        {typeof n.delayMin === 'number' && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">+{Math.round(n.delayMin)} min</span>}
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', live ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300')}>
          {n.source === 'gps' ? 'GPS usagers' : live ? 'Mesuré en direct' : n.source === 'none' ? 'Pas de mesure' : 'Estimation'}
        </span>
      </div>
      {(n.cause || n.typicalCause) && (
        <p className="text-xs text-white/80"><b className="text-white">{n.cause ? 'Cause signalée : ' : 'Cause habituelle : '}</b>{n.cause || n.typicalCause}</p>
      )}
      {n.alt && (n.level === 'dense' || n.level === 'block') && (
        <p className="rounded-xl bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-1.5 text-xs text-emerald-200"><b>Voie bis :</b> {n.alt}</p>
      )}
      {n.lingala && <p className="text-xs italic text-[#FFD23F]">« {n.lingala} »</p>}
      {onOpen && (
        <button type="button" onClick={() => onOpen(n.id)} className="mt-1 inline-flex items-center gap-1 rounded-xl bg-[#FFD23F] text-[#0B1622] px-3 py-1.5 text-xs font-black hover:bg-[#FFE27A]">
          Voter & détails <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function CommuneCard({ name, st, onPick }: { name: string; st: { node: CityMapNode; km: number } | null; onPick: (n: CityMapNode) => void }) {
  return (
    <div className="space-y-1.5 pr-6">
      <p className="text-[10px] font-black uppercase tracking-widest text-[#FFD23F]">Commune</p>
      <h3 className="font-black text-base leading-tight text-white">{name}</h3>
      {st ? (
        <>
          <p className="text-xs text-white/80">
            Carrefour mesuré le plus proche ({st.km} km) : <b>{st.node.name}</b>,{' '}
            <span className="font-black" style={{ color: LEVEL_COLOR[st.node.level] }}>{LEVEL_LABEL[st.node.level].toLowerCase()}</span>
            {typeof st.node.delayMin === 'number' && st.node.delayMin > 0 ? ` (+${Math.round(st.node.delayMin)} min)` : ''}.
          </p>
          <button type="button" onClick={() => onPick(st.node)} className="inline-flex items-center gap-1 text-xs font-black text-[#FFD23F] hover:underline">
            Aller au carrefour <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <p className="text-xs text-white/60">Pas encore de carrefour mesuré près d'ici. Signale ce que tu vois pour éclairer ta commune.</p>
      )}
    </div>
  );
}

function LandmarkGlyph({ icon, color }: { icon: Icon; color: string }) {
  const s = { stroke: color, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (icon) {
    case 'tower': return <g {...s}><path d="M0 -8 L0 7 M-3.5 7 L3.5 7" /><ellipse cx={0} cy={-4} rx={4.5} ry={1.6} fill={color} /><path d="M0 -8 L0 -10" /></g>;
    case 'stadium': return <g {...s}><ellipse rx={7} ry={4.5} /><ellipse rx={3.6} ry={2} fill={color} stroke="none" /></g>;
    case 'market': return <g {...s}><path d="M-7 -2 L-5 -6 L5 -6 L7 -2 Z" fill={color} /><path d="M-6 -2 L-6 6 L6 6 L6 -2 M-2 6 L-2 2 L2 2 L2 6" /></g>;
    case 'port': return <g {...s}><path d="M-7 2 L7 2 L5 6 L-5 6 Z" fill={color} /><path d="M0 2 L0 -7 L5 -1 L0 -1" /></g>;
    case 'train': return <g {...s}><rect x={-5} y={-7} width={10} height={11} rx={2.5} /><path d="M-5 -1 L5 -1 M-3 7 L-5 9 M3 7 L5 9" /><circle cx={-2.5} cy={2} r={0.6} fill={color} /><circle cx={2.5} cy={2} r={0.6} fill={color} /></g>;
    case 'univ': return <g {...s}><path d="M-8 -2 L0 -6 L8 -2 L0 2 Z" fill={color} /><path d="M-4 0 L-4 4 Q0 6 4 4 L4 0 M8 -2 L8 3" /></g>;
    case 'plane': return <g fill={color}><path d="M-1 -8 Q0 -9 1 -8 L1 -2 L8 2 L8 3.5 L1 1.5 L1 5 L3 6.5 L3 7.5 L0 6.8 L-3 7.5 L-3 6.5 L-1 5 L-1 1.5 L-8 3.5 L-8 2 L-1 -2 Z" /></g>;
    case 'palace': return <g {...s}><path d="M-7 -3 L0 -7 L7 -3 Z" fill={color} /><path d="M-5 -2 L-5 5 M-1.7 -2 L-1.7 5 M1.7 -2 L1.7 5 M5 -2 L5 5 M-7 6 L7 6" /></g>;
    case 'hill': return <g {...s}><path d="M-8 6 L-2 -4 L1 1 L3 -2 L8 6 Z" fill={color} fillOpacity={0.25} /></g>;
  }
}
