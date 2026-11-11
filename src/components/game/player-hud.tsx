'use client';

/** Bandeau joueur : niveau, rang, barre d'XP, série de jours et lien vers les quêtes. */
import Link from 'next/link';
import { Flame, Trophy, ChevronRight } from 'lucide-react';
import { levelProgress, rankFor, kinshasaDayKey } from '@/lib/game';

export default function PlayerHud({ profile }: { profile: any }) {
  if (!profile) return null;
  const xp = Number(profile.xp || 0);
  const { level, current, needed, pct } = levelProgress(xp);
  const today = kinshasaDayKey();
  const yesterday = kinshasaDayKey(new Date(Date.now() - 24 * 3600 * 1000));
  // La série n'est « vivante » que si l'usager a joué aujourd'hui ou hier.
  const streak = profile.lastActiveDay === today || profile.lastActiveDay === yesterday ? Number(profile.streakDays || 0) : 0;
  const playedToday = profile.lastActiveDay === today;

  return (
    <Link
      href="/quetes"
      className="flex items-center gap-3 rounded-2xl bg-[#0A1A29] text-[#EAF3FA] border border-[#22425C] px-3 py-2.5 hover:border-[#2EB6F0] transition-colors"
    >
      <div className="relative grid place-items-center h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-[#2EB6F0] to-[#1A5E8C] font-black text-base">
        {level}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-black truncate">{rankFor(level)}</span>
          <span className="text-[#8EA8BD] tabular-nums shrink-0">{current} / {needed} XP</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-[#173248] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#2EB6F0] to-[#FFD23F] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-[#8EA8BD]">
          <span className="inline-flex items-center gap-1">
            <Flame className={streak > 0 ? 'h-3.5 w-3.5 text-[#FF7A45]' : 'h-3.5 w-3.5'} />
            {streak > 0 ? `${streak} jour${streak > 1 ? 's' : ''} de suite` : 'Pas de série en cours'}
            {!playedToday && streak > 0 && <span className="text-[#FFD23F]"> · joue aujourd'hui pour la garder</span>}
          </span>
          <span className="inline-flex items-center gap-1 ml-auto"><Trophy className="h-3.5 w-3.5 text-[#FFD23F]" />Quêtes</span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-[#8EA8BD] shrink-0" />
    </Link>
  );
}
