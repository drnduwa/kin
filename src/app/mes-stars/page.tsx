'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFirebase, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy, limit } from 'firebase/firestore';
import { UserProfile, StarTransaction, WithId } from '@/lib/types';
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
  RefreshCw
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

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
  { id: 'vodacom', name: 'M-Pesa (Vodacom)', color: 'border-red-500 hover:bg-red-50', badge: '081, 082, 083' },
  { id: 'orange', name: 'Orange Money', color: 'border-orange-500 hover:bg-orange-50', badge: '084, 085, 089' },
  { id: 'airtel', name: 'Airtel Money', color: 'border-red-600 hover:bg-red-50', badge: '097, 098, 099' },
  { id: 'afrimoney', name: 'Afrimoney', color: 'border-purple-500 hover:bg-purple-50', badge: '090, 091' },
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
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const res = await initiateFlexPayPaymentAction({
        userId: user.uid,
        itemType: selectedItem.type,
        itemId: selectedItem.id,
        stars: selectedItem.stars,
        passType: selectedItem.passType,
        amount: selectedItem.amount,
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

  return (
    <AppShell>
      <div className="w-full h-full overflow-y-auto bg-slate-50/50 pb-20">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
          
          {/* Bannière de Bienvenue / Statut Utilisateur */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 sm:p-8 shadow-xl">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 uppercase text-[10px] tracking-widest font-black">
                    Paiement Sécurisé FlexPay RDC
                  </Badge>
                  {isPassActive && (
                    <Badge className="bg-emerald-500 text-white font-black text-[10px] tracking-wider flex items-center gap-1">
                      <Crown className="h-3 w-3 fill-white" /> Pass Illimité Actif
                    </Badge>
                  )}
                </div>
                <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
                  Recharger mon compte
                </h1>
                <p className="text-sm text-slate-300 max-w-xl">
                  {isPassActive
                    ? `Votre Pass Illimité est actif jusqu'au ${passExpiryFormatted}. Vous bénéficiez de tous les services sans décompte de Stars.`
                    : 'Achetez des Stars à l\'unité ou activez un Pass Illimité via Mobile Money (M-Pesa, Orange, Airtel, Afrimoney) ou Carte Bancaire.'}
                </p>
              </div>

              {/* Solde & Statut */}
              <div className="bg-white/10 backdrop-blur-md border border-white/10 p-5 rounded-2xl flex items-center gap-5 shrink-0">
                <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-2xl text-amber-400">
                  <Star className="h-8 w-8 fill-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Solde Actuel</p>
                  <div className="text-3xl font-black text-white">
                    {profile?.currentStarsBalance || 0} <span className="text-amber-400 text-xl">Stars</span>
                  </div>
                  {isPassActive && (
                    <p className="text-[11px] text-emerald-400 font-bold mt-0.5 flex items-center gap-1">
                      <Check className="h-3 w-3 stroke-[3]" /> Accès illimité sans décompte
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sélecteur de Devise */}
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs sm:text-sm font-bold">Choisissez votre devise d'affichage :</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <Button
                size="sm"
                variant={currency === 'CDF' ? 'default' : 'ghost'}
                onClick={() => setCurrency('CDF')}
                className={cn("rounded-lg text-xs font-black h-8 px-4", currency === 'CDF' ? "bg-primary text-white shadow-sm" : "text-slate-600")}
              >
                Franc Congolais (CDF)
              </Button>
              <Button
                size="sm"
                variant={currency === 'USD' ? 'default' : 'ghost'}
                onClick={() => setCurrency('USD')}
                className={cn("rounded-lg text-xs font-black h-8 px-4", currency === 'USD' ? "bg-primary text-white shadow-sm" : "text-slate-600")}
              >
                Dollar US (USD)
              </Button>
            </div>
          </div>

          {/* Onglets : Packs de Stars VS Pass Illimités */}
          <Tabs defaultValue="packs" className="space-y-6">
            <TabsList className="grid grid-cols-2 w-full max-w-md mx-auto h-12 rounded-2xl bg-slate-200/70 p-1">
              <TabsTrigger value="packs" className="rounded-xl font-black text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                ⭐ Packs de Stars
              </TabsTrigger>
              <TabsTrigger value="passes" className="rounded-xl font-black text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                👑 Pass Illimités
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: PACKS DE STARS */}
            <TabsContent value="packs" className="space-y-4">
              <div className="text-center max-w-lg mx-auto mb-4">
                <h2 className="text-xl font-black text-slate-900">Recharges de Stars à la carte</h2>
                <p className="text-xs text-slate-500">Payez uniquement ce que vous consommez. Vos Stars n'expirent jamais.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {STAR_PACKS.map((pack) => (
                  <Card 
                    key={pack.id} 
                    className={cn(
                      "relative border-2 rounded-3xl transition-all duration-300 hover:shadow-xl flex flex-col justify-between overflow-hidden",
                      pack.popular ? "border-amber-500 bg-amber-50/20 shadow-md" : "border-slate-200/80 bg-white"
                    )}
                  >
                    {pack.popular && (
                      <div className="bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-wider py-1 text-center">
                        ⭐ Plus Populaire
                      </div>
                    )}
                    <CardHeader className="p-6 pb-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black uppercase text-slate-400 tracking-wider">Pack</span>
                        <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-black">
                          ⭐
                        </div>
                      </div>
                      <CardTitle className="text-3xl font-black text-slate-900">
                        {pack.stars} <span className="text-base text-amber-500">Stars</span>
                      </CardTitle>
                      <p className="text-xs font-semibold text-slate-700 mt-1">{pack.title}</p>
                      <CardDescription className="text-[11px] text-slate-500 leading-tight">
                        {pack.subtitle}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="p-6 pt-4">
                      <div className="pt-3 border-t border-slate-100 flex items-baseline justify-between">
                        <span className="text-xs text-slate-400 font-bold">Prix</span>
                        <span className="text-xl font-black text-slate-900">{pack.labels[currency]}</span>
                      </div>
                    </CardContent>

                    <CardFooter className="p-6 pt-0">
                      <Button
                        onClick={() => handleSelectPack(pack)}
                        className={cn(
                          "w-full h-12 rounded-2xl font-black text-xs uppercase tracking-wider transition-all",
                          pack.popular 
                            ? "bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20" 
                            : "bg-slate-900 hover:bg-slate-800 text-white"
                        )}
                      >
                        Acheter ce Pack <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* TAB 2: PASS ILLIMITÉS */}
            <TabsContent value="passes" className="space-y-4">
              <div className="text-center max-w-lg mx-auto mb-4">
                <h2 className="text-xl font-black text-slate-900">Abonnements Pass Illimités</h2>
                <p className="text-xs text-slate-500">Zéro souci de solde. Accès 100% illimité au GPS K-Flow, alertes en temps réel et IA.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                {UNLIMITED_PASSES.map((pass) => (
                  <Card 
                    key={pass.id} 
                    className={cn(
                      "relative border-2 rounded-3xl transition-all duration-300 hover:shadow-2xl flex flex-col justify-between overflow-hidden",
                      pass.popular ? "border-primary bg-primary/[0.03] shadow-lg ring-2 ring-primary/20" : "border-slate-200 bg-white"
                    )}
                  >
                    {pass.popular && (
                      <div className="bg-primary text-white font-black text-[10px] uppercase tracking-widest py-1.5 text-center flex items-center justify-center gap-1">
                        <Crown className="h-3 w-3 fill-white" /> Meilleure Valeur
                      </div>
                    )}
                    <CardHeader className="p-6 sm:p-8 pb-4">
                      <div className="flex items-center justify-between mb-3">
                        <Badge variant="outline" className="text-xs font-bold text-slate-600">
                          {pass.durationDays} Jours
                        </Badge>
                        <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black">
                          <Crown className="h-5 w-5 fill-primary" />
                        </div>
                      </div>
                      <CardTitle className="text-2xl font-black text-slate-900">
                        {pass.title}
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500 mt-1">
                        {pass.subtitle}
                      </CardDescription>

                      <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
                          <Check className="h-4 w-4 text-emerald-600 stroke-[3]" /> GPS K-Flow Nav illimité
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
                          <Check className="h-4 w-4 text-emerald-600 stroke-[3]" /> Requêtes Assistant IA illimitées
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
                          <Check className="h-4 w-4 text-emerald-600 stroke-[3]" /> Radar et Carte des Bouchons 24/7
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-6 sm:p-8 pt-0">
                      <div className="p-4 rounded-2xl bg-slate-50 flex items-baseline justify-between mb-4">
                        <span className="text-xs font-bold text-slate-500">Tarif tout inclus</span>
                        <span className="text-2xl font-black text-slate-900">{pass.labels[currency]}</span>
                      </div>

                      <Button
                        onClick={() => handleSelectPass(pass)}
                        className={cn(
                          "w-full h-12 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-md",
                          pass.popular 
                            ? "bg-primary hover:bg-primary/90 text-white shadow-primary/20" 
                            : "bg-slate-900 hover:bg-slate-800 text-white"
                        )}
                      >
                        Activer le Pass ({pass.labels[currency]})
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* Historique des Transactions */}
          <div className="mt-12 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">Historique de vos recharges & utilisations</h3>
              <Badge variant="outline" className="text-[11px] font-bold text-slate-500">
                20 dernières opérations
              </Badge>
            </div>

            <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
              <CardContent className="p-0">
                {isTransLoading ? (
                  <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></div>
                ) : !transactions || transactions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400 font-medium">
                    Aucune transaction enregistrée pour le moment.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {transactions.map((t) => {
                      const isPurchase = t.type === 'purchase';
                      const isSpent = t.type === 'spent';
                      const date = t.timestamp?.toDate ? format(t.timestamp.toDate(), 'dd MMM yyyy, HH:mm', { locale: fr }) : '...';

                      return (
                        <div key={t.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-10 w-10 rounded-2xl flex items-center justify-center shrink-0",
                              isPurchase ? "bg-emerald-100 text-emerald-600" :
                              isSpent ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"
                            )}>
                              {isPurchase ? <ShoppingCart className="h-5 w-5" /> :
                               isSpent ? <ArrowDownCircle className="h-5 w-5" /> :
                               <Sparkles className="h-5 w-5" />}
                            </div>
                            <div>
                              <p className="text-xs sm:text-sm font-bold text-slate-900">{t.description}</p>
                              <p className="text-[10px] text-slate-400">{date}</p>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className={cn(
                              "text-xs sm:text-sm font-black",
                              isPurchase ? "text-emerald-600" :
                              isSpent ? "text-orange-600" : "text-slate-900"
                            )}>
                              {isPurchase && t.starsChange > 0 ? `+${t.starsChange} ⭐` :
                               isSpent ? `-${Math.abs(t.starsChange)} ⭐` :
                               'Pass Actif'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

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
                    {/* Opérateurs supportés */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Réseaux supportés :</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {OPERATORS.map(op => (
                          <div key={op.id} className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-800">{op.name}</span>
                            <span className="text-[9px] font-mono text-slate-400">{op.badge}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Champ numéro */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Votre numéro Mobile Money (RDC) :</Label>
                      <Input
                        type="tel"
                        placeholder="Ex: 0812345678 ou 243812345678"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="h-12 rounded-2xl text-base font-medium"
                      />
                      <p className="text-[10px] text-slate-400">
                        Vous recevrez un message USSD instantané sur ce numéro pour taper votre code secret.
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
                    `Payer ${selectedItem?.amount} ${selectedItem?.currency} via Mobile Money`
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
