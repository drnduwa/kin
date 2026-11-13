/**
 * Illustrations originales de Kinshasa Flow (SVG pur, aucune image externe).
 *
 * - WewaRider      : Ya Flow, notre wewa, sur sa moto (avec ou sans passagère en pagne wax)
 * - EspritDeMort   : le minibus jaune et bleu de Kin
 * - KinSkyline     : la silhouette de Kin, avec la Tour de l'Échangeur et les palmiers
 * - YaFlowAvatar   : tête du narrateur (casque jaune), avec humeur
 * - Libulu         : le nid-de-poule, avec sa flaque
 *
 * Les animations sont des classes CSS « kf-* » (globals.css), coupées si l'usager
 * demande moins de mouvement.
 */
import type { Mood } from '@/lib/kin-slang';
import { cn } from '@/lib/utils';

const INK = '#0B1622';
const SKIN = '#6B3F22';
const SKIN_DARK = '#4E2C17';
const YELLOW = '#FFD23F';
const BLUE = '#2EB6F0';
const ORANGE = '#FF7A45';

function Wheel({ cx, cy, r = 19, spin = true }: { cx: number; cy: number; r?: number; spin?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={INK} />
      <circle cx={cx} cy={cy} r={r - 6} fill="#64748B" />
      <g className={spin ? 'kf-spin' : undefined}>
        <circle cx={cx} cy={cy} r={r - 7} fill="#CBD5E1" />
        {[0, 60, 120].map(a => (
          <line
            key={a}
            x1={cx + Math.cos((a * Math.PI) / 180) * (r - 8)}
            y1={cy + Math.sin((a * Math.PI) / 180) * (r - 8)}
            x2={cx - Math.cos((a * Math.PI) / 180) * (r - 8)}
            y2={cy - Math.sin((a * Math.PI) / 180) * (r - 8)}
            stroke="#64748B"
            strokeWidth={2}
          />
        ))}
        <circle cx={cx} cy={cy} r={3} fill={INK} />
      </g>
    </g>
  );
}

