'use client';

/**
 * « Le film de ta route » : quand l'usager cherche un axe, on lui montre la route animée dans son
 * état réel (densité et vitesse des voitures selon la mesure), avec le récit de K-Flow en argot de
 * Kin, une jauge « thermomètre du bouchon » et la lecture vocale du récit.
 *
 * Tout ce qui est raconté vient de la mesure renvoyée par checkTrafficAction ; sans mesure, la route
 * reste grise et K-Flow le dit.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, RotateCcw, Navigation, X, MapPin } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { routeStory, SCOUT_LINES, type RouteFacts, type RouteLevel } from '@/lib/kin-slang';
import { KFlowAvatar } from './illustrations';
import { FlowPin } from './brand';

const W = 900, H = 260;
const ROAD = 'M30 178 C 200 70, 340 238, 500 146 S 760 58, 870 112';

const LEVEL: Record<RouteLevel, { color: string; label: string; cars: number; speed: number; crawl: boolean; heat: number }> = {
  ok: { color: '#22C55E', label: 'Fluide', cars: 8, speed: 140, crawl: false, heat: 0.1 },
  mod: { color: '#F59E0B', label: 'Modéré', cars: 16, speed: 70, crawl: false, heat: 0.38 },
  dense: { color: '#F97316', label: 'Embouteillé', cars: 28, speed: 22, crawl: true, heat: 0.68 },
  block: { color: '#EF4444', label: 'Bloqué', cars: 38, speed: 7, crawl: true, heat: 0.92 },
  none: { color: '#94A3B8', label: 'Pas de mesure', cars: 6, speed: 60, crawl: false, heat: 0 },
};

function kinHour() { return (new Date().getUTCHours() + 1) % 24; }

/** Écran d'attente : K-Flow part en reconnaissance sur la route demandée. */
export function RouteScout({ name, className }: { name?: string; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(n => (n + 1) % SCOUT_LINES.length), 1300); return () => clearInterval(t); }, []);
  return (
    <div className={cn('relative overflow-hidden rounded-3xl border-2 border-[#1E9BFF]/40 bg-[#06264F] text-white p-5', className)} role="status" aria-live="polite">
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_50%_120%,#1E9BFF,transparent_60%)]" />
      <div className="relative flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <span className="absolute inset-0 rounded-full border-2 border-[#7DD3FC]/50 animate-ping" />
          <span className="absolute inset-2 rounded-full border border-[#7DD3FC]/40" />
          <FlowPin className="absolute inset-3" glow />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7DD3FC]">Reconnaissance en cours</p>
          <p className="font-black text-lg leading-tight truncate">{name || 'Ta route'}</p>
          <p className="text-sm text-white/70">{SCOUT_LINES[i]}</p>
        </div>
      </div>
      <div className="relative mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#7DD3FC] to-transparent kf-scan" />
      </div>
    </div>
  );
}

