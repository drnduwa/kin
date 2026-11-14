'use client';

/**
 * Personnage kinois dessiné à partir d'une graine (l'id de l'usager) : chaque membre sans photo
 * reçoit toujours le même petit personnage — casquette de taximan, foulard de maman, lunettes
 * de sapeur, casque de wewa… Original, sans fichier, et léger.
 */
import React from 'react';
import { cn } from '@/lib/utils';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const SKIN = ['#6B3E26', '#7A4A2E', '#5A3220', '#8C5A3A', '#4A2A1A'];
const BG = ['#2EB6F0', '#FFD23F', '#FF7A45', '#3DDC97', '#B07CFF', '#FF5C8A'];
const CLOTH = ['#1E9BFF', '#E63946', '#F4A261', '#2A9D8F', '#6D28D9', '#0F172A'];
type Hat = 'cap' | 'foulard' | 'helmet' | 'none' | 'beret';
const HATS: Hat[] = ['cap', 'foulard', 'helmet', 'none', 'beret'];

export const KINOIS_TITLES: Record<Hat, string> = {
  cap: 'Taximan',
  foulard: 'Maman ya zando',
  helmet: 'Wewa',
  none: 'Ndeko',
  beret: 'Sapeur',
};

export function kinoisFor(seed: string) {
  const h = hash(seed || 'kin');
  return {
    skin: SKIN[h % SKIN.length],
    bg: BG[(h >>> 3) % BG.length],
    cloth: CLOTH[(h >>> 6) % CLOTH.length],
    hat: HATS[(h >>> 9) % HATS.length],
    glasses: ((h >>> 12) & 3) === 0,
    smile: ((h >>> 14) & 1) === 0,
  };
}

export function KinoisFace({ seed, className, title }: { seed: string; className?: string; title?: string }) {
  const k = kinoisFor(seed);
  return (
    <svg viewBox="0 0 48 48" className={cn('rounded-full', className)} role="img" aria-label={title || KINOIS_TITLES[k.hat]}>
      <rect width="48" height="48" rx="24" fill={k.bg} />
      {/* épaules */}
      <path d="M8 48c2-9 8-13 16-13s14 4 16 13z" fill={k.cloth} />
      {/* tête */}
      <ellipse cx="24" cy="23" rx="10" ry="11" fill={k.skin} />
      {/* yeux */}
      {k.glasses ? (
        <g>
          <rect x="15.5" y="19.5" width="7" height="5" rx="2" fill="#0F172A" />
          <rect x="25.5" y="19.5" width="7" height="5" rx="2" fill="#0F172A" />
          <path d="M22.5 21.5h3" stroke="#0F172A" strokeWidth="1.2" />
          <path d="M17 20.5l2 1" stroke="#fff" strokeWidth="0.8" opacity="0.6" />
        </g>
      ) : (
        <g fill="#0F172A">
          <circle cx="20" cy="22" r="1.4" className="kf-blink" />
          <circle cx="28" cy="22" r="1.4" className="kf-blink" />
        </g>
      )}
      {/* bouche */}
      {k.smile
        ? <path d="M19.5 27.5q4.5 4 9 0" stroke="#2A140A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        : <ellipse cx="24" cy="28.5" rx="2.2" ry="1.6" fill="#2A140A" />}
      {/* chapeaux */}
      {k.hat === 'cap' && (
        <g>
          <path d="M13.5 17c0-6 4.5-9.5 10.5-9.5S34.5 11 34.5 17z" fill="#FFD23F" />
          <path d="M30 16.5h10q-1 2.5-6 2.5h-4z" fill="#E5B800" />
          <circle cx="24" cy="8" r="1.2" fill="#E5B800" />
        </g>
      )}
      {k.hat === 'foulard' && (
        <g>
          <path d="M12.5 19c0-8 5-12 11.5-12s11.5 4 11.5 12c-3-3-7-4.5-11.5-4.5S15.5 16 12.5 19z" fill="#FF5C8A" />
          <path d="M33 10l5-3 -1 6z" fill="#FF5C8A" />
          <circle cx="19" cy="12" r="1" fill="#FFD23F" /><circle cx="25" cy="10.5" r="1" fill="#FFD23F" /><circle cx="30" cy="13" r="1" fill="#FFD23F" />
        </g>
      )}
      {k.hat === 'helmet' && (
        <g>
          <path d="M12.5 21c0-8 5-13 11.5-13s11.5 5 11.5 13z" fill="#E63946" />
          <path d="M14 18h20" stroke="#fff" strokeWidth="1.6" opacity="0.8" />
          <rect x="15" y="20" width="18" height="2.5" rx="1.2" fill="#0F172A" opacity="0.55" />
        </g>
      )}
      {k.hat === 'beret' && (
        <g>
          <ellipse cx="22" cy="13" rx="11" ry="4.5" fill="#6D28D9" />
          <circle cx="22" cy="8.8" r="1.4" fill="#6D28D9" />
          <path d="M20 41l4-3 4 3-4 3z" fill="#FFD23F" />
        </g>
      )}
      {k.hat === 'none' && <path d="M14.5 18c1-6 5-8.5 9.5-8.5s8.5 2.5 9.5 8.5c-3-2-6-3-9.5-3s-6.5 1-9.5 3z" fill="#1a0d06" />}
    </svg>
  );
}
