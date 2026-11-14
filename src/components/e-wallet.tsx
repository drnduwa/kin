'use client';

/**
 * E-Wallet citoyen : d'abord le solde et ce qu'on peut en faire, puis comment gagner aujourd'hui
 * (seulement ce qui marche vraiment), les demandes en attente et l'historique replié.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight, ArrowDownLeft, Wifi, Clock, ChevronRight, TrafficCone, CheckCircle2,
  MessagesSquare, Loader2, Coins, Repeat,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUser, useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';
import { requestWalletCashoutAction, rechargeDataFromWalletAction, getWalletTransactionsAction } from '@/app/actions';
import { REWARD_CDF, DAILY_REWARD_CAP_CDF, MIN_CASHOUT_CDF, DATA_PACK_CATALOG, CDF_PER_USD } from '@/lib/pricing';
import { kinshasaDayKey } from '@/lib/game';
import { useToast } from '@/hooks/use-toast';
import { play } from '@/lib/sfx';
import { cn } from '@/lib/utils';

const OPERATORS = [
  { id: 'Vodacom M-Pesa', short: 'M-Pesa', prefixes: ['81', '82', '83'] },
  { id: 'Orange Money', short: 'Orange', prefixes: ['80', '84', '85', '89'] },
  { id: 'Airtel Money', short: 'Airtel', prefixes: ['97', '98', '99'] },
  { id: 'Afrimoney', short: 'Afrimoney', prefixes: ['90', '91'] },
];

const DATA_DESC: Record<string, string> = {
  'Pass Jour 500 Mo': '24 h, tous réseaux',
  'Pass Semaine 2 Go': 'Une semaine de GPS',
  'Pass Mois 5 Go': 'Tout le mois',
};

function operatorFor(phone: string) {
  const d = phone.replace(/\D/g, '');
  const p = d.startsWith('243') ? d.slice(3, 5) : d.startsWith('0') ? d.slice(1, 3) : d.slice(0, 2);
  return OPERATORS.find(o => o.prefixes.includes(p))?.id ?? null;
}

const fc = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FC`;

type Tx = { id: string; type: string; source: string; amountCDF: number; description: string; status: string; balanceAfterCDF: number; timestamp: number };

export default function EWalletComponent() {
  const { user } = useUser();
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const userRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userRef);

  const [txs, setTxs] = useState<Tx[]>([]);
  const [isTxLoading, setIsTxLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    setIsTxLoading(true);
    try {
      const res = await getWalletTransactionsAction(await user.getIdToken());
      if (res?.success && res.transactions) setTxs(res.transactions as Tx[]);
    } catch (e) {
      console.warn('[E-Wallet] transactions:', e);
    } finally {
      setIsTxLoading(false);
    }
  }, [user]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const balance = Number(profile?.walletBalanceCDF ?? 0);
  const today = kinshasaDayKey();
  const earnedToday = useMemo(
    () => txs.filter(t => t.type === 'earning' && kinshasaDayKey(new Date(t.timestamp)) === today).reduce((s, t) => s + Math.max(0, t.amountCDF), 0),
    [txs, today],
  );
  const leftToday = Math.max(0, DAILY_REWARD_CAP_CDF - earnedToday);
  const pending = txs.filter(t => t.status === 'pending' && t.amountCDF < 0);
  const history = txs.slice(0, showAll ? txs.length : 4);
  const canCashout = balance >= MIN_CASHOUT_CDF;

  // ── Retrait ──
  const [cashoutOpen, setCashoutOpen] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [cashoutPhone, setCashoutPhone] = useState('');
  const [cashoutOperator, setCashoutOperator] = useState<string | null>(null);
  const [isCashoutSubmitting, setIsCashoutSubmitting] = useState(false);
  const detectedOp = operatorFor(cashoutPhone);
  const op = cashoutOperator ?? detectedOp;

  const openCashout = () => {
    setCashoutPhone(p => p || profile?.phone || '');
    setCashoutAmount(String(Math.floor(balance / 500) * 500 || MIN_CASHOUT_CDF));
    setCashoutOpen(true);
  };

  const handleCashoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amount = parseInt(cashoutAmount, 10);
    if (isNaN(amount) || amount < MIN_CASHOUT_CDF) { toast({ title: 'Montant trop petit', description: `Le retrait minimum est de ${fc(MIN_CASHOUT_CDF)}.`, variant: 'destructive' }); return; }
    if (amount > balance) { toast({ title: 'Solde insuffisant', description: `Votre solde est de ${fc(balance)}.`, variant: 'destructive' }); return; }
    if (!op) { toast({ title: 'Opérateur inconnu', description: 'Choisissez votre réseau Mobile Money.', variant: 'destructive' }); return; }
    setIsCashoutSubmitting(true);
    try {
      const res = await requestWalletCashoutAction({ idToken: await user.getIdToken(), amountCDF: amount, phone: cashoutPhone, operator: op });
      if (res.success) {
        play('tada');
        toast({ title: 'Demande de retrait envoyée', description: res.message, className: 'bg-emerald-600 text-white font-bold' });
        setCashoutOpen(false);
        loadTransactions();
      } else {
        toast({ title: 'Erreur', description: res.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setIsCashoutSubmitting(false);
    }
  };

  // ── Mégas ──
  const [dataOpen, setDataOpen] = useState(false);
  const packs = Object.entries(DATA_PACK_CATALOG).map(([name, cdf]) => ({ name, cdf }));
  const [selectedPack, setSelectedPack] = useState(packs[0]);
  const [isDataSubmitting, setIsDataSubmitting] = useState(false);

  const handleDataRechargeSubmit = async () => {
    if (!user) return;
    if (balance < selectedPack.cdf) { toast({ title: 'Solde insuffisant', description: `Il faut ${fc(selectedPack.cdf)} pour ce forfait.`, variant: 'destructive' }); return; }
    setIsDataSubmitting(true);
    try {
      const res = await rechargeDataFromWalletAction({ idToken: await user.getIdToken(), phone: profile?.phone || '', dataPack: selectedPack.name });
      if (res.success) {
        play('tada');
        toast({ title: 'Demande de forfait envoyée', description: res.message, className: 'bg-blue-600 text-white font-bold' });
        setDataOpen(false);
        loadTransactions();
      } else {
        toast({ title: 'Erreur', description: res.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setIsDataSubmitting(false);
    }
  };

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-2xl mx-auto p-3 sm:p-6 space-y-4 pb-24 md:pb-12">

        {/* 1. SOLDE + ce qu'on peut en faire */}
        <section className="relative overflow-hidden rounded-3xl bg-[#0A1A29] text-white border border-[#22425C] p-5 shadow-xl space-y-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="relative">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8EA8BD]">Mon solde</div>
            {isProfileLoading ? (
              <Loader2 className="mt-2 h-6 w-6 animate-spin text-emerald-300" />
            ) : (
              <h1 className="text-4xl font-black leading-tight text-white tabular-nums">
                {balance.toLocaleString('fr-FR')} <span className="text-2xl text-emerald-300">FC</span>
                <span className="ml-2 text-sm font-semibold text-[#8EA8BD]">≈ {(balance / CDF_PER_USD).toFixed(2)} $</span>
              </h1>
            )}
          </div>

          {/* Gains du jour vs plafond */}
          <div className="relative space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#EAF3FA]">Gagné aujourd'hui</span>
              <span className="tabular-nums text-[#8EA8BD]"><b className="text-emerald-300">{fc(earnedToday)}</b> / {fc(DAILY_REWARD_CAP_CDF)}</span>
            </div>
            <div className="h-2 rounded-full bg-[#173248] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-[#FFD23F] transition-all" style={{ width: `${Math.min(100, (earnedToday / DAILY_REWARD_CAP_CDF) * 100)}%` }} />
            </div>
          </div>

          <div className="relative grid grid-cols-2 gap-2">
            <Button onClick={openCashout} disabled={!canCashout}
              className="h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black gap-1.5 disabled:opacity-50">
              <ArrowUpRight className="h-4 w-4 stroke-[3]" /> Retirer
            </Button>
            <Button onClick={() => setDataOpen(true)} disabled={balance < packs[0].cdf} variant="outline"
              className="h-12 rounded-2xl border-white/20 bg-white/10 hover:bg-white/20 text-white hover:text-white font-black gap-1.5 disabled:opacity-50">
              <Wifi className="h-4 w-4 text-sky-300" /> Mégas
            </Button>
          </div>
          {!canCashout && !isProfileLoading && (
            <p className="relative text-[11px] text-[#8EA8BD]">
              Encore <b className="text-white">{fc(MIN_CASHOUT_CDF - balance)}</b> avant votre premier retrait Mobile Money
              {balance < packs[0].cdf ? '.' : ' — ou prenez déjà des mégas.'}
            </p>
          )}
        </section>

        {/* 2. DEMANDES EN ATTENTE */}
        {pending.length > 0 && (
          <section className="rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-amber-800 dark:text-amber-300"><Clock className="h-3.5 w-3.5" /> En cours de traitement par l'équipe</div>
            {pending.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-amber-900 dark:text-amber-100">{t.source === 'data_recharge' ? 'Forfait mégas' : 'Retrait Mobile Money'}</span>
                <span className="font-black tabular-nums text-amber-900 dark:text-amber-100 shrink-0">{fc(Math.abs(t.amountCDF))}</span>
              </div>
            ))}
          </section>
        )}

        {/* 3. GAGNER MAINTENANT (seulement ce qui marche aujourd'hui) */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Gagner maintenant</h2>
            <span className="text-[11px] text-slate-500">{leftToday > 0 ? `encore ${fc(leftToday)} possibles aujourd'hui` : 'plafond du jour atteint'}</span>
          </div>
          {leftToday === 0 ? (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 text-sm text-slate-600 dark:text-slate-300">
              Bravo, vous avez atteint {fc(DAILY_REWARD_CAP_CDF)} aujourd'hui ! Vos signalements comptent toujours pour l'XP et la carte. Nouveaux gains demain.
            </div>
          ) : (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              <Earn href="/community-chat" icon={<MessagesSquare className="h-5 w-5" />} tint="bg-orange-100 text-orange-600 dark:bg-orange-500/15"
                title="Lancer une alerte" sub="Chat Direct : bouchon, travaux, police" amount={REWARD_CDF.incident_report} />
              <Earn href="/hazard-map" icon={<TrafficCone className="h-5 w-5" />} tint="bg-red-100 text-red-600 dark:bg-red-500/15"
                title="Signaler un danger" sub="Trou, route abîmée, blocage" amount={REWARD_CDF.incident_report} />
              <Earn href="/verifier-trafic" icon={<CheckCircle2 className="h-5 w-5" />} tint="bg-sky-100 text-sky-600 dark:bg-sky-500/15"
                title="Voter sur place" sub="Carrefour bloqué ou dégagé ?" amount={REWARD_CDF.upvote} />
            </div>
          )}
          <p className="px-1 text-[11px] text-slate-500">Chaque contribution est payée une fois, après vérification. Plafond : {fc(DAILY_REWARD_CAP_CDF)} par jour.</p>
        </section>

        {/* 4. HISTORIQUE (replié) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Mes opérations</h2>
            <button type="button" onClick={loadTransactions} className="text-slate-400 hover:text-primary p-1" aria-label="Actualiser"><Repeat className={cn('h-4 w-4', isTxLoading && 'animate-spin')} /></button>
          </div>
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
            {isTxLoading && txs.length === 0 ? (
              <div className="p-6 text-center"><Loader2 className="animate-spin mx-auto h-5 w-5 text-primary" /></div>
            ) : txs.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <Coins className="mx-auto h-7 w-7 text-emerald-500" />
                <p className="text-xs text-slate-500">Pas encore de gains. Lancez une alerte dans le Chat Direct pour gagner vos premiers {REWARD_CDF.incident_report} FC.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map(t => {
                  const plus = t.amountCDF > 0;
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-xl', plus ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600')}>
                        {plus ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-200">{t.description}</span>
                        <span className="block text-[10px] text-slate-400">
                          {new Date(t.timestamp).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {t.status === 'pending' && <span className="text-amber-600 font-bold"> · en attente</span>}
                        </span>
                      </span>
                      <span className={cn('text-xs font-black tabular-nums shrink-0', plus ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200')}>
                        {plus ? '+' : ''}{t.amountCDF.toLocaleString('fr-FR')} FC
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {txs.length > 4 && (
              <button type="button" onClick={() => setShowAll(v => !v)} className="w-full border-t border-slate-100 dark:border-slate-800 py-2.5 text-xs font-black text-primary">
                {showAll ? 'Voir moins' : `Voir tout (${txs.length})`}
              </button>
            )}
          </div>
        </section>
      </div>

      {/* ── Retrait Mobile Money ── */}
      <Dialog open={cashoutOpen} onOpenChange={setCashoutOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Retirer sur Mobile Money</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">L'équipe vérifie la demande puis paie sur votre numéro.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCashoutSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Montant</Label>
              <div className="relative">
                <Input type="number" inputMode="numeric" min={MIN_CASHOUT_CDF} max={balance} value={cashoutAmount} onChange={e => setCashoutAmount(e.target.value)} className="h-12 rounded-xl pr-12 font-black text-lg" required />
                <span className="absolute right-3 top-3.5 text-xs font-bold text-slate-400">FC</span>
              </div>
              <div className="flex gap-1.5">
                {[MIN_CASHOUT_CDF, 2000, 5000].filter(v => v <= balance).map(v => (
                  <button key={v} type="button" onClick={() => setCashoutAmount(String(v))} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600">{fc(v)}</button>
                ))}
                <button type="button" onClick={() => setCashoutAmount(String(balance))} className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">Tout ({fc(balance)})</button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Numéro Mobile Money</Label>
              <Input type="tel" value={cashoutPhone} onChange={e => { setCashoutPhone(e.target.value); setCashoutOperator(null); }} placeholder="Ex. : 0812345678" className="h-12 rounded-xl" required />
              <div className="flex flex-wrap gap-1.5">
                {OPERATORS.map(o => (
                  <button key={o.id} type="button" onClick={() => setCashoutOperator(o.id)} aria-pressed={op === o.id}
                    className={cn('rounded-full border px-2.5 py-1 text-[11px] font-bold', op === o.id ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-600')}>
                    {o.short}{detectedOp === o.id && !cashoutOperator ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={isCashoutSubmitting} className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black">
              {isCashoutSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Demander ${fc(parseInt(cashoutAmount || '0', 10) || 0)}`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Forfaits mégas ── */}
      <Dialog open={dataOpen} onOpenChange={setDataOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Des mégas avec mon solde</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">Activé sur {profile?.phone || 'votre numéro'} après traitement par l'équipe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {packs.map(p => {
              const affordable = balance >= p.cdf;
              return (
                <button key={p.name} type="button" onClick={() => setSelectedPack(p)} disabled={!affordable} aria-pressed={selectedPack.name === p.name}
                  className={cn('w-full p-3 rounded-2xl border-2 text-left flex justify-between items-center transition-all disabled:opacity-40',
                    selectedPack.name === p.name ? 'border-primary bg-primary/5' : 'border-slate-200')}>
                  <span>
                    <span className="block font-bold text-sm text-slate-900">{p.name}</span>
                    <span className="block text-[11px] text-slate-500">{DATA_DESC[p.name] || ''}{!affordable ? ` · il manque ${fc(p.cdf - balance)}` : ''}</span>
                  </span>
                  <span className="font-black text-sm text-primary shrink-0">{fc(p.cdf)}</span>
                </button>
              );
            })}
          </div>
          <Button onClick={handleDataRechargeSubmit} disabled={isDataSubmitting || balance < selectedPack.cdf} className="w-full h-12 rounded-2xl font-black">
            {isDataSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Demander pour ${fc(selectedPack.cdf)}`}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Earn({ href, icon, tint, title, sub, amount }: { href: string; icon: React.ReactNode; tint: string; title: string; sub: string; amount: number }) {
  return (
    <Link href={href} className="flex items-center gap-3 p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', tint)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-slate-900 dark:text-white">{title}</span>
        <span className="block text-[11px] text-slate-500 truncate">{sub}</span>
      </span>
      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-black text-emerald-700 dark:text-emerald-400 shrink-0">+{amount} FC</span>
      <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
    </Link>
  );
}