export function RouteStory({ analysis, raining = false, onClose }: { analysis: RouteFacts & { source?: string }; raining?: boolean; onClose?: () => void }) {
  const story = useMemo(() => routeStory({ ...analysis, raining }), [analysis, raining]);
  const L = LEVEL[story.level];
  const uid = useId().replace(/:/g, ''); // ids SVG uniques (plusieurs films sur une page)
  const svgRef = useRef<SVGSVGElement>(null);
  const carsRef = useRef<SVGGElement>(null);
  const heroRef = useRef<SVGGElement>(null);
  const [shown, setShown] = useState(0); // nombre de phrases déjà « dites »
  const [typed, setTyped] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [replay, setReplay] = useState(0);
  const [night, setNight] = useState(false);
  useEffect(() => { const h = kinHour(); setNight(h >= 19 || h < 6); }, []);

  // ── Récit façon machine à écrire, phrase par phrase
  useEffect(() => {
    setShown(0); setTyped('');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(story.lines.length); return; }
    let line = 0, ch = 0, alive = true;
    const tick = () => {
      if (!alive) return;
      const cur = story.lines[line];
      if (!cur) return;
      ch++;
      setTyped(cur.slice(0, ch));
      if (ch >= cur.length) {
        line++; ch = 0;
        setShown(line); setTyped('');
        if (line < story.lines.length) setTimeout(tick, 650);
      } else setTimeout(tick, 18);
    };
    const t = setTimeout(tick, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [story, replay]);

  // ── Voitures qui roulent à la vitesse de l'état mesuré
  useEffect(() => {
    const svg = svgRef.current, layer = carsRef.current, hero = heroRef.current;
    if (!svg || !layer || !hero) return;
    const path = svg.querySelector<SVGPathElement>('[data-road]');
    if (!path) return;
    const len = path.getTotalLength();
    layer.replaceChildren();
    const NS = 'http://www.w3.org/2000/svg';
    const kinds = ['taxi', 'white', '207', 'dark', 'red'].map(k => `${uid}-${k}`);
    type C = { el: SVGUseElement; o: number; lane: 1 | -1; sp: number; ph: number };
    const cars: C[] = [];
    // Bouchon : les voitures se serrent sur la seconde moitié de la route (la zone rouge)
    for (let i = 0; i < L.cars; i++) {
      const lane: 1 | -1 = i % 3 === 0 ? -1 : 1;
      const el = document.createElementNS(NS, 'use');
      el.setAttribute('href', `#${kinds[i % kinds.length]}${L.crawl && lane === 1 ? '-brake' : ''}`);
      layer.appendChild(el);
      const o = L.crawl && lane === 1 ? len * 0.35 + (i / L.cars) * len * 0.6 : (i / L.cars) * len;
      cars.push({ el, o, lane, sp: L.speed * (lane === 1 ? 1 : 1.6) * (0.85 + ((i * 37) % 30) / 100), ph: i * 0.7 });
    }
    const place = (el: SVGGraphicsElement, s: number, lane: number, scale = 1) => {
      const a = path.getPointAtLength(s), b = path.getPointAtLength(Math.min(len, s + 1));
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      if (lane < 0) ang += Math.PI;
      el.setAttribute('transform', `translate(${(a.x + nx * 9 * lane).toFixed(1)} ${(a.y + ny * 9 * lane).toFixed(1)}) rotate(${(ang * 57.3).toFixed(1)}) scale(${scale})`);
    };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = 0, t = 0, heroS = 0;
    const acc = cars.map(() => 0);
    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now; t += dt;
      cars.forEach((c, i) => {
        const crawl = L.crawl && c.lane === 1 ? Math.max(0, Math.sin(t * 1.1 + c.ph * 0.2)) * 1.8 : 1;
        acc[i] += dt * c.sp * crawl;
        let s;
        if (L.crawl && c.lane === 1) {
          const span = len * 0.6;
          s = len * 0.35 + (((c.o - len * 0.35) + acc[i]) % span);
        } else {
          s = ((c.o + c.lane * acc[i]) % len + len) % len;
        }
        place(c.el, s, c.lane);
      });
      // La voiture K-Flow : roule vite quand c'est libre, se faufile au pas dans le bouchon
      const heroSp = L.crawl ? L.speed * 2.2 * (0.4 + Math.max(0, Math.sin(t * 1.1))) : L.speed * 1.3;
      heroS = (heroS + dt * heroSp) % len;
      place(hero, heroS, 1, 1.5);
      raf = requestAnimationFrame(frame);
    };
    if (reduce) { cars.forEach((c, i) => place(c.el, c.o, c.lane)); place(hero, len * 0.2, 1, 1.5); return; }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [L, uid]);

  // ── Lecture vocale du récit
  const speak = () => {
    if (!('speechSynthesis' in window)) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(story.lines.join(' ').replace(/[«»]/g, ''));
    u.lang = 'fr-FR'; u.rate = 1.05;
    u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);

  const honks = story.level === 'block' ? ['PIN PIN !', 'Pesa nzela !', 'Tika ngai naleka !'] : story.level === 'dense' ? ['PIN PIN !', 'Malembe…'] : story.level === 'ok' ? ['Tokende !'] : [];
  const bg = night ? { sky: '#0B1630', ground: '#16233A', block: '#22314B', win: '#FFD58A', road: '#2B3445' } : { sky: '#BFE6FF', ground: '#EFE4CC', block: '#D9C9A8', win: '#FFFFFF', road: '#3B4250' };

  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      className="relative overflow-hidden rounded-3xl border-2 shadow-xl bg-white dark:bg-slate-900"
      style={{ borderColor: `${L.color}66` }}
      aria-label={`Le film de ta route : ${analysis.name}`}
    >
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1E9BFF]">Le film de ta route</p>
          <h3 className="font-black text-lg leading-tight text-slate-900 dark:text-white truncate">{analysis.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-black text-white" style={{ background: L.color }}>{L.label}</span>
            {typeof analysis.delay === 'number' && story.level !== 'none' && (
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">{analysis.delay > 0 ? `+${analysis.delay} min` : 'pas de retard'}</span>
            )}
            {typeof analysis.speedKmh === 'number' && story.level !== 'none' && (
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">{analysis.speedKmh} km/h</span>
            )}
            {story.level !== 'none' && (
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', analysis.isLive ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
                {analysis.isLive ? 'Mesuré en direct' : "Estimation selon l'heure"}
              </span>
            )}
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* La route animée */}
      <div className="relative mx-3 overflow-hidden rounded-2xl" style={{ background: bg.ground }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Animation : ${analysis.name}, ${L.label.toLowerCase()}`}>
          <defs>
            {([['taxi', '#FACC15'], ['white', '#F8FAFC'], ['dark', '#334155'], ['red', '#DC2626']] as const).map(([id, col]) => [false, true].map(br => (
              <g key={`${id}${br}`} id={`${uid}-${id}${br ? '-brake' : ''}`}>
                <rect x={-8} y={-4} width={16} height={8} rx={2.4} fill={col} stroke="#0B1118" strokeWidth={0.8} />
                <rect x={1.5} y={-3} width={3.6} height={6} rx={1} fill="#1E293B" />
                <rect x={-6} y={-3} width={2.6} height={6} rx={0.8} fill="#1E293B" opacity={0.8} />
                {br && <><rect x={-8.6} y={-3.6} width={1.6} height={2.2} fill="#FF2D2D" /><rect x={-8.6} y={1.4} width={1.6} height={2.2} fill="#FF2D2D" /></>}
              </g>
            )))}
            {[false, true].map(br => (
              <g key={`207${br}`} id={`${uid}-207${br ? '-brake' : ''}`}>
                <rect x={-11} y={-4.6} width={22} height={9.2} rx={2} fill="#FACC15" stroke="#0B1118" strokeWidth={0.8} />
                <rect x={-11} y={-1} width={22} height={2} fill="#1D4ED8" />
                <rect x={4.5} y={-3.6} width={4} height={7.2} rx={1} fill="#1E293B" />
                {br && <><rect x={-11.7} y={-4} width={1.6} height={2.4} fill="#FF2D2D" /><rect x={-11.7} y={1.6} width={1.6} height={2.4} fill="#FF2D2D" /></>}
              </g>
            ))}
            <linearGradient id={`${uid}-heat`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={L.color} stopOpacity={0} />
              <stop offset="0.45" stopColor={L.color} stopOpacity={story.level === 'block' || story.level === 'dense' ? 0.55 : 0.25} />
              <stop offset="1" stopColor={L.color} stopOpacity={0.15} />
            </linearGradient>
            <filter id={`${uid}-glow`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
          </defs>

          {/* quartier : immeubles et palmiers */}
          {Array.from({ length: 26 }, (_, i) => {
            const x = (i * 97) % W, y = (i * 53) % H, w = 34 + (i % 4) * 10, h = 26 + (i % 3) * 10;
            return (
              <g key={i}>
                <rect x={x} y={y} width={w} height={h} rx={4} fill={bg.block} />
                {night && <rect x={x + 6} y={y + 6} width={6} height={6} fill={bg.win} opacity={0.7} />}
              </g>
            );
          })}
          {[[90, 40], [420, 30], [640, 210], [250, 222], [800, 200]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle r={14} fill={night ? '#1F3D2B' : '#7FB069'} />
              <circle r={7} cx={5} cy={-4} fill={night ? '#264A34' : '#9CCB7F'} />
            </g>
          ))}

          {/* la route, sa « chaleur » et ses marquages */}
          <path d={ROAD} fill="none" stroke={L.color} strokeWidth={46} strokeLinecap="round" opacity={0.28} filter={`url(#${uid}-glow)`} />
          <path d={ROAD} fill="none" stroke="#E5E7EB" strokeWidth={38} strokeLinecap="round" />
          <path data-road d={ROAD} fill="none" stroke={bg.road} strokeWidth={34} strokeLinecap="round" />
          <path d={ROAD} fill="none" stroke={`url(#${uid}-heat)`} strokeWidth={34} strokeLinecap="round" />
          <path d={ROAD} fill="none" stroke="#FACC15" strokeWidth={2} strokeDasharray="14 12" className={story.level === 'ok' || story.level === 'mod' ? 'kf-dash-run' : undefined} />

          {/* signalement d'un Kinois sur la route */}
          {analysis.cause && (
            <g transform="translate(600 96)">
              <circle r={16} fill="#F59E0B" opacity={0.3}><animate attributeName="r" values="14;26;14" dur="1.6s" repeatCount="indefinite" /></circle>
              <path d="M0 -13 L12 9 L-12 9 Z" fill="#F59E0B" stroke="#fff" strokeWidth={2} strokeLinejoin="round" />
              <text y={6} textAnchor="middle" fontSize={12} fontWeight={900} fill="#fff">!</text>
            </g>
          )}

          <g ref={carsRef} />

          {/* la voiture K-Flow */}
          <g ref={heroRef}>
            {story.level === 'ok' && <path d="M-30 -2 L-12 -2 M-34 2 L-14 2" stroke="#7DD3FC" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />}
            <circle r={13} fill="#1E9BFF" opacity={0.25} />
            <rect x={-9} y={-4.6} width={18} height={9.2} rx={2.8} fill="#1E9BFF" stroke="#0B1118" strokeWidth={0.8} />
            <rect x={2} y={-3.4} width={4} height={6.8} rx={1} fill="#0B2545" />
            <circle cx={-2} cy={0} r={2} fill="#fff" />
          </g>

          {/* départ et arrivée */}
          <g transform="translate(30 178)">
            <circle r={12} fill="#fff" stroke="#1E9BFF" strokeWidth={3} />
            <text y={4} textAnchor="middle" fontSize={9} fontWeight={900} fill="#1E9BFF">TOI</text>
          </g>
          <g transform="translate(870 112)">
            <path d="M0 0 L0 -34" stroke="#0B1118" strokeWidth={2.5} />
            <path d="M0 -34 L22 -28 L0 -22 Z" fill={L.color} />
            <circle r={5} fill="#0B1118" />
          </g>

          {raining && Array.from({ length: 40 }, (_, i) => (
            <line key={i} x1={(i * 61) % W} y1={(i * 37) % H} x2={(i * 61) % W - 6} y2={(i * 37) % H + 14} stroke="#7DD3FC" strokeWidth={1.4} opacity={0.6}>
              <animateTransform attributeName="transform" type="translate" from="0 -40" to="-20 300" dur={`${0.7 + (i % 5) * 0.12}s`} repeatCount="indefinite" />
            </line>
          ))}
        </svg>

        {/* klaxons et cris de la route */}
        {honks.map((h, i) => (
          <span key={h} className="kf-pop pointer-events-none absolute rounded-xl rounded-bl-none bg-white px-2 py-1 text-[11px] font-black text-[#0B1622] shadow" style={{ left: `${48 + i * 14}%`, top: `${12 + (i % 2) * 22}%`, animationDelay: `${i * 1.4}s` }}>
            {h}
          </span>
        ))}
        <span className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white">
          <MapPin className="h-3 w-3" />{analysis.name}
        </span>
      </div>

      {/* Thermomètre du bouchon */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
          <span>Thermomètre du bouchon</span>
          <span style={{ color: L.color }}>{story.level === 'none' ? '—' : L.label}</span>
        </div>
        <div className="relative mt-1 h-2.5 rounded-full bg-gradient-to-r from-[#22C55E] via-[#F59E0B] to-[#EF4444] opacity-90">
          {story.level !== 'none' && (
            <motion.span
              className="absolute -top-1.5 w-1.5 -translate-x-1/2 rounded-full bg-slate-900 dark:bg-white shadow"
              style={{ height: 22 }}
              initial={{ left: '0%' }}
              animate={{ left: `${L.heat * 100}%` }}
              transition={{ type: 'spring', stiffness: 60, damping: 8, delay: 0.3 }}
            />
          )}
        </div>
      </div>

      {/* Le récit de K-Flow */}
      <div className="p-4 pt-3">
        <div className="flex items-start gap-3">
          <KFlowAvatar mood={story.mood} className="h-11 w-11 kf-bob-slow" />
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-[#06264F] text-white px-3.5 py-2.5 space-y-1.5 min-h-[88px]">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#7DD3FC]">K-Flow raconte</p>
            {story.lines.slice(0, shown).map((l, i) => (
              <p key={i} className="text-sm leading-snug">{l}</p>
            ))}
            {shown < story.lines.length && <p className="text-sm leading-snug">{typed}<span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-[#7DD3FC] animate-pulse" /></p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => setReplay(n => n + 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
            <RotateCcw className="h-3.5 w-3.5" />Rejouer
          </button>
          <button type="button" onClick={speak} className="inline-flex items-center gap-1.5 rounded-xl border border-[#1E9BFF]/40 px-3 py-2 text-xs font-bold text-[#1E9BFF] hover:bg-[#1E9BFF]/10">
            {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}{speaking ? 'Stop' : 'Écouter K-Flow'}
          </button>
          <Link href="/k-flow-nav" className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E9BFF] px-3 py-2 text-xs font-black text-white hover:bg-[#0B5FD6]">
            <Navigation className="h-3.5 w-3.5" />Lancer le GPS
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
