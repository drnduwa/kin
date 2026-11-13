'use client';

/**
 * Intro cinématique de Kinshasa Flow (≈ 7 s), jouée une fois par session sur l'accueil.
 *
 * 1. Kinshasa, la nuit : route mouillée en perspective, bouchon de feux stop rouges.
 * 2. Un trait de lumière bleue — le « flow » — se faufile dans le bouchon ; les feux passent au vert.
 * 3. Le trait dessine le marqueur Kinshasa Flow : éclair, onde de choc, saut en hyper-vitesse.
 * 4. KINSHASA / FLOW / « Kin bouge. Toi, tu passes. »
 * 5. Ouverture circulaire depuis le marqueur sur la page d'accueil.
 *
 * « Passer » à tout moment (bouton ou Échap). Rien n'est joué si l'usager demande moins de mouvement.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate as animateValue, stagger, useAnimate } from 'framer-motion';
import { KinSkyline } from './illustrations';
import { FlowWord, PIN_PATH, PinShape } from './brand';

const VW = 1600, VH = 900, VPX = 800, VPY = 430;

type Light = { id: number; s: number; x: number; y: number; w: number; r: number; tail: boolean };

/** Voitures en perspective : feux stop (notre sens, à gauche) et phares (en face, à droite). */
function buildTraffic(): Light[] {
  const out: Light[] = [];
  let id = 0;
  const lanes: Array<[number, boolean]> = [[150, true], [470, true], [700, true], [980, false], [1330, false]];
  lanes.forEach(([bx, tail], li) => {
    let s = 0.05 + li * 0.006;
    while (s < 1.08) {
      out.push({ id: id++, s, x: VPX + (bx - VPX) * s, y: VPY + (VH - VPY + 40) * s, w: 64 * s, r: 2 + 20 * s, tail });
      s *= tail ? 1.3 : 1.42;
    }
  });
  return out.sort((a, b) => b.s - a.s);
}

