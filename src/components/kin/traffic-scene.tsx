'use client';

/**
 * Scène d'accueil : une voiture coincée dans le trafic « stop-and-go » d'un boulevard de Kin, au
 * coucher du soleil. Tout est dessiné en SVG ; une seule boucle requestAnimationFrame fait avancer
 * les plans (parallaxe), les véhicules voisins, les roues et les feux stop, à la même vitesse.
 *
 * Coupée hors écran, onglet caché ou si l'usager demande moins de mouvement.
 */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { KinSkyline } from './illustrations';
import { Bus207, Car, FulaFula, Moto, Person } from './vehicles';

const VW = 1600;
const VH = 600;
const CURB = 404; // haut du trottoir
const ROAD = 444; // haut de la chaussée
const LANE_ONC = 512; // sol de la voie d'en face
const LANE_OURS = 592; // sol de notre voie

/** Profil de vitesse « stop-and-go » (px/s), période 10 s : ça roule, ça freine, ça s'arrête. */
const T = 10;
const VMAX = 150;
const speedAt = (t: number) => {
  const p = ((t % T) + T) % T / T;
  const raw = (Math.sin(2 * Math.PI * p) + 0.32) / 1.32;
  return VMAX * Math.max(0, Math.min(1, raw)) ** 1.2;
};
/** Distance parcourue D(t), tabulée sur une période puis prolongée (le profil est périodique). */
const TABLE = (() => {
  const n = 400, out = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) out[i] = out[i - 1] + speedAt(((i - 0.5) / n) * T) * (T / n);
  return out;
})();
const PERIOD_D = TABLE[TABLE.length - 1];
const distAt = (t: number) => {
  const k = Math.floor(t / T), r = (t - k * T) / T * (TABLE.length - 1);
  const i = Math.floor(r), f = r - i;
  return k * PERIOD_D + TABLE[i] + (TABLE[Math.min(i + 1, TABLE.length - 1)] - TABLE[i]) * f;
};
const wrap = (x: number, min: number, range: number) => ((((x - min) % range) + range) % range) + min;

