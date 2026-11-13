'use client';

/**
 * Page « Classement » : bataille des communes de la semaine et meilleurs joueurs.
 * Les points = XP gagnés cette semaine (votes, signalements, missions, séries), écrits par le serveur.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { collection, doc, limit, orderBy, query } from 'firebase/firestore';
import { Trophy, Clock, MapPin } from 'lucide-react';
import { useUser, useFirebase, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { cn } from '@/lib/utils';
import { kinshasaWeekId, weekEndsAt } from '@/lib/game';
import { rivalTaunt } from '@/lib/kin-slang';
import { YaFlowSays } from '@/components/kin/street';

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, target.getTime() - now);
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d} j ${h} h` : `${h} h ${m} min`;
}

export default function LeaderboardPage() {
  const { user } = useUser();
  const { firestore } = useFirebase();
  const week = kinshasaWeekId();
  const remaining = useCountdown(weekEndsAt());
  const [tab, setTab] = useState<'communes' | 'players'>('communes');

  const userRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: profile } = useDoc<any>(userRef);
  const communesQ = useMemoFirebase(() => (user ? query(collection(firestore, 'leaderboards', week, 'communes'), orderBy('points', 'desc'), limit(24)) : null), [firestore, user, week]);
  const playersQ = useMemoFirebase(() => (user ? query(collection(firestore, 'leaderboards', week, 'players'), orderBy('points', 'desc'), limit(20)) : null), [firestore, user, week]);
  const { data: communes, isLoading: loadingC } = useCollection<any>(communesQ);
  const { data: players, isLoading: loadingP } = useCollection<any>(playersQ);
  const meRef = useMemoFirebase(() => (user ? doc(firestore, 'leaderboards', week, 'players', user.uid) : null), [firestore, user, week]);
  const { data: me } = useDoc<any>(meRef);
  const sponsorRef = useMemoFirebase(() => doc(firestore, 'app_settings', 'sponsor'), [firestore]);
  const { data: sponsor } = useDoc<any>(sponsorRef);

  const top = communes || [];
  const leader = top[0], second = top[1];
  const list = tab === 'communes' ? top : (players || []);
  const max = Math.max(1, ...list.map((r: any) => Number(r.points || 0)));
  const loading = tab === 'communes' ? loadingC : loadingP;

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 sm:p-4 md:p-6">
      <div className="max-w-3xl mx-auto w-full space-y-4 pb-24 md:pb-12">

        <section className="rounded-3xl bg-[#0A1A29] text-[#EAF3FA] border border-[#22425C] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-black inline-flex items-center gap-2"><Trophy className="h-5 w-5 text-[#FFD23F]" />Bataille des communes</h1>
            <span className="text-[11px] text-[#8EA8BD] inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />fin dans {remaining}</span>
          </div>
          {leader ? (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                <div><div className="font-black">{leader.commune}</div><div className="text-xs text-[#8EA8BD] tabular-nums">{Number(leader.points).toLocaleString('fr-FR')} pts</div></div>
                <span className="rounded-full bg-[#FFD23F] text-[#0A1A29] text-xs font-black px-2.5 py-1">VS</span>
                <div><div className="font-black">{second?.commune ?? '—'}</div><div className="text-xs text-[#8EA8BD] tabular-nums">{second ? `${Number(second.points).toLocaleString('fr-FR')} pts` : 'en attente'}</div></div>
              </div>
              {second && (
                <div className="h-2 rounded-full bg-[#173248] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#2EB6F0] to-[#FFD23F]" style={{ width: `${(Number(leader.points) / (Number(leader.points) + Number(second.points))) * 100}%` }} />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[#8EA8BD]">La semaine vient de commencer : aucune commune n'a encore de points. Votez sur un carrefour pour ouvrir le score de la vôtre.</p>
          )}
          <YaFlowSays
            mood={leader && profile?.commune && leader.commune !== profile.commune ? 'dense' : 'fluide'}
            label="Radio trottoir"
            lines={[rivalTaunt(leader?.commune, profile?.commune), `Fin de la semaine dans ${remaining}. Malembe te — mbangu !`]}
          />
          {sponsor?.active && sponsor?.name && (
            <p className="rounded-xl bg-[#FFD23F]/15 border border-[#FFD23F]/40 px-3 py-2 text-xs">
              Prix de la semaine offert par <b>{sponsor.name}</b>{sponsor.prize ? ` : ${sponsor.prize}` : ''}
            </p>
          )}
          {!profile?.commune && (
            <Link href="/quetes" className="block rounded-xl bg-[#11273A] border border-[#22425C] px-3 py-2 text-xs">
              <MapPin className="inline h-3.5 w-3.5 mr-1 text-[#FFD23F]" />Choisissez votre commune dans <b>Quêtes</b> pour la faire gagner.
            </Link>
          )}
        </section>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1" role="group">
          {(['communes', 'players'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
              className={cn("rounded-lg py-2 text-sm font-bold", tab === t ? "bg-primary text-white" : "text-slate-500")}>
              {t === 'communes' ? 'Communes' : 'Joueurs'}
            </button>
          ))}
        </div>

        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          {loading ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-slate-500">Personne n'a encore marqué de points cette semaine. Sois le premier, ndeko !</p>
          ) : (
            <ol className="space-y-2.5">
              {list.map((r: any, i: number) => {
                const isMe = tab === 'communes' ? r.commune === profile?.commune : r.uid === user?.uid;
                return (
                  <li key={r.id ?? i} className={cn("space-y-1", isMe && "text-amber-700 dark:text-amber-400")}>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-6 text-xs font-black text-slate-400 tabular-nums">{i + 1}</span>
                      <span className="font-bold flex-1 truncate">
                        {tab === 'communes' ? r.commune : r.name}
                        {tab === 'players' && r.commune && <span className="font-normal text-xs text-slate-500"> · {r.commune}</span>}
                        {tab === 'players' && r.isSentinel && <span className="ml-1 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 px-1.5 py-0.5 text-[10px] font-black uppercase">Sentinelle</span>}
                        {isMe && <span className="text-xs font-black"> (vous)</span>}
                      </span>
                      <span className="font-black tabular-nums">{Number(r.points || 0).toLocaleString('fr-FR')}</span>
                    </div>
                    <div className="ml-8 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className={cn("h-full rounded-full", isMe ? "bg-amber-500" : "bg-sky-500")} style={{ width: `${(Number(r.points || 0) / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {tab === 'players' && me && !(players || []).some((p: any) => p.uid === user?.uid) && (
            <p className="text-xs text-slate-500 border-t pt-2">Vos points cette semaine : <b className="text-slate-800 dark:text-slate-200">{Number(me.points || 0).toLocaleString('fr-FR')}</b></p>
          )}
          <p className="text-[11px] text-slate-500">Points = XP gagnés cette semaine (votes, signalements, missions). Remise à zéro chaque lundi à 00:00, heure de Kinshasa.</p>
        </section>
      </div>
    </div>
  );
}