export function FlowIntro({ onDone }: { onDone: () => void }) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const streakRef = useRef<SVGPathElement>(null);
  const coreRef = useRef<SVGPathElement>(null);
  const headRef = useRef<SVGCircleElement>(null);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const finished = useRef(false);
  const traffic = useMemo(buildTraffic, []);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  // Où se trouve le marqueur HTML dans le repère du SVG ? (pour que le trait finisse pile dedans)
  useLayoutEffect(() => {
    const measure = () => {
      const svg = svgRef.current, el = pinRef.current;
      const m = svg?.getScreenCTM();
      if (!svg || !el || !m) return;
      const r = el.getBoundingClientRect();
      const pt = svg.createSVGPoint();
      pt.x = r.left + r.width / 2; pt.y = r.top + r.height * 0.36;
      const p = pt.matrixTransform(m.inverse());
      setPin({ x: p.x, y: p.y });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const streakD = pin
    ? `M560 ${VH + 40} C600 780 760 760 730 650 C700 560 880 560 840 ${Math.max(pin.y + 120, 470)} C820 ${pin.y + 70} ${pin.x} ${pin.y + 60} ${pin.x} ${pin.y}`
    : '';

  useEffect(() => {
    if (!pin || !scope.current) return;
    const root = scope.current;
    const wait = (s: number) => new Promise(r => setTimeout(r, s * 1000));
    let alive = true;

    const run = async () => {
      await animate('[data-world]', { opacity: [0, 1] }, { duration: 0.5 });
      // 1. Le bouchon
      animate('[data-world]', { scale: [1, 1.05] }, { duration: 2.8, ease: 'linear' });
      animate('[data-cap1]', { opacity: [0, 1], y: [10, 0] }, { duration: 0.6, delay: 0.15 });
      await wait(1.25);
      if (!alive) return;

      // 2. Le flow traverse le bouchon
      animate('[data-cap1]', { opacity: 0, y: -8 }, { duration: 0.35 });
      animate('[data-cap2]', { opacity: [0, 1], y: [10, 0] }, { duration: 0.5, delay: 0.25 });
      const path = streakRef.current!, core = coreRef.current!, head = headRef.current!;
      const L = path.getTotalLength();
      [path, core].forEach(p => { p.style.strokeDasharray = `${L}`; p.style.strokeDashoffset = `${L}`; });
      const cars = Array.from(root.querySelectorAll<SVGGElement>('[data-car]'));
      head.style.opacity = '1';
      await animateValue(0, 1, {
        duration: 1.35, ease: [0.45, 0, 0.2, 1],
        onUpdate: p => {
          const off = `${L * (1 - p)}`;
          path.style.strokeDashoffset = off; core.style.strokeDashoffset = off;
          const pt = path.getPointAtLength(L * p);
          head.setAttribute('cx', `${pt.x}`); head.setAttribute('cy', `${pt.y}`);
          // les feux que le trait a dépassés passent au vert
          for (const c of cars) if (!c.dataset.go && Number(c.dataset.y) > pt.y - 10) { c.dataset.go = '1'; c.classList.add('kf-go'); }
        },
      });
      if (!alive) return;
      root.dataset.flowing = '1';
      head.style.opacity = '0';

      // 3. Le marqueur naît
      animate('[data-cap2]', { opacity: 0 }, { duration: 0.3 });
      await animate('[data-pin-outline]', { strokeDashoffset: [1, 0] }, { duration: 0.45, ease: 'easeOut' });
      animate('[data-pin-fill]', { opacity: [0, 1], scale: [0.4, 1] }, { type: 'spring', stiffness: 240, damping: 13 });
      animate('[data-pin-outline]', { opacity: 0 }, { duration: 0.4, delay: 0.2 });
      animate('[data-flash]', { opacity: [0, 0.7, 0] }, { duration: 0.55, ease: 'easeOut' });
      animate('[data-ring]', { scale: [0.3, 9], opacity: [0.9, 0] }, { duration: 1.2, ease: [0.1, 0.7, 0.3, 1], delay: stagger(0.14) });
      animate('[data-warp]', { strokeDashoffset: [0, -1700], opacity: [0, 1, 0] }, { duration: 1.05, ease: 'easeIn', delay: stagger(0.006) });
      animate('[data-world]', { scale: 1.9, opacity: 0.18 }, { duration: 1.1, ease: [0.6, 0, 0.4, 1] });
      animate('[data-streak]', { opacity: 0 }, { duration: 0.6 });
      await wait(0.45);
      if (!alive) return;

      // 4. Le nom
      animate('[data-letter]', { opacity: [0, 1], y: [26, 0], filter: ['blur(10px)', 'blur(0px)'] }, { duration: 0.55, delay: stagger(0.045) });
      await wait(0.4);
      animate('[data-flow]', { clipPath: ['inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 0%)'], y: [20, 0] }, { duration: 0.65, ease: [0.2, 0.8, 0.2, 1] });
      animate('[data-shine]', { x: [-90, 190] }, { duration: 1, delay: 0.25, ease: 'easeInOut' });
      await wait(0.75);
      animate('[data-tag]', { opacity: [0, 1], y: [12, 0], letterSpacing: ['0.4em', '0.08em'] }, { duration: 0.7 });
      await wait(1.25);
      if (!alive) return;

      // 5. Ouverture sur la ville
      animate('[data-lockup]', { scale: 0.75, opacity: 0, y: -30 }, { duration: 0.7, ease: [0.6, 0, 0.4, 1] });
      animate('[data-skip]', { opacity: 0 }, { duration: 0.3 });
      await animate(root, { '--r': ['0vmax', '150vmax'] } as never, { duration: 1.05, ease: [0.7, 0, 0.3, 1] });
      finish();
    };
    run();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const warp = useMemo(() => Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * Math.PI * 2 + (i % 3) * 0.03;
    return { a, len: 120 + ((i * 53) % 260), w: 1 + (i % 4) * 0.8, c: i % 5 === 0 ? '#FFFFFF' : i % 2 ? '#7DD3FC' : '#1E9BFF' };
  }), []);

  return (
    <div
      ref={scope}
      className="kf-intro fixed inset-0 z-[200] overflow-hidden bg-[#02050B] text-white"
      style={{
        ['--r' as string]: '0vmax',
        WebkitMaskImage: 'radial-gradient(circle at 50% 38%, transparent var(--r), #000 calc(var(--r) + 1px))',
        maskImage: 'radial-gradient(circle at 50% 38%, transparent var(--r), #000 calc(var(--r) + 1px))',
      }}
      role="dialog"
      aria-label="Intro Kinshasa Flow"
    >
      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="ki-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#02040A" />
            <stop offset="0.42" stopColor="#0A1633" />
            <stop offset="0.48" stopColor="#3A2340" />
          </linearGradient>
          <radialGradient id="ki-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FF8A3D" stopOpacity={0.55} />
            <stop offset="1" stopColor="#FF8A3D" stopOpacity={0} />
          </radialGradient>
          <linearGradient id="ki-road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0B0F18" />
            <stop offset="1" stopColor="#141A26" />
          </linearGradient>
          <radialGradient id="ki-red"><stop offset="0" stopColor="#FFE1E1" /><stop offset="0.18" stopColor="#FF2D3D" /><stop offset="0.5" stopColor="#FF2D3D" stopOpacity={0.35} /><stop offset="1" stopColor="#FF2D3D" stopOpacity={0} /></radialGradient>
          <radialGradient id="ki-green"><stop offset="0" stopColor="#E6FFF0" /><stop offset="0.18" stopColor="#22E07A" /><stop offset="0.5" stopColor="#22E07A" stopOpacity={0.35} /><stop offset="1" stopColor="#22E07A" stopOpacity={0} /></radialGradient>
          <radialGradient id="ki-white"><stop offset="0" stopColor="#FFFFFF" /><stop offset="0.2" stopColor="#FFF4CF" /><stop offset="0.55" stopColor="#FFE9A8" stopOpacity={0.3} /><stop offset="1" stopColor="#FFE9A8" stopOpacity={0} /></radialGradient>
          <linearGradient id="ki-refl-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF2D3D" stopOpacity={0.45} /><stop offset="1" stopColor="#FF2D3D" stopOpacity={0} /></linearGradient>
          <linearGradient id="ki-refl-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE9A8" stopOpacity={0.4} /><stop offset="1" stopColor="#FFE9A8" stopOpacity={0} /></linearGradient>
          <linearGradient id="ki-streak" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#1E9BFF" /><stop offset="1" stopColor="#7DD3FC" /></linearGradient>
          <filter id="ki-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
        </defs>

        <g data-world opacity={0} style={{ transformOrigin: `${VPX}px ${VPY}px`, transformBox: 'view-box' }}>
          <rect width={VW} height={VH} fill="url(#ki-sky)" />
          {/* étoiles */}
          {Array.from({ length: 50 }, (_, i) => (
            <circle key={i} cx={(i * 337) % VW} cy={(i * 191) % 300} r={i % 7 === 0 ? 1.6 : 0.9} fill="#fff" opacity={0.25 + (i % 5) * 0.1} className={i % 4 === 0 ? 'kf-beam' : undefined} style={{ animationDelay: `${i * 0.13}s` }} />
          ))}
          <ellipse cx={VPX} cy={VPY} rx={900} ry={170} fill="url(#ki-glow)" />
          <KinSkyline tone="dusk" x={0} y={VPY - 250} width={VW} height={260} />

          {/* route mouillée en perspective */}
          <path d={`M${VPX - 14} ${VPY} L${VPX + 14} ${VPY} L${VW + 300} ${VH} L-300 ${VH} Z`} fill="url(#ki-road)" />
          {[[260, '#FFFFFF', 0.25], [560, '#FFFFFF', 0.25], [790, '#FACC15', 0.6], [810, '#FACC15', 0.6], [1150, '#FFFFFF', 0.25]].map(([bx, col, op], i) => (
            <line key={i} className="kf-lane" x1={VPX + ((bx as number) - VPX) * 0.02} y1={VPY + 10} x2={bx as number} y2={VH + 40}
              stroke={col as string} strokeOpacity={op as number} strokeWidth={i === 2 || i === 3 ? 3 : 4} strokeDasharray={i === 2 || i === 3 ? undefined : '28 34'} />
          ))}

          {/* bouchon : chaque voiture = deux feux + leurs reflets sur la route mouillée */}
          {traffic.map(c => (
            <g key={c.id} data-car data-y={c.y} className="kf-car">
              {[-1, 1].map(side => (
                <g key={side}>
                  <rect x={c.x + side * c.w / 2 - c.r * 0.35} y={c.y + c.r * 0.6} width={c.r * 0.7} height={c.r * 5} fill={c.tail ? 'url(#ki-refl-r)' : 'url(#ki-refl-w)'} />
                  <circle cx={c.x + side * c.w / 2} cy={c.y} r={c.r * 2.4} fill={c.tail ? 'url(#ki-red)' : 'url(#ki-white)'} className={c.tail ? 'kf-red' : undefined} />
                  {c.tail && <circle cx={c.x + side * c.w / 2} cy={c.y} r={c.r * 2.4} fill="url(#ki-green)" className="kf-green" />}
                </g>
              ))}
            </g>
          ))}
        </g>

        {/* lignes d'hyper-vitesse, centrées sur le marqueur */}
        {pin && warp.map((w, i) => (
          <line key={i} data-warp x1={pin.x + Math.cos(w.a) * 60} y1={pin.y + Math.sin(w.a) * 60} x2={pin.x + Math.cos(w.a) * 1800} y2={pin.y + Math.sin(w.a) * 1800}
            stroke={w.c} strokeWidth={w.w} strokeLinecap="round" strokeDasharray={`${w.len} 1800`} opacity={0} />
        ))}

        {/* le trait de lumière */}
        <g data-streak>
          <path ref={streakRef} d={streakD} fill="none" stroke="url(#ki-streak)" strokeWidth={22} strokeLinecap="round" filter="url(#ki-blur)" opacity={0.95} style={{ strokeDasharray: 9999, strokeDashoffset: 9999 }} />
          <path ref={coreRef} d={streakD} fill="none" stroke="#E0F4FF" strokeWidth={4} strokeLinecap="round" style={{ strokeDasharray: 9999, strokeDashoffset: 9999 }} />
          <circle ref={headRef} r={14} fill="#FFFFFF" filter="url(#ki-blur)" style={{ opacity: 0 }} />
        </g>
      </svg>

      {/* éclair */}
      <div data-flash className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,#BDE6FF,transparent_60%)]" style={{ opacity: 0 }} />

      {/* légendes du récit */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[14%] text-center px-6">
        <p data-cap1 className="font-brand text-lg sm:text-2xl font-bold text-white/90" style={{ opacity: 0 }}>
          Kinshasa, 18 h 47. <span className="text-[#FF6B6B]">Nzela ekangami.</span>
        </p>
        <p data-cap2 className="absolute inset-x-0 top-0 font-brand text-lg sm:text-2xl font-bold text-white/90" style={{ opacity: 0 }}>
          Et si toute la ville voyait la route&nbsp;?
        </p>
      </div>

      {/* le logo */}
      <div data-lockup className="absolute inset-0 flex flex-col items-center justify-center pb-[6vh]">
        <div ref={pinRef} className="relative h-[24vmin] w-[24vmin] min-h-[120px] min-w-[120px]">
          {[0, 1, 2].map(i => (
            <span key={i} data-ring className="absolute left-1/2 top-[36%] h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#7DD3FC]" style={{ opacity: 0 }} />
          ))}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label="Kinshasa Flow">
            <defs><clipPath id="ki-pinclip"><path d={PIN_PATH} /></clipPath></defs>
            <g data-pin-fill opacity={0} style={{ transformOrigin: '50px 60px', transformBox: 'view-box' }}>
              <PinShape glow id="intro" />
              <g clipPath="url(#ki-pinclip)">
                <rect data-shine x={0} y={-20} width={26} height={140} fill="#fff" opacity={0.45} transform="rotate(20 50 50)" />
              </g>
            </g>
            <path data-pin-outline d={PIN_PATH} pathLength={1} fill="none" stroke="#BDE6FF" strokeWidth={2.5} strokeLinejoin="round" strokeDasharray={1} strokeDashoffset={1} />
          </svg>
        </div>
        <div className="mt-[2.2vmin] flex flex-col items-center">
          <div className="flex font-brand font-extrabold text-[5.2vmin] sm:text-[4.2vmin] tracking-[0.42em] pl-[0.42em] leading-none" aria-label="Kinshasa">
            {'KINSHASA'.split('').map((ch, i) => <span key={i} data-letter style={{ opacity: 0, display: 'inline-block' }}>{ch}</span>)}
          </div>
          <div data-flow className="mt-[0.4vmin]" style={{ clipPath: 'inset(100% 0% 0% 0%)' }}>
            <FlowWord className="text-[15vmin] sm:text-[12vmin] tracking-[0.02em] drop-shadow-[0_0_30px_rgba(30,155,255,.55)]" />
          </div>
          <p data-tag className="mt-[2.2vmin] font-brand text-[3.6vmin] sm:text-[2.4vmin] font-semibold uppercase text-white/80" style={{ opacity: 0 }}>
            Kin bouge. <span className="text-[#7DD3FC]">Toi, tu passes.</span>
          </p>
        </div>
      </div>

      <button
        type="button" data-skip onClick={finish}
        className="absolute right-4 bottom-4 sm:right-6 sm:bottom-6 rounded-full border border-white/25 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/80 backdrop-blur hover:bg-white/15"
      >
        Passer ›
      </button>
    </div>
  );
}