/** Ya Flow sur sa wewa. Regarde vers la droite. */
export function WewaRider({
  className,
  passenger = false,
  moving = true,
  title = 'Ya Flow, le wewa de Kinshasa Flow, sur sa moto',
}: {
  className?: string;
  passenger?: boolean;
  moving?: boolean;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 200 140" className={className} role="img" aria-label={title}>
      {/* ombre */}
      <ellipse cx={100} cy={132} rx={70} ry={5} fill="#000" opacity={0.25} />

      {/* fumée d'échappement */}
      {moving && (
        <g fill="#CBD5E1">
          <circle cx={26} cy={100} r={5} className="kf-puff" />
          <circle cx={26} cy={100} r={4} className="kf-puff" style={{ animationDelay: '.37s' }} />
          <circle cx={26} cy={100} r={5} className="kf-puff" style={{ animationDelay: '.74s' }} />
        </g>
      )}

      {/* faisceau du phare */}
      <polygon points="158,72 200,58 200,96" fill={YELLOW} className={moving ? 'kf-beam' : undefined} opacity={0.3} />

      <Wheel cx={50} cy={112} spin={moving} />
      <Wheel cx={152} cy={112} spin={moving} />

      <g className={moving ? 'kf-bob' : undefined}>
        {/* fourche + guidon */}
        <line x1={140} y1={60} x2={152} y2={112} stroke="#475569" strokeWidth={5} strokeLinecap="round" />
        <line x1={132} y1={57} x2={146} y2={59} stroke={INK} strokeWidth={4} strokeLinecap="round" />
        {/* garde-boue avant */}
        <path d="M134 98 Q152 84 170 98" fill="none" stroke={BLUE} strokeWidth={5} strokeLinecap="round" />
        {/* pot d'échappement */}
        <rect x={28} y={96} width={36} height={7} rx={3.5} fill="#94A3B8" />
        {/* carrosserie */}
        <path d="M38 94 L66 78 L118 78 L140 68 L152 72 L144 96 L62 102 Z" fill={BLUE} />
        <path d="M66 86 L140 80" stroke={YELLOW} strokeWidth={3} strokeLinecap="round" />
        {/* réservoir */}
        <ellipse cx={124} cy={74} rx={14} ry={7} fill="#1A8BC4" />
        {/* selle */}
        <path d="M58 76 Q88 64 116 74 L114 80 L60 82 Z" fill={INK} />
        {/* phare */}
        <circle cx={153} cy={72} r={5.5} fill={YELLOW} stroke={INK} strokeWidth={1.5} />
        {/* plaque */}
        <rect x={32} y={80} width={16} height={10} rx={2} fill={YELLOW} stroke={INK} strokeWidth={1} />
        <text x={40} y={88} textAnchor="middle" fontSize={7} fontWeight={900} fill={INK} fontFamily="sans-serif">KF</text>

        {passenger && (
          <g>
            {/* jambe */}
            <path d="M74 74 L88 90 L84 104" fill="none" stroke="#7C2D12" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
            {/* buste en pagne wax */}
            <path d="M64 76 Q60 52 76 44 L88 48 Q80 60 84 78 Z" fill="#0B7A4B" />
            <circle cx={70} cy={58} r={2.4} fill={YELLOW} />
            <circle cx={78} cy={66} r={2.4} fill={YELLOW} />
            <circle cx={72} cy={70} r={2} fill={ORANGE} />
            <circle cx={80} cy={53} r={2} fill={ORANGE} />
            {/* bras qui tient le wewa */}
            <path d="M84 52 L98 60" stroke={SKIN} strokeWidth={6} strokeLinecap="round" />
            {/* tête + foulard */}
            <circle cx={80} cy={34} r={9} fill={SKIN} />
            <path d="M70 32 Q72 18 84 20 Q94 22 90 32 Q86 26 80 27 Q74 28 70 32 Z" fill={ORANGE} />
            <path d="M88 22 Q96 16 94 26" fill={ORANGE} />
            <circle cx={84} cy={34} r={1.2} fill={INK} />
          </g>
        )}

        {/* Ya Flow */}
        <g>
          {/* jambe (jean) */}
          <path d="M94 74 L114 88 L110 104" fill="none" stroke="#1E3A5F" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M106 104 L118 104" stroke={INK} strokeWidth={6} strokeLinecap="round" />
          {/* buste : gilet orange réfléchissant */}
          <path d="M86 78 Q82 50 102 38 L118 44 Q104 56 106 80 Z" fill={ORANGE} />
          <path d="M90 64 L110 60" stroke={YELLOW} strokeWidth={3} />
          <path d="M92 72 L108 70" stroke={YELLOW} strokeWidth={3} />
          {/* bras */}
          <path d="M108 46 Q122 50 134 58" fill="none" stroke={SKIN} strokeWidth={7} strokeLinecap="round" />
          <circle cx={134} cy={58} r={3.5} fill={SKIN_DARK} />
          {/* tête */}
          <circle cx={114} cy={30} r={11} fill={SKIN} />
          {/* casque jaune */}
          <path d="M101 31 Q101 14 116 14 Q129 15 128 29 L118 29 L116 33 L101 34 Z" fill={YELLOW} stroke={INK} strokeWidth={1.2} />
          <path d="M106 18 Q114 13 124 18" stroke={BLUE} strokeWidth={3} fill="none" strokeLinecap="round" />
          {/* visière relevée */}
          <path d="M116 22 L131 24 L130 29 L117 28 Z" fill={INK} opacity={0.85} />
          {/* œil + sourire */}
          <circle cx={121} cy={33} r={1.4} fill={INK} className="kf-blink" />
          <path d="M118 37 Q121 39 124 37" stroke={INK} strokeWidth={1.3} fill="none" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

/** Le minibus « esprit de mort », jaune et bleu. Regarde vers la droite. */
export function EspritDeMort({ className, moving = true }: { className?: string; moving?: boolean }) {
  return (
    <svg viewBox="0 0 220 130" className={className} role="img" aria-label="Minibus esprit de mort">
      <ellipse cx={110} cy={124} rx={95} ry={5} fill="#000" opacity={0.25} />
      <g className={moving ? 'kf-bob-slow' : undefined}>
        {/* bagages sur le toit */}
        <rect x={40} y={10} width={30} height={14} rx={2} fill="#A16207" />
        <rect x={74} y={6} width={24} height={18} rx={2} className="kf-wax" />
        <rect x={102} y={12} width={40} height={12} rx={3} fill="#1D4ED8" />
        <line x1={34} y1={24} x2={160} y2={24} stroke={INK} strokeWidth={3} />
        {/* carrosserie */}
        <path d="M18 30 Q18 24 26 24 L168 24 Q180 24 186 36 L204 70 Q208 78 208 86 L208 100 Q208 106 202 106 L18 106 Q12 106 12 100 L12 36 Q12 30 18 30 Z" fill={YELLOW} stroke={INK} strokeWidth={2} />
        <rect x={12} y={74} width={196} height={14} fill={BLUE} />
        {/* fenêtres */}
        {[22, 58, 94, 130].map(x => (
          <rect key={x} x={x} y={34} width={30} height={26} rx={3} fill="#0F2A40" />
        ))}
        <path d="M166 34 L182 34 L198 66 L166 66 Z" fill="#0F2A40" />
        {/* passagers en silhouette */}
        {[32, 70, 104, 140].map((x, i) => (
          <circle key={x} cx={x + (i % 2 ? 4 : 0)} cy={52} r={6} fill={SKIN_DARK} />
        ))}
        {/* « 207 » + « Nzambe azali » */}
        <text x={50} y={99} fontSize={10} fontWeight={900} fill={INK} fontFamily="sans-serif">NZAMBE AZALI</text>
        <text x={168} y={99} fontSize={10} fontWeight={900} fill={INK} fontFamily="sans-serif">207</text>
        {/* phare */}
        <rect x={198} y={78} width={10} height={8} rx={2} fill="#FEF9C3" stroke={INK} strokeWidth={1} />
        {/* porte ouverte avec le chargeur */}
        <rect x={150} y={36} width={2} height={60} fill={INK} opacity={0.3} />
      </g>
      <Wheel cx={52} cy={106} r={16} spin={moving} />
      <Wheel cx={170} cy={106} r={16} spin={moving} />
    </svg>
  );
}

/** Le nid-de-poule et sa flaque. */
export function Libulu({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 24" className={className} role="img" aria-label="Libulu, nid-de-poule">
      <ellipse cx={40} cy={12} rx={38} ry={10} fill="#3F2A1A" />
      <ellipse cx={40} cy={12} rx={28} ry={6.5} fill="#5B8DB8" />
      <ellipse cx={34} cy={10} rx={8} ry={1.6} fill="#BAE6FD" opacity={0.7} />
    </svg>
  );
}

/** Silhouette de Kin : immeubles, Tour de l'Échangeur, palmiers. Pensée pour boucler en largeur. */
export function KinSkyline({ className, tone = 'dusk' }: { className?: string; tone?: 'dusk' | 'day' }) {
  const far = tone === 'dusk' ? '#1B2C3F' : '#9CC9E6';
  const near = tone === 'dusk' ? '#0F1C2B' : '#6FA7CF';
  const win = tone === 'dusk' ? YELLOW : '#E0F2FE';
  return (
    <svg viewBox="0 0 800 200" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      {/* plan lointain */}
      <path
        fill={far}
        d="M0 200 L0 140 L30 140 L30 118 L62 118 L62 132 L96 132 L96 100 L120 100 L120 128 L160 128 L160 110 L188 110 L188 136 L230 136 L230 92 L262 92 L262 130 L300 130 L300 120 L340 120 L340 140 L380 140 L380 104 L404 104 L404 132 L450 132 L450 116 L486 116 L486 138 L520 138 L520 98 L548 98 L548 130 L620 130 L620 112 L660 112 L660 136 L700 136 L700 108 L730 108 L730 128 L770 128 L770 118 L800 118 L800 200 Z"
      />
      {/* Tour de l'Échangeur de Limete */}
      <g fill={near}>
        <rect x={588} y={40} width={12} height={160} />
        <path d="M580 200 L594 70 L608 200 Z" />
        <ellipse cx={594} cy={42} rx={18} ry={6} />
        <rect x={578} y={30} width={32} height={10} rx={4} />
        <rect x={592.5} y={2} width={3} height={30} />
        <circle cx={594} cy={2} r={2.5} fill="#EF4444" className="kf-beam" />
      </g>
      {/* plan proche */}
      <path
        fill={near}
        d="M0 200 L0 160 L44 160 L44 146 L84 146 L84 164 L140 164 L140 150 L170 150 L170 166 L250 166 L250 154 L300 154 L300 170 L360 170 L360 150 L420 150 L420 166 L480 166 L480 156 L540 156 L540 170 L640 170 L640 152 L690 152 L690 166 L760 166 L760 156 L800 156 L800 200 Z"
      />
      {/* fenêtres allumées */}
      <g fill={win} opacity={tone === 'dusk' ? 0.8 : 0.5}>
        {[[100, 108], [106, 116], [236, 100], [244, 112], [252, 104], [386, 112], [524, 106], [532, 118], [706, 116], [714, 124], [38, 126], [168, 118]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={4} height={5} />
        ))}
      </g>
      {/* palmiers */}
      {[60, 210, 330, 470, 680, 770].map((x, i) => (
        <g key={x} transform={`translate(${x} ${150 - (i % 2) * 6})`} fill={near}>
          <path d="M-2 50 Q0 20 3 0 L6 0 Q4 22 4 50 Z" />
          <g className="kf-wiggle" style={{ animationDelay: `${i * 0.3}s` }}>
            <path d="M4 0 Q-14 -6 -24 6 Q-10 -2 4 2 Z" />
            <path d="M4 0 Q22 -6 30 6 Q16 -2 4 2 Z" />
            <path d="M4 0 Q-6 -16 -18 -16 Q-6 -10 4 0 Z" />
            <path d="M4 0 Q14 -16 26 -14 Q14 -10 4 0 Z" />
          </g>
        </g>
      ))}
    </svg>
  );
}

/** Tête du narrateur. L'humeur change le visage. */
export function YaFlowAvatar({ mood = 'neutre', className }: { mood?: Mood; className?: string }) {
  const mouth =
    mood === 'bloque' ? 'M20 34 Q24 31 28 34'
      : mood === 'dense' || mood === 'pluie' ? 'M20 33 L28 33'
        : 'M19 32 Q24 37 29 32';
  return (
    <svg viewBox="0 0 48 48" className={cn('shrink-0', className)} aria-hidden="true">
      <circle cx={24} cy={24} r={24} fill={mood === 'bloque' ? '#7F1D1D' : mood === 'fluide' ? '#065F46' : '#11273A'} />
      <circle cx={24} cy={28} r={12} fill={SKIN} />
      <path d="M10 27 Q10 8 24 8 Q38 8 38 27 L34 27 L33 22 L15 22 L14 27 Z" fill={YELLOW} stroke={INK} strokeWidth={1} />
      <path d="M14 13 Q24 7 34 13" stroke={BLUE} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <g className="kf-blink">
        <circle cx={20} cy={27} r={1.6} fill={INK} />
        <circle cx={28} cy={27} r={1.6} fill={INK} />
      </g>
      {mood === 'bloque' && <path d="M17 23 L22 24.5 M31 23 L26 24.5" stroke={INK} strokeWidth={1.3} strokeLinecap="round" />}
      <path d={mouth} stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {mood === 'pluie' && <path d="M38 30 Q40 34 38 36 Q36 34 38 30 Z" fill="#7DD3FC" />}
    </svg>
  );
}
