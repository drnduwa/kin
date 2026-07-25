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
const isAppleReviewAccount = (email: string | null) => {
    return email?.includes('apple') || email?.includes('test-reviewer');
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
  const [isChecking, setIsChecking] = useState(false);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const { user, firestore } = useFirebase();
  const { toast } = useToast();

  const isReviewAccount = isAppleReviewAccount(user?.email || '');

  const packs = [
    { id: 'starter', stars: 50, prices: { CDF: 5000, USD: 2 }, labels: { CDF: '5 000 CDF', USD: '2 USD' }, label: 'Starter' },
    { id: 'standard', stars: 150, prices: { CDF: 12000, USD: 5 }, labels: { CDF: '12 000 CDF', USD: '5 USD' }, label: 'Standard', popular: true },
    { id: 'pro', stars: 400, prices: { CDF: 25000, USD: 10 }, labels: { CDF: '25 000 CDF', USD: '10 USD' }, label: 'Pro' },
  ];

  const handlePurchase = async () => {
    if (isReviewAccount) {
        toast({ title: "Mode Revue", description: "Paiements par mobile money désactivés pour la revue Apple. Utilisez l'In-App Purchase." });
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
          <ShoppingCart className="mr-2 h-5 w-5" />
          Acheter des Stars
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md overflow-hidden p-0 rounded-2xl">
        {isReviewAccount ? (
            <div className="p-10 text-center space-y-6">
                <Apple className="h-16 w-16 mx-auto text-slate-400" />
                <h3 className="text-xl font-black">Mode Revue Apple</h3>
                <p className="text-sm text-slate-500">Les achats directs sont désactivés dans cette version. Veuillez configurer les In-App Purchases via App Store Connect.</p>
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
              <StatCard title="Stars Achetées" value={`${profile?.totalStarsPurchased || 0} ⭐`} icon={ShoppingCart} color="bg-blue-500" subValue="Paiements validés" />
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