export function TrafficHeroScene({ className, street = 'Bd du 30 Juin' }: { className?: string; street?: string }) {
  const root = useRef<SVGSVGElement>(null);
  const brake = useRef<SVGRectElement>(null);
  const busBrake = useRef<SVGRectElement>(null);
  const speedTxt = useRef<HTMLSpanElement>(null);
  const stateTxt = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const layers = Array.from(svg.querySelectorAll<SVGGElement>('[data-par]')).map(el => ({
      el, f: Number(el.dataset.par), tile: Number(el.dataset.tile || VW),
    }));
    const lane = Array.from(svg.querySelectorAll<SVGGElement>('[data-lane]')).map(el => ({
      el, base: Number(el.dataset.base), dt: Number(el.dataset.dt || 0),
    }));
    const onc = Array.from(svg.querySelectorAll<SVGGElement>('[data-onc]')).map(el => ({
      el, base: Number(el.dataset.base), sp: Number(el.dataset.onc),
    }));
    const motos = Array.from(svg.querySelectorAll<SVGGElement>('[data-moto]')).map(el => ({
      el, base: Number(el.dataset.base), sp: Number(el.dataset.moto),
    }));
    const wheels = Array.from(svg.querySelectorAll<SVGGElement>('[data-wheel]')).map(el => ({
      el, onc: el.dataset.wheel === 'onc', cx: el.dataset.cx, cy: el.dataset.cy, r: Number(el.dataset.r || 17),
    }));

    let t = 0, raf = 0, last = 0, running = false, lastHud = -1, lastStopped: boolean | null = null;

    const draw = () => {
      const d = distAt(t);
      const v = speedAt(t);
      for (const L of layers) L.el.setAttribute('transform', `translate(${-((d * L.f) % L.tile)} 0)`);
      for (const c of lane) c.el.setAttribute('transform', `translate(${c.base + distAt(t + c.dt) - d} 0)`);
      for (const c of onc) c.el.setAttribute('transform', `translate(${wrap(c.base - d - c.sp * t, -700, VW + 1400)} 0)`);
      for (const m of motos) m.el.setAttribute('transform', `translate(${wrap(m.base + m.sp * t, -400, VW + 800)} 0)`);
      for (const w of wheels) {
        const dist = w.onc ? d + 90 * t : d;
        w.el.setAttribute('transform', `rotate(${((dist / w.r) * 57.2958) % 360} ${w.cx} ${w.cy})`);
      }
      const braking = v < VMAX * 0.55 && speedAt(t + 0.15) <= v;
      brake.current?.setAttribute('fill', braking || v < 4 ? '#FF2D2D' : '#B91C1C');
      busBrake.current?.setAttribute('fill', speedAt(t + 0.35) < VMAX * 0.5 ? '#FF2D2D' : '#B91C1C');
      const kmh = Math.round((v / VMAX) * 28);
      if (kmh !== lastHud && speedTxt.current) { speedTxt.current.textContent = String(kmh); lastHud = kmh; }
      const stopped = v < 6;
      if (stopped !== lastStopped) {
        lastStopped = stopped;
        if (stateTxt.current) stateTxt.current.textContent = stopped ? 'Nzela ekangami' : 'Ça avance… malembe';
        if (bubble.current) {
          bubble.current.textContent = stopped ? 'Ah, bouchon encore !' : 'Tokende !';
          bubble.current.dataset.on = '1';
          bubble.current.animate?.([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1, offset: 0.2 }, { transform: 'scale(1)', opacity: 1, offset: 0.8 }, { transform: 'scale(.95)', opacity: 0 }], { duration: 2600, easing: 'ease-out' });
        }
      }
    };

    const frame = (now: number) => {
      if (!running) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now; t += dt;
      draw();
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    t = 1.2; // démarre en pleine accélération
    draw();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible && !document.hidden ? start() : stop(); });
    io.observe(svg);
    const onVis = () => (visible && !document.hidden ? start() : stop());
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return (
    <div className={cn('relative overflow-hidden isolate bg-[#2A1B45]', className)}>
      <svg ref={root} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" role="img" aria-label={`Une voiture dans le trafic dense de Kinshasa, ${street}, au coucher du soleil`}>
        <defs>
          <linearGradient id="kf-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1C1440" />
            <stop offset="0.35" stopColor="#5B2A63" />
            <stop offset="0.6" stopColor="#C2546A" />
            <stop offset="0.78" stopColor="#F49A5A" />
            <stop offset="1" stopColor="#FFD58A" />
          </linearGradient>
          <radialGradient id="kf-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFF4C7" />
            <stop offset="0.45" stopColor="#FFD27A" stopOpacity={0.9} />
            <stop offset="1" stopColor="#FF9F45" stopOpacity={0} />
          </radialGradient>
          <linearGradient id="kf-asphalt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3B3F47" />
            <stop offset="1" stopColor="#24272D" />
          </linearGradient>
          <linearGradient id="kf-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F49A5A" stopOpacity={0} />
            <stop offset="1" stopColor="#F49A5A" stopOpacity={0.45} />
          </linearGradient>
          <pattern id="kf-pave" width="48" height="40" patternUnits="userSpaceOnUse">
            <rect width="48" height="40" fill="#9C8F7D" />
            <path d="M0 0 L48 0 M0 20 L48 20 M24 0 L24 20 M0 20 L0 40" stroke="#857967" strokeWidth="2" />
          </pattern>
        </defs>

        {/* ciel + soleil */}
        <rect width={VW} height={VH} fill="url(#kf-sky)" />
        <circle cx={1120} cy={300} r={170} fill="url(#kf-sun)" />
        <circle cx={1120} cy={300} r={62} fill="#FFF1C2" />

        {/* nuages */}
        <g data-par="0.03" data-tile={VW} opacity={0.55}>
          {[0, VW].map(o => (
            <g key={o} transform={`translate(${o} 0)`} fill="#FFC6A8">
              <ellipse cx={240} cy={120} rx={160} ry={14} />
              <ellipse cx={330} cy={104} rx={90} ry={10} />
              <ellipse cx={900} cy={80} rx={200} ry={12} />
              <ellipse cx={1380} cy={150} rx={140} ry={10} />
            </g>
          ))}
        </g>

        {/* Kin lointaine, avec la Tour de l'Échangeur */}
        <g data-par="0.08" data-tile={VW}>
          {[0, VW].map(o => <KinSkyline key={o} tone="haze" x={o} y={60} width={VW} height={360} />)}
        </g>
        <rect y={260} width={VW} height={160} fill="url(#kf-haze)" />

        {/* plan moyen : immeubles et palmiers */}
        <g data-par="0.4" data-tile={VW}>
          {[0, VW].map(o => <MidRow key={o} x={o} />)}
        </g>

        {/* rue : boutiques, trottoir, piétons */}
        <g data-par="1" data-tile={VW}>
          {[0, VW].map(o => <StreetBlock key={o} x={o} />)}
        </g>

        {/* chaussée */}
        <rect y={ROAD} width={VW} height={VH - ROAD} fill="url(#kf-asphalt)" />
        <g data-par="1" data-tile={VW}>
          {[0, VW].map(o => (
            <g key={o} transform={`translate(${o} 0)`}>
              <rect x={0} y={ROAD + 6} width={VW} height={3} fill="#E5E7EB" opacity={0.5} />
              {Array.from({ length: 16 }, (_, i) => <rect key={i} x={i * 100} y={LANE_ONC + 6} width={56} height={6} rx={2} fill="#FACC15" opacity={0.85} />)}
              {/* rapiéçages et libulu */}
              <path d="M220 560 q40 -12 90 -2 q20 14 -20 22 q-50 6 -70 -20 z" fill="#2E3238" />
              <ellipse cx={980} cy={578} rx={46} ry={8} fill="#1A1D22" />
              <ellipse cx={976} cy={576} rx={30} ry={4} fill="#5B7FA3" opacity={0.7} />
              <path d="M1380 470 q60 -8 120 4 q-30 16 -120 -4 z" fill="#2E3238" />
              <rect x={0} y={VH - 6} width={VW} height={6} fill="#1A1D22" />
            </g>
          ))}
        </g>

        {/* voie d'en face : ça coule un peu mieux */}
        <g>
          <g data-onc="70" data-base={-200} transform="translate(-200 0)"><FulaFula y={LANE_ONC} scale={0.62} flip lane="onc" /></g>
          <g data-onc="70" data-base={260} transform="translate(260 0)"><Car kind="sedan" body="#F8FAFC" y={LANE_ONC} scale={0.7} flip lane="onc" headlights /></g>
          <g data-onc="70" data-base={560} transform="translate(560 0)"><Bus207 y={LANE_ONC} scale={0.62} flip lane="onc" /></g>
          <g data-onc="70" data-base={860} transform="translate(860 0)"><Car kind="sedan" body="#FACC15" taxi y={LANE_ONC} scale={0.7} flip lane="onc" /></g>
          <g data-onc="70" data-base={1130} transform="translate(1130 0)"><Car kind="suv" body="#1F2937" y={LANE_ONC} scale={0.7} flip lane="onc" headlights /></g>
          <g data-onc="70" data-base={1420} transform="translate(1420 0)"><Car kind="hatch" body="#B91C1C" y={LANE_ONC} scale={0.7} flip lane="onc" /></g>
          <g data-onc="70" data-base={1720} transform="translate(1720 0)"><Bus207 y={LANE_ONC} scale={0.62} flip lane="onc" /></g>
        </g>

        {/* moto qui se faufile entre les files */}
        <g data-moto="85" data-base={100} transform="translate(100 0)"><Moto y={LANE_ONC + 34} scale={0.62} /></g>

        {/* notre file : accordéon du bouchon */}
        <g data-lane data-base={-330} transform="translate(-330 0)" data-dt={-0.6}><Car kind="suv" body="#E5E7EB" y={LANE_OURS} scale={1.05} roofRack /></g>
        <g data-lane data-base={-20} transform="translate(-20 0)" data-dt={-0.3}>
          <Car kind="sedan" body="#FACC15" taxi y={LANE_OURS} scale={1.08} />
          <text x={250} y={LANE_OURS - 150} className="kf-pop" style={{ animationDelay: '2s', animationDuration: '7s', transformBox: 'fill-box', transformOrigin: 'bottom left' }} fontSize={26} fontFamily="Anton, Impact, sans-serif" fill="#FFF" stroke="#0B1118" strokeWidth={5} paintOrder="stroke">PIN PIN !</text>
        </g>
        <g data-lane data-base={1050} transform="translate(1050 0)" data-dt={1.0}><Bus207 y={LANE_OURS} scale={1.02} brakeRef={busBrake} /></g>
        <g data-lane data-base={1420} transform="translate(1420 0)" data-dt={1.3}><Car kind="hatch" body="#16A34A" y={LANE_OURS} scale={1.08} /></g>

        {/* la voiture Kinshasa Flow */}
        <g transform="translate(660 0)">
          <Car kind="hatch" body="#2EB6F0" y={LANE_OURS} scale={1.18} brakeRef={brake} headlights />
        </g>
      </svg>

      {/* tableau de bord façon jeu */}
      <div className="pointer-events-none absolute left-3 top-3 sm:left-6 sm:top-6 flex items-stretch gap-2">
        <div className="rounded-xl bg-[#0B1118]/80 backdrop-blur px-3 py-2 border border-white/10">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">{street}</div>
          <div className="flex items-baseline gap-1 text-white">
            <span ref={speedTxt} className="font-display text-3xl leading-none tabular-nums text-[#FFD23F]">0</span>
            <span className="text-[10px] font-bold text-white/60">km/h</span>
          </div>
        </div>
        <div className="hidden sm:flex flex-col justify-center rounded-xl bg-[#0B1118]/80 backdrop-blur px-3 py-2 border border-white/10">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">État</div>
          <span ref={stateTxt} className="text-sm font-black text-white">Ça avance… malembe</span>
        </div>
      </div>
      <div className="pointer-events-none absolute left-1/2 bottom-[34%] -translate-x-[10%]">
        <div ref={bubble} className="rounded-2xl rounded-bl-none bg-white px-3 py-1.5 text-xs sm:text-sm font-black text-[#0B1622] shadow-lg opacity-0" />
      </div>
    </div>
  );
}

