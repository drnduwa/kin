/**
 * Logo Kinshasa Flow en vectoriel, fidèle à l'icône officielle (assets/icon.png) :
 * marqueur bleu brillant + « KINSHASA » espacé + « FLOW » dont le O porte une vague.
 * Vectoriel pour pouvoir l'animer pièce par pièce (intro, en-tête, voiture, panneau).
 */
import { useId } from 'react';
import { cn } from '@/lib/utils';

export const BRAND = {
  blue: '#1E9BFF',
  blueDeep: '#0B5FD6',
  blueNight: '#06264F',
  sky: '#7DD3FC',
};

/** Tracé du marqueur dans une boîte 100 × 100. */
export const PIN_PATH = 'M50 6 C33.4 6 20 19.4 20 36 C20 58 50 94 50 94 C50 94 80 58 80 36 C80 19.4 66.6 6 50 6 Z';

/** Le marqueur seul, en dégradé brillant. À poser dans un <svg viewBox="0 0 100 100"> ou via <FlowPin />. */
export function PinShape({ glow = false, id: forced }: { glow?: boolean; id?: string }) {
  const uid = useId().replace(/:/g, '');
  const id = forced ?? uid;
  return (
    <g>
      <defs>
        <linearGradient id={`kp-b${id}`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#6FD6FF" />
          <stop offset="0.45" stopColor={BRAND.blue} />
          <stop offset="1" stopColor={BRAND.blueDeep} />
        </linearGradient>
        <radialGradient id={`kp-c${id}`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D6ECFF" />
        </radialGradient>
        <linearGradient id={`kp-g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.55} />
          <stop offset="0.6" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        {glow && (
          <filter id={`kp-f${id}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>
      <g filter={glow ? `url(#kp-f${id})` : undefined}>
        <path d={PIN_PATH} fill={`url(#kp-b${id})`} />
      </g>
      <path d="M50 9 C35 9 23 21 23 36 C23 40 24 44 26 48 C30 30 44 18 62 14 C58 10 54 9 50 9 Z" fill={`url(#kp-g${id})`} />
      <circle cx={50} cy={36} r={12.5} fill={`url(#kp-c${id})`} />
    </g>
  );
}

export function FlowPin({ className, glow = false, title = 'Kinshasa Flow' }: { className?: string; glow?: boolean; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={title}>
      <PinShape glow={glow} />
    </svg>
  );
}

/** Le « O » de FLOW : anneau dégradé avec une vague (animable via className sur la vague). */
export function FlowO({ className, waveClassName }: { className?: string; waveClassName?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`ko${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BRAND.sky} />
          <stop offset="1" stopColor={BRAND.blue} />
        </linearGradient>
        <clipPath id={`koc${id}`}><circle cx={50} cy={50} r={33} /></clipPath>
      </defs>
      <circle cx={50} cy={50} r={39} fill="none" stroke={`url(#ko${id})`} strokeWidth={17} />
      <g clipPath={`url(#koc${id})`}>
        <path className={waveClassName} d="M-40 66 Q-22 54 -4 66 T32 66 T68 66 T104 66 T140 66" fill="none" stroke={`url(#ko${id})`} strokeWidth={7} strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Lockup complet : marqueur + KINSHASA + FLOW. `layout` horizontal (en-tête) ou empilé (intro). */
export function FlowLogo({ className, layout = 'row', tone = 'dark' }: { className?: string; layout?: 'row' | 'stack'; tone?: 'dark' | 'light' }) {
  const k = tone === 'dark' ? 'text-white' : 'text-[#0B2545]';
  if (layout === 'stack') {
    return (
      <div className={cn('flex flex-col items-center', className)} role="img" aria-label="Kinshasa Flow">
        <FlowPin className="h-[1.6em] w-[1.6em]" />
        <span className={cn('mt-[0.15em] font-brand font-extrabold tracking-[0.42em] pl-[0.42em] text-[0.32em] leading-none', k)}>KINSHASA</span>
        <FlowWord className="text-[0.62em]" />
      </div>
    );
  }
  return (
    <div className={cn('flex items-center gap-[0.35em]', className)} role="img" aria-label="Kinshasa Flow">
      <FlowPin className="h-[1.5em] w-[1.5em] shrink-0" />
      <div className="flex flex-col leading-none">
        <span className={cn('font-brand font-extrabold tracking-[0.34em] text-[0.42em]', k)}>KINSHASA</span>
        <FlowWord className="text-[0.86em] -mt-[0.04em]" />
      </div>
    </div>
  );
}

/** « FLOW » en dégradé, avec le O à vague. */
export function FlowWord({ className, waveClassName = 'kf-wave-flow' }: { className?: string; waveClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center font-brand font-black leading-none', className)} aria-hidden="true">
      <span className="bg-gradient-to-b from-[#9BE1FF] to-[#1E9BFF] bg-clip-text text-transparent">FL</span>
      <FlowO className="h-[0.78em] w-[0.78em] mx-[0.02em]" waveClassName={waveClassName} />
      <span className="bg-gradient-to-b from-[#9BE1FF] to-[#1E9BFF] bg-clip-text text-transparent">W</span>
    </span>
  );
}
