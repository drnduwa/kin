'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFirebase, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy, limit } from 'firebase/firestore';
import { UserProfile, StarTransaction, WithId, STAR_COSTS } from '@/lib/types';
import { initiateFlexPayPaymentAction, checkFlexPayStatusAction } from '@/app/actions';
import { 
  Star, 
  TrendingUp, 
  ShoppingCart, 
  ArrowDownCircle, 
  Loader2, 
  CheckCircle2, 
  Smartphone, 
  AlertCircle,
  Crown,
  CreditCard,
  Zap,
  Calendar,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Check,
  RefreshCw,
  Navigation,
  MessageCircle,
  Map as MapIcon,
  ChevronRight
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';

// Définition des Packs de Stars
const STAR_PACKS = [
  {
    id: 'pack_50',
    stars: 50,
    title: 'Pack Découverte',
    subtitle: 'Idéal pour trajets et requêtes IA ponctuelles',
    prices: { CDF: 5000, USD: 2 },
    labels: { CDF: '5 000 CDF', USD: '2 $' },
    popular: false,
  },
  {
    id: 'pack_150',
    stars: 150,
    title: 'Pack Essentiel',
    subtitle: 'Pour la navigation et les alertes quotidiennes',
    prices: { CDF: 13000, USD: 5 },
    labels: { CDF: '13 000 CDF', USD: '5 $' },
    popular: true,
  },
  {
    id: 'pack_400',
    stars: 400,
    title: 'Pack Pro Conducteur',
    subtitle: 'Usage intensif aux heures de pointe',
    prices: { CDF: 26000, USD: 10 },
    labels: { CDF: '26 000 CDF', USD: '10 $' },
    popular: false,
  },
  {
    id: 'pack_1000',
    stars: 1000,
    title: 'Pack Flotte & VTC',
    subtitle: 'Taxis, livreurs et conducteurs réguliers',
    prices: { CDF: 50000, USD: 20 },
    labels: { CDF: '50 000 CDF', USD: '20 $' },
    popular: false,
  },
];

// Définition des Pass Illimités (Navigation & IA sans décompte)
const UNLIMITED_PASSES = [
  {
    id: 'pass_weekly',
    passType: 'weekly' as const,
    title: 'Pass Hebdomadaire',
    durationDays: 7,
    subtitle: '7 jours d\'accès 100% illimité à toute l\'application',
    prices: { CDF: 10000, USD: 4 },
    labels: { CDF: '10 000 CDF', USD: '4 $' },
    popular: false,
  },
  {
    id: 'pass_monthly',
    passType: 'monthly' as const,
    title: 'Pass Mensuel Illimité',
    durationDays: 30,
    subtitle: '30 jours complets de sérénité sans compter les Stars',
    prices: { CDF: 30000, USD: 12 },
    labels: { CDF: '30 000 CDF', USD: '12 $' },
    popular: true,
  },
];

const OPERATORS = [
  { id: 'vodacom', name: 'M-Pesa (Vodacom)', shortName: 'M-Pesa', badge: '081, 082, 083', defaultPrefix: '081', bgActive: 'border-red-500 bg-red-50/50' },
  { id: 'orange', name: 'Orange Money', shortName: 'Orange Money', badge: '084, 085, 089', defaultPrefix: '085', bgActive: 'border-orange-500 bg-orange-50/50' },
  { id: 'airtel', name: 'Airtel Money', shortName: 'Airtel Money', badge: '097, 098, 099', defaultPrefix: '097', bgActive: 'border-red-600 bg-red-50/50' },
  { id: 'afrimoney', name: 'Afrimoney', shortName: 'Afrimoney', badge: '090, 091', defaultPrefix: '090', bgActive: 'border-purple-600 bg-purple-50/50' },
];

function MesStarsContent() {
  const { user, firestore } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userRef);

  const transactionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'star_transactions'), orderBy('timestamp', 'desc'), limit(20));
  }, [firestore, user]);
  const { data: transactions, isLoading: isTransLoading } = useCollection<StarTransaction>(transactionsQuery);

  // Consommation récente (100 dernières opérations) pour conseiller l'offre la plus économique.
  const usageQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'star_transactions'), orderBy('timestamp', 'desc'), limit(100));
  }, [firestore, user]);
  const { data: usage } = useCollection<StarTransaction>(usageQuery);

  // Sélecteur de devise
  const [currency, setCurrency] = useState<'CDF' | 'USD'>('CDF');

  // État du modal de paiement
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{
    type: 'pack' | 'pass';
    id: string;
    title: string;
    stars?: number;
    passType?: 'weekly' | 'monthly';
    amount: number;
    currency: 'CDF' | 'USD';
  } | null>(null);

  const [paymentChannel, setPaymentChannel] = useState<'mobile_money' | 'card'>('mobile_money');
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Détection automatique de l'opérateur selon le numéro
  const detectedOperatorId = useMemo(() => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 2) return null;
    const prefix = digits.startsWith('243') ? digits.substring(3, 5) : digits.startsWith('0') ? digits.substring(1, 3) : digits.substring(0, 2);
    if (['81', '82', '83'].includes(prefix)) return 'vodacom';
    if (['80', '84', '85', '89'].includes(prefix)) return 'orange';
    if (['97', '98', '99'].includes(prefix)) return 'airtel';
    if (['90', '91'].includes(prefix)) return 'afrimoney';
    return null;
  }, [phone]);

  const currentOperatorId = selectedOperator || detectedOperatorId;
  const currentOperator = OPERATORS.find(o => o.id === currentOperatorId);

  const handleSelectOperator = (opId: string) => {
    setSelectedOperator(opId);
    const op = OPERATORS.find(o => o.id === opId);
    if (op) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 4) {
        setPhone(op.defaultPrefix);
      }
    }
  };

  // État de la transaction en cours de validation FlexPay
  const [pendingOrderNumber, setPendingOrderNumber] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<'idle' | 'polling' | 'success' | 'failed'>('idle');
  const [pollCountdown, setPollCountdown] = useState(60);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Notification après redirection carte bancaire
  useEffect(() => {
    const paymentResult = searchParams.get('payment');
    if (paymentResult === 'approved') {
      toast({
        title: 'Paiement par carte validé !',
        description: 'Votre compte a été rechargé avec succès via FlexPay.',
        className: 'bg-emerald-600 text-white',
      });
    } else if (paymentResult === 'cancelled' || paymentResult === 'declined') {
      toast({
        title: 'Paiement non complété',
        description: 'La transaction par carte a été interrompue ou refusée.',
        variant: 'destructive',
      });
    }
  }, [searchParams, toast]);

  // Initialisation du téléphone à partir du profil
  useEffect(() => {
    if (profile?.phone && !phone) {
      setPhone(profile.phone);
    }
  }, [profile, phone]);

  // Nettoyage de l'intervalle de polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Vérification de pass actif
  const isPassActive = Boolean(
    profile?.hasActivePass &&
    profile?.passExpiresAt &&
    (profile.passExpiresAt.toDate ? profile.passExpiresAt.toDate() : new Date(profile.passExpiresAt)) > new Date()
  );

  const passExpiryFormatted = isPassActive && profile?.passExpiresAt
    ? format(profile.passExpiresAt.toDate ? profile.passExpiresAt.toDate() : new Date(profile.passExpiresAt), 'dd MMMM yyyy à HH:mm', { locale: fr })
    : null;

  // Ouvrir le modal d'achat pour un Pack
  const handleSelectPack = (pack: typeof STAR_PACKS[0]) => {
    setSelectedItem({
      type: 'pack',
      id: pack.id,
      title: `${pack.stars} Stars (${pack.title})`,
      stars: pack.stars,
      amount: pack.prices[currency],
      currency,
    });
    setPollStatus('idle');
    setPendingOrderNumber(null);
    setIsModalOpen(true);
  };

  // Ouvrir le modal d'achat pour un Pass
  const handleSelectPass = (pass: typeof UNLIMITED_PASSES[0]) => {
    setSelectedItem({
      type: 'pass',
      id: pass.id,
      title: pass.title,
      passType: pass.passType,
      amount: pass.prices[currency],
      currency,
    });
    setPollStatus('idle');
    setPendingOrderNumber(null);
    setIsModalOpen(true);
  };

  // Lancer le paiement FlexPay
  const handleStartPayment = async () => {
    if (!user || !selectedItem) return;

    if (paymentChannel === 'mobile_money') {
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length < 9) {
        toast({
          title: 'Numéro de téléphone requis',
          description: 'Veuillez saisir votre numéro Mobile Money (ex: 0812345678).',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Le serveur recalcule le prix et les Stars depuis l'identifiant de l'article.
      const res = await initiateFlexPayPaymentAction({
        idToken: await user.getIdToken(),
        itemId: selectedItem.id,
        currency: selectedItem.currency,
        channel: paymentChannel,
        phone: paymentChannel === 'mobile_money' ? phone : undefined,
      });

      if (!res.success || !res.orderNumber) {
        toast({
          title: 'Échec de l\'initialisation',
          description: res.error || 'Impossible d\'initier la transaction FlexPay.',
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      // Si Paiement Carte -> Redirection vers l'URL bancaire FlexPay
      if (paymentChannel === 'card' && res.url) {
        window.location.href = res.url;
        return;
      }

      // Si Mobile Money -> Démarre le polling automatique du statut FlexPay
      setPendingOrderNumber(res.orderNumber);
      setPollStatus('polling');
      setPollCountdown(60);

      const orderNum = res.orderNumber;
      let counter = 60;

      stopPolling();
      pollingIntervalRef.current = setInterval(async () => {
        counter -= 3;
        setPollCountdown(Math.max(0, counter));

        try {
          const statusRes = await checkFlexPayStatusAction(orderNum);
          if (statusRes.success && statusRes.status === '0') {
            stopPolling();
            setPollStatus('success');
            toast({
              title: 'Paiement confirmé ! 🎉',
              description: selectedItem.type === 'pack' 
                ? `+${selectedItem.stars} Stars créditées sur votre compte !` 
                : 'Votre Pass Illimité est désormais actif !',
              className: 'bg-emerald-600 text-white',
            });
          } else if (statusRes.status === '1') {
            stopPolling();
            setPollStatus('failed');
            toast({
              title: 'Paiement échoué',
              description: 'La transaction a été rejetée ou annulée sur votre téléphone.',
              variant: 'destructive',
            });
          }
        } catch (e) {
          console.warn('[FlexPay Polling] Erreur vérification:', e);
        }

        if (counter <= 0) {
          stopPolling();
          if (pollStatus !== 'success') {
            setPollStatus('failed');
          }
        }
      }, 3500);

    } catch (err: any) {
      toast({
        title: 'Erreur inattendue',
        description: err.message || 'Une erreur est survenue.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Ce que l'usager peut faire maintenant, et l'offre qui lui convient d'après SA consommation ──
  const balance = Number(profile?.currentStarsBalance || 0);
  const passExpiry: Date | null = isPassActive && profile?.passExpiresAt
    ? (profile.passExpiresAt.toDate ? profile.passExpiresAt.toDate() : new Date(profile.passExpiresAt))
    : null;
  const passDaysLeft = passExpiry ? Math.max(0, Math.ceil((passExpiry.getTime() - Date.now()) / 86400000)) : 0;

  const spent30 = useMemo(() => {
    const since = Date.now() - 30 * 86400000;
    return (usage || [])
      .filter(t => t.type === 'spent' && (t.timestamp?.toMillis ? t.timestamp.toMillis() : 0) >= since)
      .reduce((sum, t) => sum + Math.abs(Number(t.starsChange || 0)), 0);
  }, [usage]);

  // Prix d'une Star au pack « Essentiel » : base de comparaison avec le Pass mensuel.
  const essential = STAR_PACKS.find(p => p.id === 'pack_150')!;
  const monthly = UNLIMITED_PASSES.find(p => p.id === 'pass_monthly')!;
  const starCost = essential.prices[currency] / essential.stars;
  const monthlySpendValue = spent30 * starCost;
  const passPays = spent30 > 0 && monthlySpendValue >= monthly.prices[currency] * 0.9;
  const recommended: { kind: 'pack' | 'pass'; id: string; why: string } = isPassActive
    ? { kind: 'pass', id: 'pass_monthly', why: `Prolongez votre accès illimité avant le ${format(passExpiry!, 'd MMMM', { locale: fr })}.` }
    : passPays
      ? { kind: 'pass', id: 'pass_monthly', why: `Vous avez utilisé ${spent30} Stars en 30 jours (≈ ${fmt(monthlySpendValue, currency)}). Le Pass mensuel vous revient moins cher.` }
      : spent30 > 0
        ? { kind: 'pack', id: spent30 > 150 ? 'pack_400' : 'pack_150', why: `Vous utilisez environ ${spent30} Stars par mois : ce pack couvre votre usage.` }
        : { kind: 'pack', id: 'pack_150', why: 'Le plus choisi pour démarrer : GPS, alertes et assistant au quotidien.' };

  const offers = [
    ...UNLIMITED_PASSES.map(p => ({ kind: 'pass' as const, id: p.id, title: `Pass ${p.durationDays} jours`, line: 'Accès illimité', price: p.prices[currency], perUnit: `${fmt(p.prices[currency] / p.durationDays, currency)}/jour`, pick: () => handleSelectPass(p) })),
    ...STAR_PACKS.map(p => ({ kind: 'pack' as const, id: p.id, title: `${p.stars} Stars`, line: p.title.replace('Pack ', ''), price: p.prices[currency], perUnit: `${fmt(p.prices[currency] / p.stars, currency)}/Star`, pick: () => handleSelectPack(p) })),
  ];
  const rec = offers.find(o => o.id === recommended.id)!;
  const [showAllHistory, setShowAllHistory] = useState(false);
  const history = (transactions || []).slice(0, showAllHistory ? 20 : 4);

  return (
    <AppShell>
      <div className="w-full h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
        <div className="max-w-2xl mx-auto p-3 sm:p-6 space-y-4 pb-24 md:pb-12">

          {/* 1. MON ACCÈS MAINTENANT */}
          <section className="relative overflow-hidden rounded-3xl bg-[#0A1A29] text-white border border-[#22425C] p-5 shadow-xl">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#1E9BFF]/20 blur-3xl" />
            {isProfileLoading ? (
              <div className="py-6 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-[#2EB6F0]" /></div>
            ) : isPassActive ? (
              <div className="relative flex items-center gap-4">
                <DaysRing days={passDaysLeft} total={passDaysLeft > 7 ? 30 : 7} />
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                    <Crown className="h-3 w-3" /> Accès illimité
                  </div>
                  <h1 className="mt-1 text-2xl font-black leading-tight text-white">Tout est ouvert</h1>
                  <p className="text-xs text-[#8EA8BD]">GPS, carte et assistant sans compter, jusqu'au {passExpiryFormatted}.</p>
                </div>
              </div>
            ) : (
              <div className="relative space-y-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
                    <Star className="h-7 w-7 fill-amber-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#8EA8BD]">Mon solde</div>
                    <h1 className="text-3xl font-black leading-none text-white tabular-nums">{balance} <span className="text-lg text-amber-300">Stars</span></h1>
                  </div>
                </div>
                {/* Ce que le solde permet, concrètement */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Can n={Math.floor(balance / STAR_COSTS.NAVIGATION_SESSION)} label="trajets GPS" />
                  <Can n={Math.floor(balance / STAR_COSTS.AI_MESSAGE)} label="questions IA" />
                  <Can n={Math.floor(balance / STAR_COSTS.MAP_VIEW)} label="cartes live" />
                </div>
                {balance < 10 && (
                  <p className="rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs font-bold text-red-200">
                    {balance <= 0 ? 'Solde épuisé : rechargez pour continuer à utiliser le GPS et l’assistant.' : 'Solde presque vide : pensez à recharger.'}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* 2. NOTRE CONSEIL (d'après votre consommation réelle) */}
          {rec && (
            <section className="rounded-3xl border-2 border-[#1E9BFF] bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-[#1E9BFF]">
                <Sparkles className="h-3.5 w-3.5" /> Notre conseil pour vous
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-black text-slate-900 dark:text-white leading-tight">{rec.title}</div>
                  <p className="text-xs text-slate-500 leading-snug mt-0.5">{recommended.why}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-black text-slate-900 dark:text-white">{fmt(rec.price, currency)}</div>
                  <div className="text-[10px] font-bold text-slate-400">{rec.perUnit}</div>
                </div>
              </div>
              <Button onClick={rec.pick} className="w-full h-12 rounded-2xl font-black bg-[#1E9BFF] hover:bg-[#1789E6] text-white">
                {isPassActive ? 'Prolonger mon accès' : rec.kind === 'pass' ? 'Activer ce pass' : 'Recharger'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </section>
          )}

          {/* 3. TOUTES LES OFFRES, en une liste */}
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Toutes les offres</h2>
              <div className="flex rounded-full bg-slate-200/70 dark:bg-slate-800 p-0.5 text-[11px] font-black" role="group" aria-label="Devise">
                {(['CDF', 'USD'] as const).map(c => (
                  <button key={c} type="button" onClick={() => setCurrency(c)} aria-pressed={currency === c}
                    className={cn('rounded-full px-3 py-1 transition-colors', currency === c ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500')}>
                    {c === 'CDF' ? 'FC' : '$'}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {offers.map(o => (
                <button key={o.id} type="button" onClick={o.pick} className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                  <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', o.kind === 'pass' ? 'bg-[#1E9BFF]/10 text-[#1E9BFF]' : 'bg-amber-100 text-amber-600 dark:bg-amber-500/15')}>
                    {o.kind === 'pass' ? <Crown className="h-5 w-5" /> : <Star className="h-5 w-5 fill-current" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-black text-slate-900 dark:text-white">{o.title}</span>
                      {o.id === recommended.id && <span className="rounded-full bg-[#1E9BFF] px-1.5 py-0.5 text-[9px] font-black uppercase text-white">Conseillé</span>}
                    </span>
                    <span className="block text-[11px] text-slate-500">{o.line} · {o.perUnit}</span>
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-white shrink-0">{fmt(o.price, currency)}</span>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
            <p className="px-1 text-[11px] text-slate-500 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> M-Pesa, Orange Money, Airtel Money, Afrimoney ou carte. Les Stars n'expirent jamais.
            </p>
          </section>

          {/* 4. COMBIEN ÇA COÛTE */}
          {!isPassActive && (
            <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Ce que coûte chaque service</h2>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Cost icon={<Navigation className="h-4 w-4" />} label="Trajet GPS" stars={STAR_COSTS.NAVIGATION_SESSION} />
                <Cost icon={<MessageCircle className="h-4 w-4" />} label="Assistant IA" stars={STAR_COSTS.AI_MESSAGE} />
                <Cost icon={<MapIcon className="h-4 w-4" />} label="Carte live" stars={STAR_COSTS.MAP_VIEW} />
                <Cost icon={<Zap className="h-4 w-4" />} label="Vérif. route" stars={STAR_COSTS.ROAD_VERIFY} />
              </div>
              <p className="text-[11px] text-slate-500">Signaler, voter et chatter restent gratuits — et vous font même gagner des FC.</p>
            </section>
          )}

          {/* 5. HISTORIQUE (replié) */}
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-black text-slate-900 dark:text-white">Mes dernières opérations</h2>
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
              {isTransLoading ? (
                <div className="p-6 text-center"><Loader2 className="animate-spin mx-auto h-5 w-5 text-primary" /></div>
              ) : history.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 font-medium">Aucune opération pour le moment.</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.map(t => {
                    const isPurchase = t.type === 'purchase';
                    const isSpent = t.type === 'spent';
                    const change = Number(t.starsChange || 0);
                    return (
                      <div key={t.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-xl',
                          isPurchase ? 'bg-emerald-100 text-emerald-600' : isSpent ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600')}>
                          {isPurchase ? <ShoppingCart className="h-4 w-4" /> : isSpent ? <ArrowDownCircle className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-200">{t.description}</span>
                          <span className="block text-[10px] text-slate-400">{t.timestamp?.toDate ? format(t.timestamp.toDate(), 'd MMM, HH:mm', { locale: fr }) : '…'}</span>
                        </span>
                        <span className={cn('text-xs font-black tabular-nums shrink-0', change > 0 ? 'text-emerald-600' : change < 0 ? 'text-orange-600' : 'text-slate-500')}>
                          {change > 0 ? `+${change}` : change < 0 ? `${change}` : '—'} ⭐
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {(transactions?.length || 0) > 4 && (
                <button type="button" onClick={() => setShowAllHistory(v => !v)} className="w-full border-t border-slate-100 dark:border-slate-800 py-2.5 text-xs font-black text-primary">
                  {showAllHistory ? 'Voir moins' : `Voir tout (${transactions!.length})`}
                </button>
              )}
            </div>
          </section>

        </div>
      </div>

      {/* MODAL DE PAIEMENT SÉCURISÉ FLEXPAY */}
      <Dialog open={isModalOpen} onOpenChange={(open) => {
        if (!open && pollStatus === 'polling') {
          // Avertir que le polling sera interrompu
          stopPolling();
        }
        setIsModalOpen(open);
      }}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-3xl border-none shadow-2xl bg-white">
          
          {/* Header du modal */}
          <div className="bg-gradient-to-r from-slate-900 to-blue-950 p-6 text-white">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">FlexPay RDC</span>
              <Badge variant="outline" className="border-white/20 text-white text-[10px]">
                {selectedItem?.currency}
              </Badge>
            </div>
            <DialogTitle className="text-xl font-black mt-2 text-white">
              {selectedItem?.title}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-300 mt-1">
              Montant à payer : <strong className="text-white text-base">{selectedItem?.amount} {selectedItem?.currency}</strong>
            </DialogDescription>
          </div>

          <div className="p-6 space-y-6">
            
            {/* Cas 1: EN COURS DE POLLING (USSD PIN Prompt) */}
            {pollStatus === 'polling' ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4 space-y-4">
                <div className="relative mx-auto w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
                  <Smartphone className="h-10 w-10 text-amber-600 animate-pulse" />
                  <div className="absolute inset-0 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-black text-slate-900">Validez sur votre téléphone</h4>
                  <p className="text-xs text-slate-600 max-w-xs mx-auto">
                    Une demande de débit de <strong>{selectedItem?.amount} {selectedItem?.currency}</strong> a été envoyée au <strong>{phone}</strong>.
                  </p>
                  <p className="text-[11px] font-bold text-amber-700 mt-2">
                    Veuillez taper votre code secret Mobile Money pour confirmer.
                  </p>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl flex items-center justify-between text-xs text-slate-500 max-w-xs mx-auto">
                  <span className="flex items-center gap-1 font-medium">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> En attente du PIN...
                  </span>
                  <span className="font-mono font-bold text-slate-900">{pollCountdown}s</span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    stopPolling();
                    setPollStatus('idle');
                  }}
                  className="text-xs text-slate-400 hover:text-slate-700"
                >
                  Annuler la vérification
                </Button>
              </motion.div>
            ) : pollStatus === 'success' ? (
              /* Cas 2: PAIEMENT CONFIRMÉ */
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4 space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-emerald-900">Paiement Réussi !</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    {selectedItem?.type === 'pack'
                      ? `Vos ${selectedItem?.stars} Stars ont été créditées sur votre solde.`
                      : 'Votre Pass Illimité est désormais actif. Profitez-en !'}
                  </p>
                </div>
                <Button 
                  onClick={() => {
                    setIsModalOpen(false);
                    setPollStatus('idle');
                  }}
                  className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black"
                >
                  Continuer sur Kinshasa Flow
                </Button>
              </motion.div>
            ) : pollStatus === 'failed' ? (
              /* Cas 3: ÉCHEC */
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4 space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                  <AlertCircle className="h-10 w-10" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900">Transaction Non Validée</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Le paiement n'a pas été confirmé dans les temps ou a été refusé. Vérifiez votre solde Mobile Money et réessayez.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 h-12 rounded-2xl font-bold"
                  >
                    Fermer
                  </Button>
                  <Button 
                    onClick={() => setPollStatus('idle')}
                    className="flex-1 h-12 rounded-2xl bg-primary text-white font-bold"
                  >
                    Réessayer
                  </Button>
                </div>
              </motion.div>
            ) : (
              /* Cas 4: CHOIX DU MOYEN DE PAIEMENT */
              <div className="space-y-5">
                
                {/* Choix Mobile Money OU Carte */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentChannel('mobile_money')}
                    className={cn(
                      "p-3.5 rounded-2xl border-2 flex flex-col items-center gap-2 text-center transition-all",
                      paymentChannel === 'mobile_money'
                        ? "border-primary bg-primary/[0.04] text-primary font-black"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    <Smartphone className="h-6 w-6" />
                    <span className="text-xs">Mobile Money</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentChannel('card')}
                    className={cn(
                      "p-3.5 rounded-2xl border-2 flex flex-col items-center gap-2 text-center transition-all",
                      paymentChannel === 'card'
                        ? "border-primary bg-primary/[0.04] text-primary font-black"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    <CreditCard className="h-6 w-6" />
                    <span className="text-xs">Carte (Visa/Mastercard)</span>
                  </button>
                </div>

                {paymentChannel === 'mobile_money' ? (
                  <div className="space-y-4">
                    {/* Choix interactif du Réseau Mobile Money */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-slate-700">Choisissez votre réseau :</Label>
                        {currentOperator && (
                          <Badge variant="outline" className="text-[10px] font-black text-primary border-primary/30 bg-primary/5">
                            {currentOperator.shortName} sélectionné
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {OPERATORS.map(op => {
                          const isSelected = currentOperatorId === op.id;
                          return (
                            <button
                              key={op.id}
                              type="button"
                              onClick={() => handleSelectOperator(op.id)}
                              className={cn(
                                "p-2.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-1 cursor-pointer",
                                isSelected 
                                  ? cn("ring-2 ring-primary/20", op.bgActive)
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                              )}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className={cn("text-xs font-black", isSelected ? "text-slate-900" : "text-slate-700")}>
                                  {op.name}
                                </span>
                                <div className={cn(
                                  "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all",
                                  isSelected ? "border-primary bg-primary" : "border-slate-300"
                                )}>
                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">{op.badge}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Champ numéro */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Votre numéro Mobile Money (RDC) :</Label>
                      <Input
                        type="tel"
                        placeholder="Ex: 0812345678 ou 243812345678"
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          if (!e.target.value) setSelectedOperator(null);
                        }}
                        className="h-12 rounded-2xl text-base font-medium"
                      />
                      <p className="text-[10px] text-slate-400">
                        {currentOperator ? (
                          <span className="text-emerald-600 font-semibold">
                            ✓ Réseau : {currentOperator.name}. Vous recevrez un push USSD pour entrer votre PIN.
                          </span>
                        ) : (
                          "Vous recevrez un message USSD instantané sur ce numéro pour taper votre code secret."
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                    <CreditCard className="h-8 w-8 mx-auto text-slate-700" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-900">Paiement par Carte Sécurisé</p>
                      <p className="text-[11px] text-slate-500">
                        Vous serez redirigé vers la passerelle sécurisée FlexPay pour renseigner votre carte Visa ou Mastercard en toute confidentialité.
                      </p>
                    </div>
                  </div>
                )}

                {/* Bouton de confirmation */}
                <Button
                  onClick={handleStartPayment}
                  disabled={isSubmitting || (paymentChannel === 'mobile_money' && phone.trim().length < 9)}
                  className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-primary/20"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Connexion à FlexPay...
                    </span>
                  ) : paymentChannel === 'mobile_money' ? (
                    `Payer ${selectedItem?.amount} ${selectedItem?.currency} via ${currentOperator ? currentOperator.shortName : 'Mobile Money'}`
                  ) : (
                    `Continuer vers FlexPay (${selectedItem?.amount} ${selectedItem?.currency})`
                  )}
                </Button>

                <p className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-600" /> Transactions chiffrées & traitées par FlexPay RDC
                </p>

              </div>
            )}

          </div>

        </DialogContent>
      </Dialog>

    </AppShell>
  );
}

export default function MesStarsPage() {
  return (
    <React.Suspense fallback={
      <AppShell>
        <div className="h-full w-full flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8 text-primary" />
        </div>
      </AppShell>
    }>
      <MesStarsContent />
    </React.Suspense>
  );
}

function fmt(amount: number, currency: 'CDF' | 'USD') {
  return currency === 'CDF'
    ? `${Math.round(amount).toLocaleString('fr-FR')} FC`
    : `${amount < 10 ? amount.toFixed(2).replace(/\.00$/, '') : Math.round(amount)} $`;
}

/** Anneau des jours restants du pass. */
function DaysRing({ days, total }: { days: number; total: number }) {
  const r = 26, c = 2 * Math.PI * r, pct = Math.min(1, days / total);
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#173248" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="#3DDC97" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <span className="text-lg font-black">{days}<span className="block text-[9px] font-bold text-[#8EA8BD]">jour{days > 1 ? 's' : ''}</span></span>
      </div>
    </div>
  );
}

function Can({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 py-2">
      <div className="text-lg font-black tabular-nums">{n}</div>
      <div className="text-[10px] text-[#8EA8BD]">{label}</div>
    </div>
  );
}

function Cost({ icon, label, stars }: { icon: React.ReactNode; label: string; stars: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-2.5 py-2">
      <span className="text-slate-500">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <span className="font-black text-amber-600 shrink-0">{stars} ⭐</span>
    </div>
  );
}