/** Plan moyen (vitesse 0,4) : immeubles sombres contre le soleil, palmiers, château d'eau. */
function MidRow({ x }: { x: number }) {
  const blocks: Array<[number, number, number]> = [[0, 150, 140], [160, 110, 200], [280, 170, 120], [470, 90, 230], [580, 200, 150], [800, 120, 180], [940, 160, 110], [1120, 100, 210], [1240, 180, 140], [1440, 160, 170]];
  return (
    <g transform={`translate(${x} 0)`}>
      {blocks.map(([bx, w, h], i) => (
        <g key={bx}>
          <rect x={bx} y={CURB - h} width={w} height={h} fill={i % 2 ? '#4A3358' : '#3F2C4E'} />
          {Array.from({ length: Math.floor(h / 34) }, (_, r) => Array.from({ length: Math.floor(w / 34) }, (_, c) => (
            ((r + c + i) % 3 !== 0) && <rect key={`${r}-${c}`} x={bx + 12 + c * 32} y={CURB - h + 14 + r * 30} width={12} height={14} fill="#FFC870" opacity={0.55 + ((r * c) % 3) * 0.12} />
          )))}
        </g>
      ))}
      {/* château d'eau */}
      <g fill="#3A2848">
        <rect x={752} y={CURB - 250} width={8} height={250} /><rect x={790} y={CURB - 250} width={8} height={250} />
        <path d="M740 140 L810 140 L800 170 L750 170 Z" />
      </g>
      {[120, 450, 1010, 1380].map(px => (
        <g key={px} transform={`translate(${px} ${CURB})`} fill="#2E2140">
          <path d="M-3 0 Q0 -90 6 -170 L10 -170 Q6 -90 4 0 Z" />
          <path d="M8 -170 Q-30 -186 -52 -160 Q-26 -176 8 -166 Z M8 -170 Q44 -188 66 -160 Q38 -176 8 -166 Z M8 -170 Q-6 -206 -34 -208 Q-12 -194 8 -168 Z M8 -170 Q24 -206 54 -204 Q30 -194 8 -168 Z" />
        </g>
      ))}
    </g>
  );
}

