'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Smartphone, 
  Wifi, 
  ShieldCheck, 
  Zap, 
  Flame, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  Coins, 
  ChevronRight, 
  AlertCircle,
  HelpCircle,
  Compass,
  TrafficCone,
  Mic,
  Plus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUser, useFirebase, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, orderBy, limit } from 'firebase/firestore';
import { UserProfile, WalletTransaction } from '@/lib/types';
import { requestWalletCashoutAction, rechargeDataFromWalletAction, getWalletTransactionsAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function EWalletComponent() {
  const { user } = useUser();
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc<UserProfile>(userRef);

  const [liveTransactions, setLiveTransactions] = useState<any[]>([]);
  const [isTxLoading, setIsTxLoading] = useState(false);

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    setIsTxLoading(true);
    try {
      const res = await getWalletTransactionsAction(await user.getIdToken());
      if (res && res.success && res.transactions) {
        setLiveTransactions(res.transactions);
      }
    } catch (e) {
      console.warn('[E-Wallet] Erreur silencieuse transactions:', e);
    } finally {
      setIsTxLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Cashout Modal State
  const [cashoutOpen, setCashoutOpen] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState('2000');
  const [cashoutPhone, setCashoutPhone] = useState(profile?.phone || '089');
  const [cashoutOperator, setCashoutOperator] = useState('Vodacom M-Pesa');
  const [isCashoutSubmitting, setIsCashoutSubmitting] = useState(false);

  // Data Recharge Modal State
  const [dataOpen, setDataOpen] = useState(false);
  const [selectedPack, setSelectedPack] = useState({ name: 'Pass Jour 500 Mo', cdf: 1500 });
  const [isDataSubmitting, setIsDataSubmitting] = useState(false);

  // Valeurs réelles du profil (plus de solde fictif de 850 FC affiché par défaut).
  const walletBalanceCDF = profile?.walletBalanceCDF ?? 0;
  const walletBalanceUSD = profile?.walletBalanceUSD ?? (walletBalanceCDF / 2800);
  const trustScore = profile?.trustScore;
  const totalContribs = profile?.totalContributionsCount ?? 0;

  const handleCashoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amount = parseInt(cashoutAmount);
    if (isNaN(amount) || amount < 1000) {
      toast({
        title: "Montant insuffisant",
        description: "Le retrait minimum est de 1 000 FC.",
        variant: "destructive"
      });
      return;
    }
    if (amount > walletBalanceCDF) {
      toast({
        title: "Solde insuffisant",
        description: `Votre solde est de ${walletBalanceCDF.toLocaleString()} FC.`,
        variant: "destructive"
      });
      return;
    }

    setIsCashoutSubmitting(true);
    try {
      const res = await requestWalletCashoutAction({
        idToken: await user.getIdToken(),
        amountCDF: amount,
        phone: cashoutPhone,
        operator: cashoutOperator
      });

      if (res.success) {
        toast({
          title: "Demande de retrait envoyée",
          description: res.message,
          className: "bg-emerald-600 text-white font-bold"
        });
        setCashoutOpen(false);
        loadTransactions();
      } else {
        toast({ title: "Erreur", description: res.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsCashoutSubmitting(false);
    }
  };

  const handleDataRechargeSubmit = async () => {
    if (!user) return;
    if (walletBalanceCDF < selectedPack.cdf) {
      toast({
        title: "Solde insuffisant",
        description: `Il vous faut ${selectedPack.cdf.toLocaleString()} FC pour ce forfait.`,
        variant: "destructive"
      });
      return;
    }

    setIsDataSubmitting(true);
    try {
      const res = await rechargeDataFromWalletAction({
        idToken: await user.getIdToken(),
        phone: profile?.phone || '',
        dataPack: selectedPack.name
      });

      if (res.success) {
        toast({
          title: "Demande de forfait envoyée",
          description: res.message,
          className: "bg-blue-600 text-white font-bold"
        });
        setDataOpen(false);
        loadTransactions();
      } else {
        toast({ title: "Erreur", description: res.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsDataSubmitting(false);
    }
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-slate-50 overflow-y-auto p-3 sm:p-4 md:p-8">
      <div className="max-w-4xl mx-auto w-full space-y-6 pb-24 md:pb-12">
        
        {/* Banner Title */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-tr from-emerald-600 to-teal-400 rounded-2xl text-white shadow-lg shadow-emerald-500/20">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">K-Flow E-Wallet</h1>
                <Badge className="bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider">
                  Contribute-to-Earn
                </Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium">Gagnez de l'argent réel en informant la communauté sur le trafic kinois</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-2xl border border-slate-200 self-stretch sm:self-auto justify-between sm:justify-start">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <div className="text-right sm:text-left">
              <div className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Indice Sentinelle</div>
              <div className="text-xs font-black text-slate-800">{typeof trustScore === 'number' ? `${trustScore}% Certifié` : 'Nouveau'}</div>
            </div>
          </div>
        </div>

        {/* Big Balance Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 sm:p-8 text-white shadow-2xl border border-slate-700/50">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Solde Disponible en Cash</span>
                <Badge variant="outline" className="text-emerald-300 border-emerald-500/30 text-[9px]">Mobile Money Ready</Badge>
              </div>
              <div className="flex items-baseline gap-3">
                <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                  {walletBalanceCDF.toLocaleString()} <span className="text-2xl sm:text-3xl font-bold text-emerald-400">FC</span>
                </h2>
                <span className="text-sm sm:text-base font-semibold text-slate-400">
                  ≈ {walletBalanceUSD.toFixed(2)} USD
                </span>
              </div>
              <p className="text-xs text-slate-300 pt-1 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>{totalContribs} signalements vérifiés réalisés à Kinshasa</span>
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap sm:flex-nowrap gap-2.5 w-full md:w-auto">
              
              {/* Cashout Dialog */}
              <Dialog open={cashoutOpen} onOpenChange={setCashoutOpen}>
                <DialogTrigger asChild>
                  <Button className="flex-1 sm:flex-initial h-12 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider gap-2 shadow-xl shadow-emerald-500/20">
                    <ArrowUpRight className="h-4 w-4 stroke-[3]" />
                    <span>Retirer Mobile Money</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md rounded-3xl">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-black">Retrait Cash Mobile Money</DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                      Votre demande est vérifiée par l'équipe Kinshasa Flow, puis payée sur votre compte Mobile Money.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCashoutSubmit} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Opérateur Mobile</Label>
                      <Select value={cashoutOperator} onValueChange={setCashoutOperator}>
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue placeholder="Choisir l'opérateur" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Vodacom M-Pesa">Vodacom M-Pesa</SelectItem>
                          <SelectItem value="Orange Money">Orange Money</SelectItem>
                          <SelectItem value="Airtel Money">Airtel Money</SelectItem>
                          <SelectItem value="Afrimoney">Afrimoney</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Numéro de Téléphone (243...)</Label>
                      <Input 
                        value={cashoutPhone} 
                        onChange={(e) => setCashoutPhone(e.target.value)} 
                        placeholder="Ex: 0812345678" 
                        className="h-11 rounded-xl"
                        required 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Montant à retirer en Francs Congolais (Min. 1 000 FC)</Label>
                      <div className="relative">
                        <Input 
                          type="number" 
                          min={1000} 
                          max={walletBalanceCDF}
                          value={cashoutAmount} 
                          onChange={(e) => setCashoutAmount(e.target.value)} 
                          className="h-11 rounded-xl pr-12 font-black text-base"
                          required 
                        />
                        <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">FC</span>
                      </div>
                      <p className="text-[10px] text-slate-400">Solde disponible : {walletBalanceCDF.toLocaleString()} FC</p>
                    </div>

                    <DialogFooter className="pt-2">
                      <Button 
                        type="submit" 
                        disabled={isCashoutSubmitting}
                        className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider text-xs shadow-lg shadow-emerald-600/30"
                      >
                        {isCashoutSubmitting ? "Envoi..." : `Demander ${parseInt(cashoutAmount || '0').toLocaleString()} FC`}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              {/* Data Pack Dialog */}
              <Dialog open={dataOpen} onOpenChange={setDataOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex-1 sm:flex-initial h-12 px-5 rounded-2xl border-slate-600 bg-slate-800/80 hover:bg-slate-700 text-white font-bold text-xs gap-2">
                    <Wifi className="h-4 w-4 text-blue-400" />
                    <span>Recharger Mégas</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md rounded-3xl">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-black">Recharger des Mégas Internet</DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                      Payez un forfait data avec votre solde. Il est activé sur votre numéro après traitement par l'équipe.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    {[
                      { name: 'Pass Jour 500 Mo', cdf: 1500, desc: 'Valable 24h sur tous réseaux' },
                      { name: 'Pass Semaine 2 Go', cdf: 4500, desc: 'Idéal pour le guidage GPS continu' },
                      { name: 'Pass Mois 5 Go', cdf: 11000, desc: 'Connexion mensuelle non-stop' },
                    ].map((pack) => (
                      <div 
                        key={pack.name}
                        onClick={() => setSelectedPack(pack)}
                        className={cn(
                          "p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex justify-between items-center",
                          selectedPack.name === pack.name ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"
                        )}
                      >
                        <div>
                          <div className="font-bold text-sm text-slate-900">{pack.name}</div>
                          <div className="text-[10px] text-slate-500">{pack.desc}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-sm text-primary">{pack.cdf.toLocaleString()} FC</div>
                          <Badge variant="outline" className="text-[8px] py-0">1-Clic</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  <DialogFooter>
                    <Button 
                      onClick={handleDataRechargeSubmit}
                      disabled={isDataSubmitting || walletBalanceCDF < selectedPack.cdf}
                      className="w-full h-12 rounded-2xl font-black uppercase tracking-wider text-xs"
                    >
                      {isDataSubmitting ? "Envoi..." : `Demander pour ${selectedPack.cdf.toLocaleString()} FC`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

            </div>
          </div>
        </div>

        {/* Earning Opportunities Grid */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">Barème des Gains Citoyens</h3>
              <p className="text-xs text-slate-500">Chaque contribution réelle est payée une fois, dans la limite de 1 000 FC par jour</p>
            </div>
            <Badge className="bg-amber-500 text-slate-950 font-black text-[9px] uppercase">Max 1 000 FC / jour</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            
            {/* 1. Incident Report */}
            <Card className="rounded-2xl border-slate-200/80 hover:border-emerald-300 transition-all shadow-sm">
              <CardContent className="p-4 space-y-3 flex flex-col justify-between h-full">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-start">
                    <div className="p-2 bg-red-100 text-red-600 rounded-xl">
                      <TrafficCone className="h-4 w-4" />
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-700 font-black text-xs border-none">
                      +200 FC
                    </Badge>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">Signaler un Blocage</h4>
                  <p className="text-[11px] text-slate-500 leading-tight">Déclarer un camion en panne, un bouchon sévère ou un barrage de police.</p>
                </div>
                <Button asChild size="sm" variant="outline" className="w-full rounded-xl text-xs font-bold gap-1 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200">
                  <Link href="/hazard-map"><Plus className="h-3.5 w-3.5" /> Signaler sur la carte</Link>
                </Button>
              </CardContent>
            </Card>

            {/* 2. Voice Memo */}
            <Card className="rounded-2xl border-slate-200/80 hover:border-emerald-300 transition-all shadow-sm">
              <CardContent className="p-4 space-y-3 flex flex-col justify-between h-full">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-start">
                    <div className="p-2 bg-purple-100 text-purple-600 rounded-xl">
                      <Mic className="h-4 w-4" />
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-700 font-black text-xs border-none">
                      +100 FC
                    </Badge>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">Note Vocale Lingala</h4>
                  <p className="text-[11px] text-slate-500 leading-tight">Envoyez 10 secondes d'audio expliquant la cause du ralentissement.</p>
                </div>
                <Button size="sm" variant="outline" disabled className="w-full rounded-xl text-xs font-bold">Bientôt disponible</Button>
              </CardContent>
            </Card>

            {/* 3. Upvote Confirmation */}
            <Card className="rounded-2xl border-slate-200/80 hover:border-emerald-300 transition-all shadow-sm">
              <CardContent className="p-4 space-y-3 flex flex-col justify-between h-full">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-start">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-700 font-black text-xs border-none">
                      +25 FC
                    </Badge>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">Confirmation 1-Tap</h4>
                  <p className="text-[11px] text-slate-500 leading-tight">Confirmer en 1 clic : "Le bouchon est-il toujours là ? Oui / Non".</p>
                </div>
                <Button asChild size="sm" variant="outline" className="w-full rounded-xl text-xs font-bold gap-1 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200">
                  <Link href="/verifier-trafic"><Plus className="h-3.5 w-3.5" /> Voter sur un carrefour</Link>
                </Button>
              </CardContent>
            </Card>

            {/* 4. Telemetry */}
            <Card className="rounded-2xl border-slate-200/80 hover:border-emerald-300 transition-all shadow-sm">
              <CardContent className="p-4 space-y-3 flex flex-col justify-between h-full">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-start">
                    <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                      <Zap className="h-4 w-4" />
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-700 font-black text-xs border-none">
                      Bientôt
                    </Badge>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">Rouler avec l'App</h4>
                  <p className="text-[11px] text-slate-500 leading-tight">Gardez l'application ouverte en route pour transmettre la vitesse moyenne.</p>
                </div>
                <Button size="sm" variant="outline" disabled className="w-full rounded-xl text-xs font-bold">Bientôt disponible</Button>
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Transactions History */}
        <Card className="rounded-3xl border-slate-200/80 shadow-sm overflow-hidden">
          <CardHeader className="p-4 sm:p-6 border-b bg-white">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base font-black text-slate-900">Historique des Gains & Retraits</CardTitle>
                <CardDescription className="text-xs">Flux en temps réel de votre portefeuille citoyen</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-xs font-bold text-primary">
                <Link href="/verifier-trafic">Aller sur la carte</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100 bg-white">
            {liveTransactions && liveTransactions.length > 0 ? (
              liveTransactions.map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2.5 rounded-2xl flex items-center justify-center shrink-0",
                      tx.type === 'earning' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {tx.type === 'earning' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-slate-800">{tx.description}</div>
                      <div className="text-[10px] text-slate-400">
                        {(tx.timestamp?.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp || Date.now())).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} • {tx.status === 'completed' ? 'Validé' : 'En cours'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      "font-black text-xs sm:text-sm",
                      tx.amountCDF > 0 ? "text-emerald-600" : "text-slate-800"
                    )}>
                      {tx.amountCDF > 0 ? `+${tx.amountCDF.toLocaleString()}` : tx.amountCDF.toLocaleString()} FC
                    </div>
                    <div className="text-[9px] text-slate-400">
                      Solde : {tx.balanceAfterCDF ? `${tx.balanceAfterCDF.toLocaleString()} FC` : ''}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                  <Coins className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-sm text-slate-800">Votre portefeuille est prêt !</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Signalez un problème sur la carte ou votez sur un carrefour pour voir vos premiers gains ici.
                  </p>
                </div>
                <Button asChild className="rounded-xl font-black text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
                  <Link href="/hazard-map">Faire mon premier signalement (+200 FC)</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
