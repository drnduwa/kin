'use client';

/**
 * « Trajet » : coach de départ. Pour mon trajet, Google prévoit le temps de parcours à plusieurs
 * heures de départ ; on affiche les minutes dans les bouchons ET l'heure d'arrivée, sans cacher
 * que partir plus tard fait souvent arriver plus tard.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Navigation, Share2, LocateFixed, Loader2, Clock, Route as RouteIcon, ArrowRight } from 'lucide-react';
import { useUser, useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { COMMUNES } from '@/lib/game';
import { COMMUNE_CENTERS } from '@/lib/places';
import { getDepartureCoachAction } from '@/app/scale-actions';
import SpeedSharingToggle from '@/components/game/speed-sharing-toggle';

const HERE = '__ma_position__';
type Departure = { offsetMin: number; departLabel: string; departAt: string; durationMin: number; trafficMin: number; arriveLabel: string };
type Coach = {
  success: true;
  source: string;
  departures: Departure[];
  alternatives: Array<{ label: string; durationMin: number; trafficMin: number; distanceKm: number }>;
  best: { departAt: string; offsetMin: number; trafficMin: number; arriveLabel: string; savedTrafficMin: number };
  now: { durationMin: number; trafficMin: number; arriveLabel: string };
};

export default function DepartureCoach() {
  const { user } = useUser();
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const userRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: profile } = useDoc<any>(userRef);

  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('Gombe');
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(0);

  // Trajet enregistré dans le profil (sinon : ma commune → Gombe)
  useEffect(() => {
    if (!profile) return;
    setFrom(f => f || profile.commute?.from || profile.commune || 'Lemba');
    if (profile.commute?.to) setTo(profile.commute.to);
  }, [profile]);

  const locate = () => {
    if (!navigator.geolocation) { toast({ title: 'Position indisponible', variant: 'destructive' }); return; }
    navigator.geolocation.getCurrentPosition(
      p => { setHere({ lat: p.coords.latitude, lng: p.coords.longitude }); setFrom(HERE); },
      () => toast({ title: 'Position refusée', description: 'Choisissez votre commune de départ dans la liste.', variant: 'destructive' }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const run = useCallback(async () => {
    if (!user || !from || !to) return;
    const origin = from === HERE ? here : COMMUNE_CENTERS[from];
    const dest = COMMUNE_CENTERS[to];
    if (!origin || !dest) return;
    setLoading(true); setError(null);
    try {
      const res = await getDepartureCoachAction({ idToken: await user.getIdToken(), from: origin, to: dest });
      if (res.success) { setCoach(res as Coach); setPicked(0); } else { setCoach(null); setError(res.error); }
      if (userRef && from !== HERE && (profile?.commute?.from !== from || profile?.commute?.to !== to)) {
        updateDoc(userRef, { commute: { from, to } }).catch(() => {});
      }
    } catch {
      setError('Prévision indisponible.');
    } finally {
      setLoading(false);
    }
  }, [user, from, to, here, userRef, profile]);

  useEffect(() => { if (from && to) run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  const fromLabel = from === HERE ? 'ma position' : from;
  const share = async () => {
    if (!coach) return;
    const b = coach.best;
    const text = b.savedTrafficMin > 0
      ? `Avec Kinshasa Flow, en partant à ${b.departAt} j'évite ${b.savedTrafficMin} min de bouchons entre ${fromLabel} et ${to}. Et toi ? https://kinshasaflow.online`
      : `${fromLabel} → ${to} : ${coach.now.durationMin} min maintenant d'après Kinshasa Flow. Vérifie ton trajet : https://kinshasaflow.online`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch { /* annulé */ }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const maxMin = coach ? Math.max(...coach.departures.map(d => d.durationMin), 1) : 1;
  const sel = coach?.departures[picked];

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 sm:p-4 md:p-6">
      <div className="max-w-3xl mx-auto w-full space-y-4 pb-24 md:pb-12">
        <section className="rounded-3xl bg-[#0A1A29] text-[#EAF3FA] border border-[#22425C] p-4 space-y-3">
          <h1 className="text-lg font-black">Mon trajet</h1>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-[#8EA8BD]" htmlFor="coach-from">Départ</label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger id="coach-from" className="h-11 rounded-xl bg-[#11273A] border-[#22425C] text-[#EAF3FA]"><SelectValue placeholder="Commune" /></SelectTrigger>
                <SelectContent>
                  {here && <SelectItem value={HERE}>Ma position</SelectItem>}
                  {COMMUNES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="h-4 w-4 mb-3.5 text-[#8EA8BD]" />
            <div className="space-y-1">
              <label className="text-[11px] text-[#8EA8BD]" htmlFor="coach-to">Arrivée</label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger id="coach-to" className="h-11 rounded-xl bg-[#11273A] border-[#22425C] text-[#EAF3FA]"><SelectValue placeholder="Commune" /></SelectTrigger>
                <SelectContent>{COMMUNES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <button type="button" onClick={locate} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2EB6F0]">
            <LocateFixed className="h-3.5 w-3.5" />Partir de ma position
          </button>
          <p className="text-[11px] text-[#8EA8BD]">Les communes sont prises en leur centre. Pour une adresse précise, utilisez la navigation GPS.</p>
        </section>

        {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Calcul des heures de départ…</div>}
        {error && !loading && <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">{error}</div>}

        {coach && !loading && (
          <>
            <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">Partir maintenant</div>
                  <div className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">{coach.now.durationMin} min</div>
                  <div className="text-xs text-slate-500">dont {coach.now.trafficMin} min de bouchons · arrivée {coach.now.arriveLabel}</div>
                </div>
                {coach.best.savedTrafficMin > 0 && coach.best.offsetMin > 0 && (
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Moins de bouchons à</div>
                    <div className="text-xl font-black text-emerald-600 tabular-nums">{coach.best.departAt}</div>
                    <div className="text-xs text-emerald-700 dark:text-emerald-400">−{coach.best.savedTrafficMin} min dans les bouchons</div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1"><span>Quand partir ?</span><span>durée prévue</span></div>
                <div className="flex items-end gap-1.5 h-28" role="group" aria-label="Heures de départ">
                  {coach.departures.map((d, i) => (
                    <button key={d.offsetMin} type="button" onClick={() => setPicked(i)} aria-pressed={picked === i}
                      aria-label={`Départ ${d.departLabel} : ${d.durationMin} minutes`}
                      className="flex-1 h-full flex flex-col justify-end items-center gap-1 group">
                      <span className="text-[10px] font-bold tabular-nums text-slate-500">{d.durationMin}</span>
                      <span className={cn('w-full rounded-t-md transition-colors', picked === i ? 'bg-amber-400' : d.offsetMin === coach.best.offsetMin ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-700 group-hover:bg-slate-400')}
                        style={{ height: `${Math.max(8, (d.durationMin / maxMin) * 80)}%` }} />
                      <span className="text-[10px] tabular-nums text-slate-500">{d.departLabel === 'Maintenant' ? 'Mnt' : d.departAt}</span>
                    </button>
                  ))}
                </div>
              </div>
              {sel && (
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Départ <b>{sel.departLabel === 'Maintenant' ? 'maintenant' : `à ${sel.departAt}`}</b> : {sel.durationMin} min de route dont {sel.trafficMin} min de bouchons, arrivée vers <b>{sel.arriveLabel}</b>.
                  {sel.offsetMin > 0 && sel.offsetMin + sel.durationMin > coach.now.durationMin && ' Vous arrivez plus tard qu’en partant maintenant : attendre ne vaut le coup que si vous préférez passer moins de temps coincé.'}
                </p>
              )}
              <p className="text-[11px] text-slate-500">{coach.source}.</p>
            </section>

            {coach.alternatives?.length > 0 && (
              <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <h2 className="font-black text-slate-900 dark:text-white inline-flex items-center gap-2"><RouteIcon className="h-4 w-4" />Itinéraires maintenant</h2>
                <ul className="space-y-2">
                  {coach.alternatives.map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-sm">
                      <span className="min-w-0"><b className="block truncate">{a.label}</b><span className="text-xs text-slate-500">{a.distanceKm} km · {a.trafficMin} min de bouchons</span></span>
                      <span className="font-black tabular-nums shrink-0">{a.durationMin} min</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Link href="/k-flow-nav" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-white font-bold text-sm h-12"><Navigation className="h-4 w-4" />Navigation GPS</Link>
              <button type="button" onClick={share} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-white font-bold text-sm h-12"><Share2 className="h-4 w-4" />Partager</button>
            </div>
          </>
        )}

        <SpeedSharingToggle />
        <p className="text-[11px] text-slate-500 inline-flex items-center gap-1"><Clock className="h-3 w-3" />Prévision mise à jour toutes les 10 minutes.</p>
      </div>
    </div>
  );
}