/** Le front de rue (vitesse 1) : boutiques peintes à la main, trottoir, lampadaires, piétons. */
function StreetBlock({ x }: { x: number }) {
  const B = CURB;
  return (
    <g transform={`translate(${x} 0)`}>
      {/* 1. Alimentation */}
      <rect x={0} y={B - 150} width={230} height={150} fill="#2F855A" />
      <rect x={0} y={B - 150} width={230} height={10} fill="#22543D" />
      <rect x={12} y={B - 132} width={206} height={34} fill="#F7FAFC" />
      <text x={115} y={B - 108} fontSize={20} textAnchor="middle" fill="#22543D" fontFamily="Anton, Impact, sans-serif">ALIMENTATION NZAMBE NA BISO</text>
      <path d={`M6 ${B - 92} L224 ${B - 92} L232 ${B - 72} L-2 ${B - 72} Z`} fill="#E53E3E" />
      {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${6 + i * 38} ${B - 92} L${24 + i * 38} ${B - 92} L${28 + i * 38} ${B - 72} L${8 + i * 38} ${B - 72} Z`} fill="#F7FAFC" />)}
      <rect x={20} y={B - 66} width={190} height={66} fill="#1A2E22" />
      {[30, 70, 110, 150].map(px => <rect key={px} x={px} y={B - 30} width={30} height={30} fill="#C05621" stroke="#7B341E" />)}
      {[34, 76, 116].map(px => <circle key={px} cx={px + 10} cy={B - 36} r={7} fill={px % 2 ? '#ECC94B' : '#48BB78'} />)}

      {/* 2. Pharmacie */}
      <rect x={232} y={B - 190} width={186} height={190} fill="#EDF2F7" />
      <rect x={232} y={B - 190} width={186} height={12} fill="#CBD5E0" />
      <rect x={250} y={B - 160} width={150} height={30} fill="#38A169" />
      <text x={325} y={B - 138} fontSize={20} textAnchor="middle" fill="#fff" fontFamily="Anton, Impact, sans-serif" letterSpacing={2}>PHARMACIE</text>
      <g transform={`translate(400 ${B - 196})`}>
        <rect x={-6} y={-6} width={34} height={34} rx={4} fill="#0B1118" />
        <path d="M8 0 h6 v8 h8 v6 h-8 v8 h-6 v-8 h-8 v-6 h8 z" fill="#4ADE80" className="kf-beam" />
      </g>
      <rect x={250} y={B - 116} width={70} height={116} fill="#2D3748" />
      <rect x={330} y={B - 116} width={70} height={70} fill="#90CDF4" opacity={0.6} />

      {/* 3. Salon de coiffure, deux étages */}
      <rect x={420} y={B - 230} width={220} height={230} fill="#D53F8C" />
      <rect x={430} y={B - 216} width={60} height={50} fill="#2D3748" /><rect x={570} y={B - 216} width={60} height={50} fill="#FFC870" />
      <rect x={420} y={B - 160} width={220} height={8} fill="#702459" />
      <path d={`M440 ${B - 160} L440 ${B - 176} M460 ${B - 160} L460 ${B - 176} M480 ${B - 160} L480 ${B - 176}`} stroke="#702459" strokeWidth={3} />
      {/* linge au balcon */}
      <path d={`M500 ${B - 190} Q530 ${B - 180} 560 ${B - 190}`} stroke="#1A202C" fill="none" />
      <rect x={508} y={B - 186} width={14} height={18} fill="#F6E05E" /><rect x={530} y={B - 184} width={12} height={16} fill="#63B3ED" />
      <rect x={430} y={B - 144} width={200} height={50} fill="#FFFFF0" stroke="#1A202C" strokeWidth={2} />
      <text x={530} y={B - 112} fontSize={22} textAnchor="middle" fill="#1A202C" fontFamily="Anton, Impact, sans-serif">SALON CHEZ PAPY</text>
      <circle cx={448} cy={B - 120} r={10} fill="#4E2C17" /><path d={`M438 ${B - 124} Q448 ${B - 140} 458 ${B - 124}`} fill="#1A202C" />
      <circle cx={612} cy={B - 120} r={10} fill="#6B3F22" /><path d={`M602 ${B - 122} Q612 ${B - 132} 622 ${B - 122}`} fill="#1A202C" />
      <rect x={440} y={B - 86} width={80} height={86} fill="#1A202C" />
      <rect x={540} y={B - 86} width={88} height={60} fill="#FBD38D" opacity={0.7} />

      {/* 4. Nganda (bar) avec guirlande */}
      <rect x={642} y={B - 140} width={230} height={140} fill="#2B6CB0" />
      <rect x={656} y={B - 128} width={202} height={30} fill="#FAF089" />
      <text x={757} y={B - 105} fontSize={20} textAnchor="middle" fill="#2A4365" fontFamily="Anton, Impact, sans-serif">NGANDA BOLINGO · MUSIQUE</text>
      <path d={`M642 ${B - 92} Q757 ${B - 70} 872 ${B - 92}`} stroke="#1A202C" strokeWidth={1.5} fill="none" />
      {Array.from({ length: 9 }, (_, i) => {
        const px = 660 + i * 24, py = B - 92 + Math.sin((i / 8) * Math.PI) * 11;
        return <circle key={i} cx={px} cy={py + 2} r={3.5} fill={['#F56565', '#F6E05E', '#68D391', '#63B3ED'][i % 4]} className="kf-beam" style={{ animationDelay: `${i * 0.18}s` }} />;
      })}
      <rect x={660} y={B - 70} width={200} height={70} fill="#1A365D" />
      {[676, 720, 770, 812].map(px => (
        <g key={px}>
          <rect x={px} y={B - 22} width={20} height={4} fill="#F7FAFC" /><path d={`M${px + 2} ${B - 18} L${px + 2} ${B} M${px + 18} ${B - 18} L${px + 18} ${B}`} stroke="#F7FAFC" strokeWidth={2} />
          <rect x={px + 6} y={B - 34} width={6} height={12} rx={2} fill="#8B5E34" />
        </g>
      ))}

      {/* 5. Kiosque Mobile Money sous parasol */}
      <rect x={880} y={B - 60} width={120} height={60} fill="#ECC94B" stroke="#B7791F" strokeWidth={2} />
      <text x={940} y={B - 34} fontSize={16} textAnchor="middle" fill="#1A202C" fontFamily="Anton, Impact, sans-serif">MOBILE MONEY</text>
      <text x={940} y={B - 14} fontSize={11} textAnchor="middle" fill="#1A202C" fontWeight={800} fontFamily="sans-serif">DÉPÔT · RETRAIT · CRÉDIT</text>
      <path d={`M932 ${B - 60} L936 ${B - 130}`} stroke="#4A5568" strokeWidth={3} />
      <path d={`M870 ${B - 112} Q936 ${B - 160} 1002 ${B - 112} Z`} fill="#E53E3E" />
      <path d={`M903 ${B - 122} Q936 ${B - 150} 936 ${B - 136} M969 ${B - 122} Q936 ${B - 150} 936 ${B - 136}`} stroke="#fff" strokeWidth={6} fill="none" opacity={0.85} />

      {/* 6. Immeuble avec panneau publicitaire */}
      <rect x={1010} y={B - 280} width={240} height={280} fill="#ED8936" />
      {Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => (
        <rect key={`${r}${c}`} x={1026 + c * 56} y={B - 262 + r * 56} width={36} height={36} fill={(r + c) % 3 ? '#2D3748' : '#FFE8A3'} />
      )))}
      <rect x={1150} y={B - 302} width={40} height={22} fill="#A0AEC0" />
      <circle cx={1050} cy={B - 290} r={10} fill="#E2E8F0" /><path d={`M1050 ${B - 290} L1050 ${B - 280}`} stroke="#A0AEC0" strokeWidth={3} />
      <g transform={`translate(1040 ${B - 388})`}>
        <path d="M40 120 L40 100 M180 120 L180 100" stroke="#2D3748" strokeWidth={6} />
        <rect width={220} height={100} rx={4} fill="#0B1118" stroke="#FFD23F" strokeWidth={3} />
        <text x={110} y={42} fontSize={30} textAnchor="middle" fill="#FFD23F" fontFamily="Anton, Impact, sans-serif">BOUCHON ?</text>
        <text x={110} y={74} fontSize={16} textAnchor="middle" fill="#fff" fontFamily="Anton, Impact, sans-serif" letterSpacing={1}>KINSHASA FLOW SAIT OÙ PASSER</text>
        <rect x={0} y={0} width={220} height={100} rx={4} className="kf-shine" style={{ fill: 'none' }} />
      </g>
      <rect x={1030} y={B - 64} width={100} height={64} fill="#1A202C" />
      <rect x={1150} y={B - 64} width={80} height={44} fill="#FBD38D" opacity={0.7} />

      {/* 7. Quincaillerie */}
      <rect x={1252} y={B - 170} width={348} height={170} fill="#718096" />
      <rect x={1270} y={B - 156} width={312} height={36} fill="#1A202C" />
      <text x={1426} y={B - 130} fontSize={22} textAnchor="middle" fill="#F6E05E" fontFamily="Anton, Impact, sans-serif" letterSpacing={1}>QUINCAILLERIE MOKILI MOBIMBA</text>
      <rect x={1270} y={B - 110} width={312} height={110} fill="#2D3748" />
      {[1290, 1340, 1390, 1440, 1490, 1540].map((px, i) => <rect key={px} x={px} y={B - 52 - (i % 2) * 20} width={36} height={52 + (i % 2) * 20} fill={['#C53030', '#2B6CB0', '#D69E2E'][i % 3]} />)}

      {/* lampadaires + fils électriques */}
      {[214, 626, 1004, 1404].map(px => (
        <g key={px}>
          <rect x={px - 3} y={B - 250} width={6} height={250} fill="#2D3748" />
          <path d={`M${px} ${B - 250} Q${px + 30} ${B - 262} ${px + 46} ${B - 248}`} stroke="#2D3748" strokeWidth={5} fill="none" />
          <rect x={px + 34} y={B - 250} width={24} height={8} rx={3} fill="#FFF3C4" />
          <path d={`M${px + 36} ${B - 242} L${px + 6} ${B} L${px + 86} ${B} L${px + 56} ${B - 242} Z`} fill="#FFF3C4" opacity={0.08} />
        </g>
      ))}
      <path d={`M-10 ${B - 236} Q100 ${B - 210} 214 ${B - 236} Q420 ${B - 200} 626 ${B - 236} Q815 ${B - 204} 1004 ${B - 236} Q1204 ${B - 202} 1404 ${B - 236} Q1505 ${B - 214} 1610 ${B - 236}`} stroke="#1A202C" strokeWidth={1.5} fill="none" />

      {/* trottoir */}
      <rect x={0} y={B} width={VW} height={ROAD - B - 6} fill="url(#kf-pave)" />
      <rect x={0} y={ROAD - 8} width={VW} height={8} fill="#CBD5E0" />
      {Array.from({ length: 32 }, (_, i) => <rect key={i} x={i * 50} y={ROAD - 8} width={25} height={8} fill="#E53E3E" opacity={0.8} />)}

      {/* piétons */}
      <Person kind="mama" x={150} y={ROAD - 12} />
      <Person kind="walker" shirt="#F6E05E" x={340} y={ROAD - 14} flip />
      <Person kind="kid" shirt="#E53E3E" x={372} y={ROAD - 14} flip />
      <Person kind="walker" shirt="#F7FAFC" x={700} y={ROAD - 12} walk={false} />
      <Person kind="roulage" x={1000} y={ROAD - 10} walk={false} />
      <Person kind="mama" x={1300} y={ROAD - 14} flip />
      <Person kind="walker" shirt="#9F7AEA" x={1480} y={ROAD - 12} />
    </g>
  );
}
