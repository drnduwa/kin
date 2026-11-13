'use client';

/**
 * Composants « rue » réutilisables : la bulle du narrateur K-Flow et l'écran de chargement.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LOADING_LINES, MOOD_LINES, pickLine, type Mood } from '@/lib/kin-slang';
import { KFlowAvatar } from './illustrations';
import { FlowCarBadge } from './vehicles';

/**
 * K-Flow parle. Touchez la bulle pour entendre la phrase suivante.
 * `lines` remplace les phrases par défaut de l'humeur.
 */
export function KFlowSays({
  mood = 'neutre',
  lines,
  className,
  tone = 'dark',
  label = 'K-Flow',
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
      <KFlowAvatar mood={mood} className="h-10 w-10 kf-bob-slow" />
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

/** Écran d'attente : la voiture Kinshasa Flow roule pendant le chargement. */
export function KinLoader({ className }: { className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(n => (n + 1) % LOADING_LINES.length), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4', className)} role="status" aria-live="polite">
      <div className="relative w-60 overflow-hidden rounded-2xl pb-2">
        <FlowCarBadge className="w-full" />
        <div className="absolute inset-x-0 bottom-0 h-1 kf-road-dash opacity-60" />
      </div>
      <p className="font-black text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{LOADING_LINES[i]}</p>
    </div>
  );
}
