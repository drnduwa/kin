/**
 * Véhicules et personnages de Kin, vus de profil (dessinés pour être posés dans un SVG parent).
 *
 * Chaque composant renvoie un <g>, orienté vers la droite, posé sur la ligne de sol `ground`.
 * Les roues portent `data-wheel` pour que la scène les fasse tourner à la vitesse réelle.
 * `flip` retourne le véhicule (trafic d'en face).
 */
import { useId, type Ref } from 'react';

type Place = { x?: number; y?: number; scale?: number; flip?: boolean; className?: string };

/** Pose un véhicule : (x, y) = coin bas-gauche au sol. `w` et `ground` = taille du dessin. */
function place({ x = 0, y = 0, scale = 1, flip = false }: Place, w: number, ground: number) {
  return flip
    ? `translate(${x + w * scale} ${y - ground * scale}) scale(${-scale} ${scale})`
    : `translate(${x} ${y - ground * scale}) scale(${scale})`;
}

export function Wheel({ cx, cy, r = 17, lane = 'ours', hub = '#CBD5E1' }: { cx: number; cy: number; r?: number; lane?: 'ours' | 'onc' | 'none'; hub?: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#111418" />
      <circle cx={cx} cy={cy} r={r * 0.62} fill="#3A4350" />
      <g data-wheel={lane === 'none' ? undefined : lane} data-cx={cx} data-cy={cy} data-r={r}>
        <circle cx={cx} cy={cy} r={r * 0.55} fill={hub} />
        {[0, 72, 144, 216, 288].map(a => (
          <rect key={a} x={cx - 1.6} y={cy - r * 0.52} width={3.2} height={r * 0.42} rx={1.2} fill="#64748B" transform={`rotate(${a} ${cx} ${cy})`} />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.16} fill="#1F2937" />
      </g>
    </g>
  );
}

const SHAPES = {
  hatch: {
    body: 'M18 88 L18 62 Q18 54 28 52 L56 30 Q60 26 68 26 L166 26 Q176 26 182 32 L206 52 L238 58 Q248 60 248 70 L248 86 Q248 90 244 90 L22 90 Q18 90 18 86 Z',
    windows: ['M38 52 L60 32 L96 32 L96 52 Z', 'M102 32 L136 32 L136 52 L102 52 Z', 'M142 32 L168 32 Q174 32 178 37 L192 52 L142 52 Z'],
    doors: ['M98 54 L98 86', 'M139 54 L140 86'],
    handles: [[108, 60], [150, 61]],
    roof: [68, 166, 26],
    tail: [16, 56],
  },
  sedan: {
    body: 'M12 88 L12 64 Q12 56 22 55 L58 52 L80 32 Q84 28 92 28 L150 28 Q160 28 166 34 L188 52 L238 58 Q248 60 248 70 L248 86 Q248 90 244 90 L16 90 Q12 90 12 86 Z',
    windows: ['M66 52 L84 33 L116 33 L116 52 Z', 'M122 33 L150 33 Q156 33 161 38 L174 52 L122 52 Z'],
    doors: ['M118 54 L118 86', 'M176 56 L178 86'],
    handles: [[128, 60], [184, 62]],
    roof: [92, 150, 28],
    tail: [10, 58],
  },
  suv: {
    body: 'M16 88 L16 48 Q16 40 24 38 L40 20 Q44 16 52 16 L170 16 Q180 16 186 24 L206 46 L238 52 Q248 55 248 66 L248 86 Q248 90 244 90 L20 90 Q16 90 16 86 Z',
    windows: ['M30 44 L46 22 L94 22 L94 44 Z', 'M100 22 L140 22 L140 44 L100 44 Z', 'M146 22 L172 22 Q178 22 182 28 L194 44 L146 44 Z'],
    doors: ['M97 46 L97 86', 'M143 46 L144 86'],
    handles: [[108, 52], [152, 53]],
    roof: [52, 170, 16],
    tail: [14, 48],
  },
} as const;

export type CarKind = keyof typeof SHAPES;

/** Voiture de profil (260 × 106). `taxi` ajoute l'enseigne et la bande des taxis de Kin. */
export function Car({
  kind = 'sedan', body = '#E2E8F0', taxi = false, brakeRef, headlights = false, lane = 'ours', roofRack = false, ...p
}: Place & { kind?: CarKind; body?: string; taxi?: boolean; brakeRef?: Ref<SVGRectElement>; headlights?: boolean; lane?: 'ours' | 'onc' | 'none'; roofRack?: boolean }) {
  const s = SHAPES[kind];
  const id = useId().replace(/:/g, '');
  return (
    <g transform={place(p, 260, 106)} className={p.className}>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={body} />
          <stop offset="0.55" stopColor={body} />
          <stop offset="1" stopColor="#000" stopOpacity={0.35} />
        </linearGradient>
        <linearGradient id={`w${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2B4A66" />
          <stop offset="0.5" stopColor="#14263A" />
          <stop offset="1" stopColor="#0B1622" />
        </linearGradient>
      </defs>
      <ellipse cx={130} cy={105} rx={122} ry={5} fill="#000" opacity={0.35} />
      {headlights && <path d="M246 62 L420 40 L420 100 L246 72 Z" fill="#FFF3C4" opacity={0.18} />}
      <path d={s.body} fill={`url(#b${id})`} stroke="#0B1118" strokeOpacity={0.5} strokeWidth={1.2} />
      {/* reflet de carrosserie */}
      <path d={`M${s.roof[0] - 4} ${s.roof[2] + 3} L${s.roof[1] - 2} ${s.roof[2] + 3}`} stroke="#fff" strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" />
      <path d="M26 58 L240 62" stroke="#fff" strokeOpacity={0.22} strokeWidth={3} />
      {s.windows.map(w => <path key={w} d={w} fill={`url(#w${id})`} />)}
      {s.windows.map(w => <path key={`r${w}`} d={w} fill="#fff" opacity={0.08} transform="translate(4 -2) scale(.97)" />)}
      {s.doors.map(d => <path key={d} d={d} stroke="#000" strokeOpacity={0.25} strokeWidth={1.2} />)}
      {s.handles.map(([x, y]) => <rect key={x} x={x} y={y} width={9} height={2.6} rx={1.3} fill="#000" opacity={0.35} />)}
      <path d="M182 44 L193 41 L193 48 Z" fill={body} stroke="#0B1118" strokeOpacity={0.5} />
      <rect x={16} y={79} width={232} height={8} rx={3} fill="#0B1118" opacity={0.35} />
      {/* phares */}
      <path d="M238 60 L248 63 L248 70 L236 68 Z" fill="#FFF7D6" />
      <rect ref={brakeRef} x={s.tail[0]} y={s.tail[1]} width={6} height={11} rx={1.5} fill="#B91C1C" />
      {taxi && (
        <g>
          <rect x={18} y={66} width={228} height={7} fill="#1D4ED8" opacity={0.9} />
          <rect x={s.roof[0] + 24} y={s.roof[2] - 9} width={34} height={9} rx={2} fill="#FEF08A" stroke="#0B1118" strokeWidth={1} />
          <text x={s.roof[0] + 41} y={s.roof[2] - 2.2} fontSize={7} fontWeight={900} textAnchor="middle" fill="#0B1118" fontFamily="sans-serif">TAXI</text>
        </g>
      )}
      {roofRack && (
        <g>
          <rect x={s.roof[0] + 4} y={s.roof[2] - 4} width={s.roof[1] - s.roof[0] - 8} height={3} fill="#1F2937" />
          <rect x={s.roof[0] + 10} y={s.roof[2] - 18} width={30} height={14} rx={2} className="kf-wax" />
          <rect x={s.roof[0] + 42} y={s.roof[2] - 14} width={40} height={10} rx={3} fill="#7C2D12" />
        </g>
      )}
      <path d="M41 88 A21 21 0 0 1 83 88 Z" fill="#0B0F14" />
      <path d="M183 88 A21 21 0 0 1 225 88 Z" fill="#0B0F14" />
      <Wheel cx={62} cy={88} lane={lane} />
      <Wheel cx={204} cy={88} lane={lane} />
    </g>
  );
}

/** Le minibus « esprit de mort » (Mercedes 207) : jaune et bleu, chargeur à la porte, bagages au toit. */
export function Bus207({ lane = 'ours', brakeRef, ...p }: Place & { lane?: 'ours' | 'onc' | 'none'; brakeRef?: Ref<SVGRectElement> }) {
  return (
    <g transform={place(p, 300, 154)} className={p.className}>
      <ellipse cx={150} cy={153} rx={145} ry={6} fill="#000" opacity={0.35} />
      {/* bagages */}
      <rect x={30} y={10} width={200} height={5} fill="#1F2937" />
      <rect x={40} y={-8} width={40} height={18} rx={2} fill="#A16207" />
      <rect x={84} y={-14} width={34} height={24} rx={2} className="kf-wax" />
      <rect x={122} y={-4} width={52} height={14} rx={3} fill="#1D4ED8" />
      <rect x={178} y={-10} width={26} height={20} rx={2} fill="#E5E7EB" />
      <path d="M10 132 L10 40 Q10 30 20 30 L236 30 Q248 30 254 40 L276 84 L292 92 Q300 96 300 106 L300 128 Q300 134 294 134 L16 134 Q10 134 10 128 Z" fill="#FACC15" stroke="#0B1118" strokeOpacity={0.6} strokeWidth={1.5} />
      <rect x={10} y={92} width={290} height={18} fill="#1D4ED8" />
      <path d="M10 34 L240 34" stroke="#fff" strokeOpacity={0.4} strokeWidth={3} />
      {[22, 68, 114, 160].map(x => <rect key={x} x={x} y={42} width={40} height={38} rx={3} fill="#14263A" />)}
      {[34, 80, 124, 172].map((x, i) => (
        <g key={x}>
          <circle cx={x + (i % 2) * 6} cy={62} r={8} fill="#4E2C17" />
          <path d={`M${x - 10 + (i % 2) * 6} 80 Q${x + (i % 2) * 6} 68 ${x + 10 + (i % 2) * 6} 80 Z`} fill={['#DC2626', '#16A34A', '#F97316', '#7C3AED'][i]} />
        </g>
      ))}
      <path d="M240 40 L254 42 L272 82 L240 82 Z" fill="#14263A" />
      {/* porte ouverte + chargeur */}
      <rect x={206} y={40} width={30} height={92} fill="#0B1118" opacity={0.85} />
      <g>
        <circle cx={222} cy={50} r={7} fill="#4E2C17" />
        <path d="M214 60 L230 60 L232 98 L212 98 Z" fill="#F8FAFC" />
        <path d="M214 98 L210 128 M228 98 L236 126" stroke="#1E3A5F" strokeWidth={6} strokeLinecap="round" />
        <path d="M230 64 L250 54" stroke="#4E2C17" strokeWidth={5} strokeLinecap="round" />
      </g>
      <text x={110} y={106} fontSize={12} fontWeight={900} textAnchor="middle" fill="#FEF08A" fontFamily="Anton, Impact, sans-serif" letterSpacing={1}>NZAMBE AZALI</text>
      <text x={276} y={124} fontSize={11} fontWeight={900} textAnchor="middle" fill="#0B1118" fontFamily="sans-serif">207</text>
      <rect x={290} y={98} width={10} height={9} rx={2} fill="#FFF7D6" />
      <rect ref={brakeRef} x={8} y={96} width={6} height={12} rx={1.5} fill="#B91C1C" />
      <path d="M40 134 A26 26 0 0 1 92 134 Z" fill="#0B0F14" />
      <path d="M224 134 A26 26 0 0 1 276 134 Z" fill="#0B0F14" />
      <Wheel cx={66} cy={134} r={20} lane={lane} />
      <Wheel cx={250} cy={134} r={20} lane={lane} />
    </g>
  );
}

/** Le « fula-fula » : camion transformé en bus, ridelles en bois, passagers debout. */
export function FulaFula({ lane = 'onc', ...p }: Place & { lane?: 'ours' | 'onc' | 'none' }) {
  return (
    <g transform={place(p, 380, 196)} className={p.className}>
      <ellipse cx={190} cy={195} rx={185} ry={7} fill="#000" opacity={0.35} />
      {/* bâche */}
      <path d="M12 40 Q140 14 268 40 L268 50 L12 50 Z" fill="#0F766E" />
      {/* passagers */}
      {Array.from({ length: 11 }, (_, i) => (
        <g key={i}>
          <circle cx={30 + i * 22} cy={68 + (i % 3) * 4} r={9} fill={i % 2 ? '#4E2C17' : '#6B3F22'} />
          <rect x={22 + i * 22} y={78 + (i % 3) * 4} width={16} height={20} rx={4} fill={['#DC2626', '#F8FAFC', '#16A34A', '#F59E0B', '#2563EB'][i % 5]} />
        </g>
      ))}
      {/* caisse en bois */}
      <rect x={10} y={96} width={262} height={70} fill="#9A6B3E" stroke="#5B3A1E" strokeWidth={2} />
      {[110, 126, 142].map(y => <path key={y} d={`M10 ${y} L272 ${y}`} stroke="#5B3A1E" strokeWidth={2} />)}
      {[60, 120, 180, 230].map(x => <path key={x} d={`M${x} 50 L${x} 166`} stroke="#5B3A1E" strokeWidth={4} />)}
      <path d="M12 50 L12 96 M268 50 L268 96" stroke="#5B3A1E" strokeWidth={4} />
      <text x={140} y={160} fontSize={13} textAnchor="middle" fill="#FDE68A" fontFamily="Anton, Impact, sans-serif" letterSpacing={1}>MOKILI EZA PASI</text>
      {/* cabine */}
      <path d="M276 166 L276 70 Q276 60 286 60 L338 60 Q348 60 352 70 L368 120 L374 124 Q380 128 380 138 L380 166 Z" fill="#DC2626" stroke="#0B1118" strokeOpacity={0.5} />
      <path d="M296 70 L336 70 L350 112 L296 112 Z" fill="#14263A" />
      <rect x={276} y={150} width={104} height={16} fill="#0B1118" opacity={0.4} />
      <rect x={372} y={132} width={8} height={10} rx={2} fill="#FFF7D6" />
      <rect x={6} y={166} width={376} height={10} fill="#1F2937" />
      <path d="M44 176 A26 26 0 0 1 96 176 Z M100 176 A26 26 0 0 1 152 176 Z M302 176 A26 26 0 0 1 354 176 Z" fill="#0B0F14" />
      <Wheel cx={70} cy={174} r={22} lane={lane} />
      <Wheel cx={126} cy={174} r={22} lane={lane} />
      <Wheel cx={328} cy={174} r={22} lane={lane} />
    </g>
  );
}

/** Moto-taxi qui se faufile entre les files (180 × 120). */
export function Moto({ ...p }: Place) {
  return (
    <g transform={place(p, 180, 118)} className={p.className}>
      <ellipse cx={90} cy={117} rx={70} ry={4} fill="#000" opacity={0.3} />
      <Wheel cx={36} cy={98} r={18} lane="ours" hub="#94A3B8" />
      <Wheel cx={142} cy={98} r={18} lane="ours" hub="#94A3B8" />
      <path d="M128 48 L142 98" stroke="#475569" strokeWidth={5} strokeLinecap="round" />
      <path d="M30 82 L56 66 L104 66 L126 56 L138 60 L130 84 L50 88 Z" fill="#DC2626" />
      <path d="M50 64 Q76 54 102 62 L100 68 L52 70 Z" fill="#0B1118" />
      <circle cx={140} cy={60} r={5} fill="#FFF7D6" stroke="#0B1118" />
      {/* pilote */}
      <path d="M84 62 L100 76 L96 92" fill="none" stroke="#1E3A5F" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M76 66 Q72 40 90 30 L104 36 Q94 46 96 68 Z" fill="#F97316" />
      <path d="M96 38 Q110 42 124 48" stroke="#6B3F22" strokeWidth={6} strokeLinecap="round" fill="none" />
      <circle cx={100} cy={22} r={10} fill="#6B3F22" />
      <path d="M88 23 Q88 8 102 8 Q114 9 113 21 L104 21 L102 25 L88 26 Z" fill="#FACC15" stroke="#0B1118" strokeWidth={1} />
      {/* passager */}
      <path d="M62 64 L74 78 L70 92" fill="none" stroke="#7C2D12" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M56 66 Q52 44 66 36 L78 40 Q70 50 74 68 Z" fill="#7C3AED" />
      <circle cx={70} cy={28} r={8} fill="#4E2C17" />
    </g>
  );
}

/** Personnages du trottoir (≈ 40 × 90). */
export function Person({
  kind = 'walker', shirt = '#2563EB', x = 0, y = 0, scale = 1, flip = false, walk = true, className,
}: Place & { kind?: 'walker' | 'mama' | 'roulage' | 'kid'; shirt?: string; walk?: boolean }) {
  const s = kind === 'kid' ? scale * 0.7 : scale;
  const t = flip ? `translate(${x + 40 * s} ${y - 90 * s}) scale(${-s} ${s})` : `translate(${x} ${y - 90 * s}) scale(${s})`;
  const skin = kind === 'mama' ? '#4E2C17' : '#6B3F22';
  return (
    <g transform={t} className={className}>
      <ellipse cx={20} cy={89} rx={14} ry={2.5} fill="#000" opacity={0.25} />
      {/* jambes */}
      <g>
        <path d="M17 56 L13 88" stroke={kind === 'roulage' ? '#1E3A5F' : '#1F2937'} strokeWidth={6} strokeLinecap="round" className={walk ? 'kf-leg-a' : undefined} />
        <path d="M23 56 L27 88" stroke={kind === 'roulage' ? '#1E3A5F' : '#1F2937'} strokeWidth={6} strokeLinecap="round" className={walk ? 'kf-leg-b' : undefined} />
      </g>
      {kind === 'mama' ? (
        <>
          <path d="M8 34 Q20 26 32 34 L36 76 L4 76 Z" className="kf-wax" />
          <path d="M8 34 Q20 26 32 34 L36 76 L4 76 Z" fill="none" stroke="#9A3412" strokeWidth={1} />
          <circle cx={20} cy={20} r={8} fill={skin} />
          <path d="M11 17 Q12 8 20 9 Q29 9 29 17 Q24 13 20 14 Q15 14 11 17 Z" fill="#F97316" />
          {/* bassine de fruits sur la tête */}
          <path d="M2 8 L38 8 L33 0 L7 0 Z" fill="#94A3B8" />
          <circle cx={12} cy={0} r={4} fill="#F59E0B" /><circle cx={20} cy={-2} r={4.5} fill="#16A34A" /><circle cx={28} cy={0} r={4} fill="#DC2626" />
          <path d="M8 36 L4 14 M32 36 L36 14" stroke={skin} strokeWidth={4} strokeLinecap="round" />
        </>
      ) : kind === 'roulage' ? (
        <>
          <rect x={9} y={30} width={22} height={28} rx={5} fill="#F8FAFC" stroke="#CBD5E1" />
          <path d="M9 34 L-6 24 M31 34 L46 24" stroke="#F8FAFC" strokeWidth={6} strokeLinecap="round" className="kf-wave" />
          <circle cx={-6} cy={24} r={3} fill={skin} /><circle cx={46} cy={24} r={3} fill={skin} />
          <circle cx={20} cy={20} r={8} fill={skin} />
          <path d="M10 15 L30 15 L28 9 Q20 5 12 9 Z" fill="#F8FAFC" stroke="#1E3A5F" strokeWidth={1} />
          <rect x={10} y={14} width={20} height={2.5} fill="#1E3A5F" />
          <circle cx={26} cy={24} r={1.6} fill="#FACC15" />
        </>
      ) : (
        <>
          <rect x={10} y={30} width={20} height={28} rx={6} fill={shirt} />
          <path d="M11 34 L7 54 M29 34 L33 54" stroke={skin} strokeWidth={4} strokeLinecap="round" />
          <circle cx={20} cy={20} r={8} fill={skin} />
          <path d="M12 17 Q13 10 20 10 Q27 10 28 17 Q24 14 20 14 Q16 14 12 17 Z" fill="#111827" />
        </>
      )}
    </g>
  );
}

/** Voiture « Kinshasa Flow » seule, prête à poser dans une page (loader, illustrations). */
export function FlowCarBadge({ className, moving = true }: { className?: string; moving?: boolean }) {
  return (
    <svg viewBox="-10 -10 280 130" className={className} role="img" aria-label="La voiture Kinshasa Flow">
      <g className={moving ? 'kf-bob-slow' : undefined}>
        <Car kind="hatch" body="#2EB6F0" headlights lane="none" />
      </g>
    </svg>
  );
}
