'use client';

/**
 * Page « Quêtes » : progression du joueur, missions du jour, badges, commune et gains.
 * Lecture seule pour le score (écrit par le serveur) ; l'usager ne choisit que sa commune.
 */
import Link from 'next/link';
import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Flame, Trophy, Target, Award, Wallet, MapPin, ChevronRight, Check, Lock } from 'lucide-react';
import { useUser, useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  levelProgress, rankFor, RANKS, DAILY_MISSIONS, BADGES, COMMUNES, kinshasaDayKey, XP,
} from '@/lib/game';
import { DAILY_REWARD_CAP_CDF, REWARD_CDF } from '@/lib/pricing';
import SpeedSharingToggle from '@/components/game/speed-sharing-toggle';
import { FlowCarBadge } from '@/components/kin/vehicles';
import { KinLoader, YaFlowSays } from '@/components/kin/street';
import { RANK_TAGLINES } from '@/lib/kin-slang';

export default function QuestsPage() {
  const { user } = useUser();
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const day = kinshasaDayKey();

  const userRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: profile } = useDoc<any>(userRef);
  const missionRef = useMemoFirebase(() => (user ? doc(firestore, 'missions', `${user.uid}_${day}`) : null), [firestore, user, day]);
  const { data: mission } = useDoc<any>(missionRef);
  const [savingCommune, setSavingCommune] = useState(false);

  if (!profile) {
    return <KinLoader className="p-10" />;
  }

  const xp = Number(profile.xp || 0);
  const { level, current, needed, pct } = levelProgress(xp);
  const yesterday = kinshasaDayKey(new Date(Date.now() - 24 * 3600 * 1000));
  const streak = profile.lastActiveDay === day || profile.lastActiveDay === yesterday ? Number(profile.streakDays || 0) : 0;
  const owned: string[] = profile.badges || [];
  const progress: Record<string, number> = mission?.progress || {};
  const completed: string[] = mission?.completed || [];
  const nextRank = RANKS.find(r => r.from > level);

  const saveCommune = async (commune: string) => {
    if (!userRef) return;
    setSavingCommune(true);
    try {
      await updateDoc(userRef, { commune });
      toast({ title: `Vous jouez pour ${commune}`, description: 'Vos points de la semaine comptent maintenant pour votre commune.' });
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'enregistrer la commune.", variant: 'destructive' });
    } finally {
      setSavingCommune(false);
    }
  };

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 sm:p-4 md:p-6">
      <div className="max-w-3xl mx-auto w-full space-y-4 pb-24 md:pb-12">

        {/* Joueur */}
        <section className="relative overflow-hidden rounded-3xl bg-[#0A1A29] text-[#EAF3FA] border border-[#22425C] p-4 sm:p-5 space-y-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 kf-road-dash opacity-70" />
          <FlowCarBadge className="pointer-events-none absolute right-2 top-3 w-36 opacity-90 hidden sm:block" />
          <div className="relative flex items-center gap-4 sm:pr-32">
            <div className="grid place-items-center h-16 w-16 shrink-0 rounded-2xl bg-gradient-to-br from-[#2EB6F0] to-[#1A5E8C] text-2xl font-black">{level}</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-[#8EA8BD] font-bold">Niveau {level}</div>
              <h1 className="font-display uppercase tracking-wide text-2xl sm:text-3xl leading-none">{rankFor(level)}</h1>
              <p className="mt-1 text-xs text-[#8EA8BD] italic">{RANK_TAGLINES[rankFor(level)]}</p>
              <div className="mt-2 h-2 rounded-full bg-[#173248] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#2EB6F0] to-[#FFD23F]" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-[#8EA8BD] tabular-nums">
                {current} / {needed} XP{nextRank ? ` · prochain rang « ${nextRank.name} » au niveau ${nextRank.from}` : ''}
              </div>
            </div>
          </div>
          <YaFlowSays
            lines={[
              completed.length === DAILY_MISSIONS.length
                ? 'Toutes les missions du jour sont faites. Mokonzi ! Reviens lobi.'
                : `Encore ${DAILY_MISSIONS.length - completed.length} mission(s) aujourd’hui, ndeko. Tokende !`,
              streak > 0 ? `${streak} jour(s) na nzela sans t’arrêter. Ne casse pas la série !` : 'Joue un coup aujourd’hui pour lancer ta série.',
              nextRank ? `Encore un effort et tu deviens « ${nextRank.name} ».` : 'Tu es tout en haut. Respect, mokonzi ya nzela.',
            ]}
          />
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat icon={<Flame className="h-4 w-4 text-[#FF7A45]" />} value={streak} label={streak > 1 ? 'jours de suite' : 'jour de suite'} />
            <Stat icon={<Target className="h-4 w-4 text-[#2EB6F0]" />} value={Number(profile.gameVotes || 0)} label="votes" />
            <Stat icon={<MapPin className="h-4 w-4 text-[#FFD23F]" />} value={Number(profile.gameReports || 0)} label="signalements" />
          </div>
        </section>

        {/* Commune */}
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-black text-slate-900 dark:text-white">Ma commune</h2>
            <Link href="/classement" className="text-xs font-bold text-primary inline-flex items-center gap-1">Classement <ChevronRight className="h-3.5 w-3.5" /></Link>
          </div>
          <p className="text-xs text-slate-500">Vos XP de la semaine font gagner votre commune dans la bataille des communes.</p>
          <Select value={profile.commune || ''} onValueChange={saveCommune} disabled={savingCommune}>
            <SelectTrigger className="h-11 rounded-xl" aria-label="Choisir ma commune">
              <SelectValue placeholder="Choisir ma commune" />
            </SelectTrigger>
            <SelectContent>
              {COMMUNES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </section>

        {/* Missions du jour */}
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-slate-900 dark:text-white">Mosala ya lelo · Missions du jour</h2>
            <span className="text-[11px] text-slate-500">Nouvelles missions à minuit</span>
          </div>
          <ul className="space-y-3">
            {DAILY_MISSIONS.map(m => {
              const n = Math.min(m.target, progress[m.kind] || 0);
              const done = completed.includes(m.id);
              return (
                <li key={m.id}>
                  <Link href={m.href} className={cn("block rounded-2xl border p-3 transition-colors", done ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-slate-800 hover:border-primary/50")}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2">
                        {done && <Check className="h-4 w-4 text-emerald-600" />}{m.label}
                      </span>
                      <span className={cn("text-xs font-black shrink-0", done ? "text-emerald-600" : "text-amber-600")}>{done ? 'Ezali malamu !' : `+${m.xp} XP`}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className={cn("h-full rounded-full", done ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${(n / m.target) * 100}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-500 tabular-nums">{n}/{m.target}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-slate-500">
            Chaque vote rapporte {XP.vote} XP et {REWARD_CDF.upvote} FC, chaque signalement {XP.report} XP et {REWARD_CDF.incident_report} FC
            (FC limités à {DAILY_REWARD_CAP_CDF.toLocaleString('fr-FR')} par jour). Premier geste du jour : +{XP.streakDay} XP de série.
          </p>
        </section>

        <SpeedSharingToggle />

        {/* Badges */}
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <h2 className="font-black text-slate-900 dark:text-white inline-flex items-center gap-2"><Award className="h-4 w-4 text-amber-500" />Badges</h2>
          <div className="grid grid-cols-4 gap-2">
            {BADGES.map(b => {
              const has = owned.includes(b.id);
              return (
                <div key={b.id} className="text-center space-y-1" title={b.hint}>
                  <div className={cn("mx-auto grid place-items-center h-12 w-12 rounded-2xl", has ? "bg-amber-100 text-amber-600 dark:bg-amber-500/20" : "bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600")}>
                    {has ? <Trophy className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                  </div>
                  <div className={cn("text-[10px] font-bold leading-tight", has ? "text-slate-800 dark:text-slate-200" : "text-slate-400")}>{b.label}</div>
                  {!has && <div className="text-[9px] text-slate-400">{b.hint}</div>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Gains */}
        <Link href="/e-wallet" className="flex items-center justify-between gap-3 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-4">
          <span className="inline-flex items-center gap-3">
            <Wallet className="h-5 w-5" />
            <span>
              <span className="block font-black">{Number(profile.walletBalanceCDF || 0).toLocaleString('fr-FR')} FC gagnés</span>
              <span className="block text-xs text-emerald-100">Échangez-les contre des mégas ou un retrait Mobile Money</span>
            </span>
          </span>
          <ChevronRight className="h-5 w-5" />
        </Link>

        {/* Rangs */}
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <h2 className="font-black text-slate-900 dark:text-white">Les rangs</h2>
          <ol className="space-y-1">
            {RANKS.map(r => (
              <li key={r.name} className={cn("flex justify-between text-sm rounded-lg px-2 py-1", rankFor(level) === r.name && "bg-primary/10 font-black")}>
                <span>{r.name}</span><span className="text-slate-500 text-xs">niveau {r.from}+</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-[#11273A] border border-[#22425C] p-2.5">
      <div className="flex items-center justify-center gap-1.5 text-lg font-black tabular-nums">{icon}{value}</div>
      <div className="text-[10px] text-[#8EA8BD]">{label}</div>
    </div>
  );
}
