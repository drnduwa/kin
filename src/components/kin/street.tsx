'use client';

/**
 * Composants « rue » réutilisables : la scène animée de Kin, la bulle du narrateur
 * Ya Flow et l'écran de chargement.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LOADING_LINES, MOOD_LINES, pickLine, type Mood } from '@/lib/kin-slang';
import { EspritDeMort, KinSkyline, Libulu, WewaRider, YaFlowAvatar } from './illustrations';

/** Scène animée : ciel, Kin qui défile, route, Ya Flow et le trafic d'en face. */
export function KinStreetScene({
  className,
  rain = false,
  passenger = true,
  bubbles = ['Tokende !', 'Keba libulu !', 'Nzela ezali polele'],
}: {
  className?: string;
  rain?: boolean;
  passenger?: boolean;
  bubbles?: string[];
}) {
  return (
    <div className={cn('relative overflow-hidden isolate', className)}>
      {/* ciel du soir */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#1A1240] via-[#B4436C] to-[#FF9F45]" />
      <div className="absolute left-[12%] top-[14%] h-20 w-20 sm:h-28 sm:w-28 rounded-full bg-[#FFE08A] shadow-[0_0_80px_30px_rgba(255,210,63,.45)]" />

      {/* Kin qui défile (deux copies pour boucler) */}
      <div className="absolute inset-x-0 bottom-[34%] h-[55%]">
        <div className="kf-drift flex h-full w-[200%]">
          <KinSkyline className="h-full w-1/2" />
          <KinSkyline className="h-full w-1/2" />
        </div>
      </div>

      {/* route */}
      <div className="absolute inset-x-0 bottom-0 h-[36%] bg-[#2A2F36]">
        <div className="absolute inset-x-0 top-0 h-2 bg-[#C9B28A]" />
        <div className="absolute inset-x-0 top-[44%] h-1.5 kf-road-dash opacity-90" />
        <div className="absolute inset-x-0 bottom-0 h-3 bg-[repeating-linear-gradient(90deg,#F8FAFC_0_24px,#EF4444_24px_48px)] opacity-80" />
      </div>

      {/* trafic d'en face (voie du haut) */}
      <div className="absolute bottom-[22%] left-full w-[34%] max-w-[260px] kf-cross">
        <EspritDeMort className="w-full -scale-x-100" />
      </div>
      {/* libulu qui arrive */}
      <div className="absolute bottom-[6%] left-full w-[10%] max-w-[80px] kf-cross-fast" style={{ animationDelay: '1.2s' }}>
        <Libulu className="w-full" />
      </div>

      {/* Ya Flow */}
      <div className="absolute bottom-[2%] left-1/2 -translate-x-[60%] w-[46%] max-w-[340px]">
        <div className="relative">
          <WewaRider passenger={passenger} className="w-full drop-shadow-xl" />
          {bubbles.map((b, i) => (
            <span
              key={b}
              className="kf-pop absolute whitespace-nowrap rounded-2xl rounded-bl-none bg-white text-[#0B1622] px-3 py-1.5 text-xs sm:text-sm font-black shadow-lg"
              style={{ animationDelay: `${i * 1.5}s`, left: '58%', top: '-14%' }}
            >
              {b}
            </span>
          ))}
        </div>
      </div>

      {rain && <div className="absolute inset-0 kf-rain pointer-events-none" />}
    </div>
  );
}

/**
 * Ya Flow parle. Touchez la bulle pour entendre la phrase suivante.
 * `lines` remplace les phrases par défaut de l'humeur.
 */
export function YaFlowSays({
  mood = 'neutre',
  lines,
  className,
  tone = 'dark',
  label = 'Ya Flow',
}: {
  mood?: Mood;
  lines?: string[];
  className?: string;
  tone?: 'dark' | 'light';
  label?: string;
}) {
  const pool = lines && lines.length ? lines : MOOD_LINES[mood];
  const poolKey = pool.join('|');
  const [i, setI] = useState(() => pool.indexOf(pickLine(pool)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setI(pool.indexOf(pickLine(pool))), [poolKey]);
  const line = pool[(i + pool.length) % pool.length];

  return (
    <button
      type="button"
      onClick={() => setI(n => n + 1)}
      className={cn('group flex w-full items-start gap-2.5 text-left', className)}
      aria-label={`${label} dit : ${line}. Touchez pour la suite.`}
    >
      <YaFlowAvatar mood={mood} className="h-10 w-10 kf-bob-slow" />
      <div
        className={cn(
          'relative min-w-0 flex-1 rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-snug shadow-sm',
          tone === 'dark' ? 'bg-[#11273A] text-[#EAF3FA] border border-[#22425C]' : 'bg-white text-slate-800 border border-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800'
        )}
      >
        <span className={cn('block text-[10px] font-black uppercase tracking-widest', tone === 'dark' ? 'text-[#FFD23F]' : 'text-amber-600')}>
          {label}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={line}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="block font-semibold"
          >
            « {line} »
          </motion.span>
        </AnimatePresence>
        {pool.length > 1 && (
          <span className={cn('mt-0.5 block text-[10px] opacity-0 transition-opacity group-hover:opacity-70', tone === 'dark' ? 'text-[#8EA8BD]' : 'text-slate-500')}>
            Touchez pour la suite
          </span>
        )}
      </div>
    </button>
  );
}

/** Écran d'attente : la wewa roule pendant le chargement. */
export function KinLoader({ className }: { className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(n => (n + 1) % LOADING_LINES.length), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4', className)} role="status" aria-live="polite">
      <div className="relative w-56 overflow-hidden rounded-2xl">
        <WewaRider className="w-full" />
        <div className="absolute inset-x-0 bottom-1 h-1 kf-road-dash opacity-60" />
      </div>
      <p className="font-black text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{LOADING_LINES[i]}</p>
    </div>
  );
}
