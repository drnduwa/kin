'use client';

/**
 * Carte vivante de Kinshasa (style jeu) : les 8 grands nœuds avec leurs vraies couleurs,
 * des points qui avancent à la vitesse mesurée, et un curseur de temps (+1 h / +2 h) alimenté
 * par l'historique. Aucune couleur n'est inventée : sans donnée, la route reste grise.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

type LatLng = [number, number];

/** Tracés simplifiés des grands axes, rattachés à l'id du nœud qui les mesure. */
const ROADS: Array<{ id: string; nodeId: string | null; label: string; points: LatLng[] }> = [
  { id: '30juin', nodeId: 'mandela-30juin', label: 'Bd du 30 Juin', points: [[-4.327, 15.274], [-4.318, 15.287], [-4.312, 15.298], [-4.306, 15.308], [-4.304, 15.318]] },
  { id: 'matadi', nodeId: 'matadi-upn', label: 'Route de Matadi', points: [[-4.327, 15.274], [-4.345, 15.266], [-4.362, 15.262], [-4.380, 15.258], [-4.405, 15.252]] },
  { id: 'bypass', nodeId: 'bypass-triangle', label: 'By-Pass', points: [[-4.380, 15.258], [-4.392, 15.275], [-4.400, 15.295], [-4.410, 15.315]] },
  { id: 'univ', nodeId: 'universite-pontgabu', label: "Av. de l'Université", points: [[-4.410, 15.315], [-4.385, 15.316], [-4.355, 15.318], [-4.343, 15.312]] },
  { id: 'kasavubu', nodeId: 'kalamu-victoire', label: 'Av. Kasa-Vubu', points: [[-4.343, 15.312], [-4.335, 15.311], [-4.318, 15.306], [-4.306, 15.308]] },
  { id: 'triomphal', nodeId: 'limete-echangeur', label: 'Vers Limete', points: [[-4.343, 15.312], [-4.350, 15.335], [-4.357, 15.358]] },
  { id: 'lumumba', nodeId: 'lumumba-pascal', label: 'Bd Lumumba', points: [[-4.357, 15.358], [-4.368, 15.380], [-4.378, 15.400], [-4.385, 15.420], [-4.388, 15.448]] },
  // Voies de contournement : pas encore mesurées → grises en pointillés.
  { id: 'poids', nodeId: null, label: 'Av. des Poids Lourds', points: [[-4.304, 15.318], [-4.312, 15.335], [-4.325, 15.352], [-4.340, 15.372], [-4.358, 15.392], [-4.375, 15.410], [-4.385, 15.420]] },
  { id: 'elengesa', nodeId: null, label: 'Av. Elengesa', points: [[-4.400, 15.295], [-4.380, 15.298], [-4.360, 15.303], [-4.343, 15.312]] },
  { id: 'berges', nodeId: null, label: 'Av. du Tourisme', points: [[-4.327, 15.274], [-4.313, 15.279], [-4.304, 15.292], [-4.301, 15.305], [-4.304, 15.318]] },
];

const RIVER: LatLng[] = [[-4.250, 15.20], [-4.318, 15.24], [-4.316, 15.265], [-4.300, 15.285], [-4.292, 15.31], [-4.296, 15.34], [-4.306, 15.37], [-4.322, 15.40], [-4.336, 15.43], [-4.330, 15.47], [-4.250, 15.47]];
const LABELS: Array<[string, number, number]> = [['GOMBE', -4.296, 15.302], ['LIMETE', -4.343, 15.362], ['NGALIEMA', -4.343, 15.252], ['LEMBA', -4.398, 15.330], ['MASINA', -4.372, 15.425], ['KALAMU', -4.347, 15.292]];

const W = 360, H = 220, LNG0 = 15.235, LNG1 = 15.462, LAT0 = -4.288, LAT1 = -4.418;
const X = (lng: number) => ((lng - LNG0) / (LNG1 - LNG0)) * W;
const Y = (lat: number) => ((lat - LAT0) / (LAT1 - LAT0)) * H;
const path = (pts: LatLng[]) => 'M' + pts.map(([a, g]) => `${X(g).toFixed(1)},${Y(a).toFixed(1)}`).join('L');

export type MapLevel = 'ok' | 'mod' | 'dense' | 'block' | 'none';
export const LEVEL_COLOR: Record<MapLevel, string> = {
  ok: '#3DDC97', mod: '#FFC53D', dense: '#FF7A45', block: '#FF3B5C', none: '#5B7186',
};
export const LEVEL_LABEL: Record<MapLevel, string> = {
  ok: 'Fluide', mod: 'Modéré', dense: 'Dense', block: 'Bloqué', none: 'Pas de données',
};

export function levelFromStatus(status?: string): MapLevel {
  switch (status) {
    case 'FLUIDE': return 'ok';
    case 'MODÉRÉ': return 'mod';
    case 'EMBOUTEILLAGE': case 'DENSE': return 'dense';
    case 'BLOQUÉ': return 'block';
    default: return 'none';
  }
}
export function levelFromDelay(delay: number | null | undefined): MapLevel {
  if (typeof delay !== 'number') return 'none';
  return delay >= 20 ? 'block' : delay >= 8 ? 'dense' : delay >= 3 ? 'mod' : 'ok';
}

