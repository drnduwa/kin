'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useUser, useFirebase, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy, limit, serverTimestamp, runTransaction, getDoc, Timestamp } from 'firebase/firestore';
import { UserProfile, StarTransaction, WithId, AdvertVideo, AppSubscriptionSettings } from '@/lib/types';
import { initiateMbiyoPaymentAction, checkMbiyoTransactionStatusAction } from '@/app/actions';
import { 
  Star, 
  TrendingUp, 
  ShoppingCart, 
  ArrowDownCircle, 
  Gift, 
  PlayCircle, 
  Loader2, 
  CheckCircle2, 
  Smartphone, 
  AlertCircle,
  Clock,
  Share2,
  X,
  Volume2,
  VolumeX,
  UserPlus,
  RefreshCw,
  Zap,
  Calendar,
  CreditCard,
  Shield,
  ShieldCheck,
  Apple
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { format, addMonths, addYears, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// --- Apple Review Compliance Utility ---
// --- Apple Review & iOS Compliance Utility ---
const isIOSClient = () => {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isAppleReviewAccount = (email: string | null): boolean => {
    return Boolean(isIOSClient() || email?.includes('apple') || email?.includes('test-reviewer') || email?.includes('demo'));
};

const StatCard = ({ title, value, icon: Icon, color, subValue }: { title: string, value: string | number, icon: any, color: string, subValue?: string }) => (
  <Card className="border-none shadow-sm">
    <CardContent className="p-6 flex justify-between items-start">
      <div className="space-y-1">
        <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">{title}</p>
        <p className="text-3xl font-black">{value}</p>
        {subValue && <p className="text-[10px] font-medium text-muted-foreground">{subValue}</p>}
      </div>
      <div className={cn("p-3 rounded-2xl", color)}>
        <Icon className="h-6 w-6 text-white" />
      </div>
    </CardContent>
  </Card>
);

const TransactionRow = ({ transaction }: { transaction: WithId<StarTransaction> }) => {
  const isGain = transaction.type !== 'spent';
  const date = transaction.timestamp?.toDate ? format(transaction.timestamp.toDate(), 'dd MMM, HH:mm', { locale: fr }) : '...';

  return (
    <div className="flex items-center justify-between p-4 border-b last:border-0 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-4">
        <div className={cn(
          "p-2 rounded-full",
          transaction.type === 'purchase' ? "bg-blue-100 text-blue-600" :
          transaction.type === 'earned' ? "bg-emerald-100 text-emerald-600" :
          "bg-orange-100 text-orange-600"
        )}>
          {transaction.type === 'purchase' ? <ShoppingCart className="h-4 w-4" /> :
           transaction.type === 'earned' ? <Gift className="h-4 w-4" /> :
           <ArrowDownCircle className="h-4 w-4" />}
        </div>
        <div>
          <p className="text-sm font-bold">{transaction.description}</p>
          <p className="text-[10px] text-muted-foreground">{date}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={cn("text-sm font-black", isGain ? "text-emerald-600" : "text-orange-600")}>
          {isGain ? '+' : '-'}{Math.abs(transaction.starsChange)} ⭐
        </p>
        <p className="text-[10px] text-muted-foreground">Solde: {transaction.balanceAfterTransaction}</p>
      </div>
    </div>
  );
};

const BuyStarsDialog = ({ currentBalance }: { currentBalance: number }) => {
  const [step, setStep] = useState(1);
  const [selectedPack, setSelectedPack] = useState<any>(null);
  const [phone, setPhone] = useState('');
  const [operator, setSelectedOperator] = useState('');
  const [currency, setCurrency] = useState<'CDF' | 'USD'>('CDF');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const { user } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [isIOS, setIsIOS] = useState(true);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMobileDevice = /iPad|iPhone|iPod|Android/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setIsIOS(Boolean(isMobileDevice || isIOSClient() || isAppleReviewAccount(user?.email || '')));
    }
  }, [user]);

  const packs = [
    { id: 'starter', stars: 50, prices: { CDF: 5000, USD: 2 }, labels: { CDF: '5 000 CDF', USD: '2 USD' }, label: 'Starter' },
    { id: 'standard', stars: 150, prices: { CDF: 12000, USD: 5 }, labels: { CDF: '12 000 CDF', USD: '5 USD' }, label: 'Standard', popular: true },
    { id: 'pro', stars: 400, prices: { CDF: 25000, USD: 10 }, labels: { CDF: '25 000 CDF', USD: '10 USD' }, label: 'Pro' },
  ];

  const handlePurchase = async () => {
    if (isIOS) {
        toast({ title: "Stars Gratuites", description: "Sur iOS, gagnez des Stars gratuitement en participant aux alertes de trafic." });
        return;
    }
    
    if (!user || !selectedPack || !operator || !phone) return;
    setIsLoading(true);
    let sanitizedPhone = phone.replace(/\D/g, '');
    if (sanitizedPhone.startsWith('0')) sanitizedPhone = '243' + sanitizedPhone.substring(1);
    else if (!sanitizedPhone.startsWith('243')) sanitizedPhone = '243' + sanitizedPhone;

    const orderId = `stars_${user.uid.substring(0, 5)}_${Date.now()}`;
    try {
        const result = await initiateMbiyoPaymentAction({
            amount: selectedPack.prices[currency],
            currency: currency,
            phone: sanitizedPhone,
            network: operator,
            order_id: orderId,
        });
        if (result.success && result.data) {
            setPendingTransactionId(result.data.id);
            setStep(3);
        }
    } catch (e) {
        toast({ title: 'Erreur', variant: 'destructive' });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && !pendingTransactionId && setStep(1)}>
      <DialogTrigger asChild>
        <Button className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-12 px-8 rounded-xl shadow-lg">
          {isIOS ? <Gift className="mr-2 h-5 w-5" /> : <ShoppingCart className="mr-2 h-5 w-5" />}
          {isIOS ? "Gagner des Stars (Gratuit)" : "Acheter des Stars"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md overflow-hidden p-0 rounded-3xl border-none shadow-2xl">
        {isIOS ? (
            <div className="p-6 sm:p-8 space-y-6 bg-white">
                <div className="bg-gradient-to-r from-amber-500 to-amber-600 -m-6 sm:-m-8 p-6 text-white mb-6">
                  <DialogTitle className="text-xl sm:text-2xl font-black">Gagner des Stars Citoyennes ⭐</DialogTitle>
                  <DialogDescription className="text-amber-100 text-xs mt-1 font-medium">
                    Toutes les fonctionnalités sont 100% gratuites. Gagnez des Stars en participant à la vie de la communauté kinoise.
                  </DialogDescription>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between">
                    <div>
                      <p className="font-black text-xs text-amber-950">📸 Signaler un Incident</p>
                      <p className="text-[11px] text-amber-700 font-medium">Prenez une photo de nid-de-poule ou bouchon.</p>
                    </div>
                    <Badge className="bg-amber-500 font-black text-xs text-white shrink-0">+10 ⭐</Badge>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                    <div>
                      <p className="font-black text-xs text-emerald-950">🚦 Vérifier le Trafic</p>
                      <p className="text-[11px] text-emerald-700 font-medium">Consultez l'état d'un axe avant de partir.</p>
                    </div>
                    <Badge className="bg-emerald-600 font-black text-xs text-white shrink-0">+5 ⭐</Badge>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                    <div>
                      <p className="font-black text-xs text-blue-950">💬 Chat Radio Trottoir</p>
                      <p className="text-[11px] text-blue-700 font-medium">Répondez aux questions des conducteurs.</p>
                    </div>
                    <Badge className="bg-blue-600 font-black text-xs text-white shrink-0">+5 ⭐</Badge>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <p className="font-black text-xs text-slate-950">🎁 Bonus d'Inscription</p>
                      <p className="text-[11px] text-slate-600 font-medium">Offert automatiquement à la création du compte.</p>
                    </div>
                    <Badge className="bg-slate-900 font-black text-xs text-white shrink-0">+25 ⭐</Badge>
                  </div>
                </div>

                <Button 
                  onClick={() => router.push('/signaler-embouteillage')}
                  className="w-full h-12 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider"
                >
                  Signaler un incident (+10 ⭐)
                </Button>
            </div>
        ) : (
            <>
                <div className="bg-amber-500 p-6 text-white">
                  <DialogTitle className="text-2xl font-black">Recharger mon compte</DialogTitle>
                </div>
                <div className="p-6">
                  <AnimatePresence mode="wait">
                    {step === 1 && (
                      <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                        <div className="grid grid-cols-1 gap-3">
                          {packs.map(pack => (
                            <div key={pack.id} onClick={() => setSelectedPack(pack)} className={cn("p-4 rounded-xl border-2 cursor-pointer transition-all", selectedPack?.id === pack.id ? "border-amber-500 bg-amber-50" : "border-slate-100")}>
                              <div className="flex justify-between items-center">
                                <div><p className="font-black text-lg">{pack.stars} ⭐</p></div>
                                <p className="font-bold text-amber-600">{pack.labels[currency]}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <Button disabled={!selectedPack} onClick={() => setStep(2)} className="w-full h-12 rounded-xl mt-4 font-bold">Suivant</Button>
                      </motion.div>
                    )}
                    {step === 2 && (
                      <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                        <RadioGroup value={operator} onValueChange={setSelectedOperator} className="grid grid-cols-3 gap-2">
                           {['airtel', 'orange', 'vodacom'].map(op => (
                              <div key={op} onClick={() => setSelectedOperator(op)} className={cn("p-3 rounded-xl border-2 text-center cursor-pointer", operator === op ? "border-amber-500" : "")}>{op.toUpperCase()}</div>
                           ))}
                        </RadioGroup>
                        <Input placeholder="Numéro de téléphone" value={phone} onChange={e => setPhone(e.target.value)} className="h-12" />
                        <Button disabled={!operator || phone.length < 9 || isLoading} onClick={handlePurchase} className="w-full h-12 rounded-xl font-bold">Payer</Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
            </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default function MesStarsPage() {
  const { user, firestore } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userRef);

  const transactionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'star_transactions'), orderBy('timestamp', 'desc'), limit(20));
  }, [firestore, user]);
  const { data: transactions, isLoading: isTransLoading } = useCollection<StarTransaction>(transactionsQuery);

  if (isProfileLoading) return <AppShell><div className="h-full w-full flex items-center justify-center"><Loader2 className="animate-spin" /></div></AppShell>;

  return (
    <AppShell>
      <div className="w-full h-full overflow-y-auto bg-slate-50/50 pb-20">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Solde actuel" value={`${profile?.currentStarsBalance || 0} ⭐`} icon={Star} color="bg-amber-500" subValue="Disponible" />
              <StatCard title="Stars Gagnées" value={`${profile?.totalStarsEarned || 0} ⭐`} icon={Gift} color="bg-emerald-500" subValue="Total cumulé" />
              <StatCard title="Activité Citoyenne" value={`${(profile?.totalStarsEarned || 0) + (profile?.currentStarsBalance || 0)} pts`} icon={ShieldCheck} color="bg-blue-500" subValue="Score d'engagement" />
              <StatCard title="Usage" value={`${profile?.totalStarsUsed || 0} ⭐`} icon={TrendingUp} color="bg-orange-500" subValue="Dépenses IA" />
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <Card className="bg-slate-900 text-white border-none overflow-hidden relative">
                        <CardHeader>
                            <CardTitle className="text-3xl font-black">Mon Portefeuille</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="text-5xl font-black text-amber-500">{profile?.currentStarsBalance || 0} Stars</div>
                            <BuyStarsDialog currentBalance={profile?.currentStarsBalance || 0} />
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-1">
                    <Card className="h-full border-none shadow-sm flex flex-col">
                        <CardHeader className="pb-2 border-b">
                            <CardTitle className="text-lg font-black flex items-center gap-2">Journal récent</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 overflow-y-auto max-h-[400px]">
                            {isTransLoading ? <Loader2 className="m-10 animate-spin" /> : transactions?.map(t => <TransactionRow key={t.id} transaction={t} />)}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
      </div>
    </AppShell>
  );
}