export interface MapNode {
  id: string;
  name: string;
  coords: { lat: number; lng: number };
  level: MapLevel;
  isLive?: boolean;
  hasIncident?: boolean;
}

export default function LiveCityMap({ nodes, selectedId, onSelect, caption }: {
  nodes: MapNode[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  caption?: React.ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);
  const roadLevel = (r: (typeof ROADS)[number]): MapLevel => (r.nodeId ? byId[r.nodeId]?.level ?? 'none' : 'none');

  // Points qui avancent à la vitesse du trafic (immobiles si l'usager préfère moins d'animation).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const layer = svg.querySelector('#kf-dots') as SVGGElement | null;
    if (!layer) return;
    layer.innerHTML = '';
    const items: Array<{ el: SVGCircleElement; p: SVGPathElement; L: number; o: number; sp: number }> = [];
    ROADS.forEach(r => {
      const lvl = roadLevel(r);
      if (lvl === 'none') return;
      const p = svg.querySelector(`#kf-road-${r.id}`) as SVGPathElement | null;
      if (!p) return;
      const L = p.getTotalLength();
      const sp = { ok: 0.066, mod: 0.036, dense: 0.018, block: 0.007, none: 0 }[lvl];
      const gap = { ok: 26, mod: 20, dense: 15, block: 11, none: 99 }[lvl];
      const n = Math.max(2, Math.round(L / gap));
      for (let i = 0; i < n; i++) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('r', '1.6'); c.setAttribute('fill', '#fff'); c.setAttribute('opacity', '.75');
        layer.appendChild(c);
        items.push({ el: c, p, L, o: (i / n) * L, sp });
      }
    });
    const place = (t: number) => items.forEach(it => {
      const pt = it.p.getPointAtLength((it.o + t * it.sp) % it.L);
      it.el.setAttribute('cx', String(pt.x)); it.el.setAttribute('cy', String(pt.y));
    });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { place(0); return; }
    let raf = 0; const t0 = performance.now();
    const loop = (t: number) => { place(t - t0); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[#22425C] bg-[#0C2033]">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="img" aria-label="Carte du trafic de Kinshasa">
        <rect width={W} height={H} fill="#0C2033" />
        <path d={'M' + RIVER.map(([a, g]) => `${X(g).toFixed(1)},${Y(a).toFixed(1)}`).join('L') + 'Z'} fill="#0F3550" />
        <text x={X(15.30)} y={Y(-4.282)} fill="#3E7FA8" fontSize="8" fontStyle="italic" fontWeight="700" textAnchor="middle">Fleuve Congo</text>
        {LABELS.map(([t, a, g]) => (
          <text key={t} x={X(g)} y={Y(a)} fill="#8EA8BD" fontSize="7.5" fontWeight="700" letterSpacing="1" textAnchor="middle" fontFamily="ui-monospace, monospace">{t}</text>
        ))}
        {ROADS.map(r => {
          const lvl = roadLevel(r);
          return (
            <path key={r.id} id={`kf-road-${r.id}`} d={path(r.points)} fill="none" stroke={LEVEL_COLOR[lvl]}
              strokeWidth={r.nodeId ? 4 : 2.5} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={lvl === 'none' ? '3 4' : undefined} opacity={lvl === 'none' ? 0.7 : 1}>
              <title>{`${r.label} : ${LEVEL_LABEL[lvl]}`}</title>
            </path>
          );
        })}
        <g id="kf-dots" />
        {nodes.map(n => {
          const x = X(n.coords.lng), y = Y(n.coords.lat);
          const color = LEVEL_COLOR[n.level];
          const selected = n.id === selectedId;
          return (
            <g key={n.id} role="button" tabIndex={0} aria-label={`${n.name}, ${LEVEL_LABEL[n.level]}`} className="cursor-pointer outline-none"
              onClick={() => onSelect(n.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id); } }}>
              {n.level === 'block' && (
                <circle cx={x} cy={y} r="6" fill={color} opacity=".35">
                  <animate attributeName="r" values="6;14;6" dur="1.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values=".45;0;.45" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              {selected && <circle cx={x} cy={y} r="11" fill="none" stroke="#FFD23F" strokeWidth="2" />}
              <circle cx={x} cy={y} r="7" fill="#0A1A29" stroke={color} strokeWidth="3" />
              {n.hasIncident && <circle cx={x + 6} cy={y - 6} r="3" fill="#FFD23F" stroke="#0A1A29" strokeWidth="1" />}
              <circle cx={x} cy={y} r="16" fill="transparent" />
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[10px] font-semibold text-[#8EA8BD] bg-[#0A1A29]/80">
        {(['ok', 'mod', 'dense', 'block', 'none'] as MapLevel[]).map(l => (
          <span key={l} className="inline-flex items-center gap-1">
            <span className={cn('inline-block h-2 w-3 rounded-sm')} style={{ background: LEVEL_COLOR[l] }} />{LEVEL_LABEL[l]}
          </span>
        ))}
        {caption && <span className="ml-auto">{caption}</span>}
      </div>
    </div>
  );
}
