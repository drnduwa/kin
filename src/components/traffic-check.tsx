'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  TrafficCone, 
  Search, 
  LocateFixed, 
  Navigation, 
  Loader2, 
  CheckCircle2, 
  Zap, 
  Info, 
  X, 
  RefreshCw, 
  AlertCircle,
  Radar,
  Flame,
  Sparkles,
  Share2,
  MapPin,
  MessageCircle,
  Volume2,
  VolumeX,
  ThumbsUp,
  ThumbsDown,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Wallet,
  ArrowRight,
  TrendingUp,
  Radio,
  Car,
  Compass,
  Layers,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { checkTrafficAction, getTrafficForecastAction, awardWalletContributionAction, getRealtimeCommandDashboardAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { CONFIG } from '@/lib/config';
import { useUser, useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';

const STATUS_CONFIG = {
  BLOQUÉ: { color: "bg-purple-600 text-white", border: "border-purple-300", icon: "🔴", label: "Bloqué", badgeBg: "bg-purple-600" },
  EMBOUTEILLAGE: { color: "bg-red-600 text-white", border: "border-red-300", icon: "🔴", label: "Embouteillé", badgeBg: "bg-red-600" },
  EMBOUTEILLÉ: { color: "bg-red-600 text-white", border: "border-red-300", icon: "🔴", label: "Embouteillé", badgeBg: "bg-red-600" },
  MODÉRÉ: { color: "bg-amber-500 text-slate-950", border: "border-amber-300", icon: "🟡", label: "Modéré", badgeBg: "bg-amber-500" },
  FLUIDE: { color: "bg-emerald-500 text-white", border: "border-emerald-300", icon: "🟢", label: "Fluide", badgeBg: "bg-emerald-500" },
  INCONNU: { color: "bg-slate-400 text-white", border: "border-slate-300", icon: "⏳", label: "Mesure...", badgeBg: "bg-slate-400" },
  ERREUR: { color: "bg-red-900 text-white", border: "border-red-800", icon: "⚠️", label: "Erreur", badgeBg: "bg-red-900" },
};

// Squelettes initiaux sans valeurs fictives — remplacés immédiatement par la télémétrie serveur
const INITIAL_BOTTLENECKS = [
  { id: "limete-echangeur", name: "Échangeur de Limete", district: "Limete / Nœud Est", coords: { lat: -4.3570, lng: 15.3580 }, lingala: "Leka na Poids Lourds soki Echangeur ekangami." },
  { id: "kintambo-magasin", name: "Kintambo Magasin", district: "Ngaliema / Nœud Ouest", coords: { lat: -4.3270, lng: 15.2740 }, lingala: "Tala nzela ya Berges soki Magasin eza pasi." },
  { id: "matadi-upn", name: "Route de Matadi (UPN)", district: "Ngaliema / Sortie Ouest", coords: { lat: -4.3800, lng: 15.2580 }, lingala: "Keba na Route de Matadi, tala nzela ya Montagne." },
  { id: "lumumba-pascal", name: "Boulevard Lumumba (Pascal)", district: "Masina / Tchangu", coords: { lat: -4.3850, lng: 15.4200 }, lingala: "Boulevard Lumumba na Pascal ezali na ba mesures ya sika." },
  { id: "bypass-triangle", name: "Avenue By-Pass (Triangle)", district: "Lemba / Mont-Ngafula", coords: { lat: -4.4100, lng: 15.3150 }, lingala: "Tala trafic ya Triangle liboso ya kobima." },
  { id: "mandela-30juin", name: "Rond-point Mandela (Blvd 30 Juin)", district: "Gombe / Cœur de ville", coords: { lat: -4.3120, lng: 15.2980 }, lingala: "Banzela ya Gombe (Justice) ekoki kosalisa soki 30 Juin ekangami." },
  { id: "kalamu-victoire", name: "Avenue Kasa-Vubu (Victoire)", district: "Kalamu / Centre", coords: { lat: -4.3430, lng: 15.3120 }, lingala: "Tala soki Enseignement ezali polele liboso ya kokende Victoire." },
  { id: "universite-pontgabu", name: "Av. de l'Université (Pont Gabu)", district: "Kalamu / Limete", coords: { lat: -4.3550, lng: 15.3180 }, lingala: "Pont Gabu ezali na ba mesures ya sika." }
].map(b => ({
  ...b,
  speedKmh: 0,
  delayMin: 0,
  status: "INCONNU",
  source: "loading",
  isEstimated: true,
  cause: "Synchronisation des mesures en cours...",
  certifiedAlt: "Vérification de la déviation en cours...",
  activeIncidents: [] as any[],
}));

const INITIAL_COMMUTES = [
  { id: "upn-gombe", title: "UPN ➔ Gombe (Centre-Ville)", via: "Route de Matadi & 30 Juin", coords: { lat: -4.3800, lng: 15.2580 } },
  { id: "masina-gombe", title: "Masina / Tchangu ➔ Gombe", via: "Boulevard Lumumba & Limete", coords: { lat: -4.3850, lng: 15.4200 } },
  { id: "lemba-gombe", title: "Lemba / Triangle ➔ Gombe", via: "By-Pass & Av. Université", coords: { lat: -4.4100, lng: 15.3150 } },
  { id: "kintambo-gombe", title: "Kintambo Magasin ➔ Gombe", via: "Avenue Mondjiba", coords: { lat: -4.3270, lng: 15.2740 } }
].map(c => ({
  ...c,
  status: "INCONNU",
  delayText: "Mesure...",
  badgeColor: "bg-slate-400",
  source: "loading",
  isEstimated: true,
  escape: "Vérification de l'itinéraire bis...",
}));

export default function TrafficCommandDashboard() {
  const { user } = useUser();
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc<UserProfile>(userRef);

  const [search, setSearch] = useState('');
  const [activeAnalysis, setActiveAnalysis] = useState<any>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [confirmedNodes, setConfirmedNodes] = useState<Record<string, boolean>>({});

  // Données temps réel transparentes (distinction claire entre Google Live et Estimation)
  const [bottlenecks, setBottlenecks] = useState<any[]>(INITIAL_BOTTLENECKS);
  const [commutes, setCommutes] = useState<any[]>(INITIAL_COMMUTES);
  const [globalMetrics, setGlobalMetrics] = useState<{
    kinshasaHour: number;
    isPeakHour: boolean;
    avgSpeed: number;
    congestionIndex: number;
    activeIncidentsCount: number;
    liveGoogleCount?: number;
    totalNodes?: number;
    weather?: { isRaining: boolean; rainMm: number; weatherLabel: string } | null;
    telemetrySource?: string;
    updatedAt: string;
    audioFlashText: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

  const walletBalanceCDF = profile?.walletBalanceCDF ?? 850;

  // Récupération dynamique en direct (Google Routes Live + OSRM + Firestore)
  const fetchRealtimeTraffic = useCallback(async (showToast = false) => {
    setIsRefreshing(true);
    try {
      const res = await getRealtimeCommandDashboardAction(showToast);
      if (res && res.success) {
        if (res.bottlenecks && res.bottlenecks.length > 0) {
          setBottlenecks(res.bottlenecks);
        }
        if (res.commutes && res.commutes.length > 0) {
          setCommutes(res.commutes);
        }
        if (res.globalMetrics) {
          setGlobalMetrics(res.globalMetrics);
          setLastRefreshedAt(res.globalMetrics.updatedAt);
        }
        if (showToast) {
          toast({
            title: "Télémétrie en Direct Actualisée",
            description: `Données rafraîchies à ${res.globalMetrics.updatedAt} (${res.globalMetrics.telemetrySource || 'Live'} • ${res.globalMetrics.activeIncidentsCount} signalements).`,
          });
        }
      }
    } catch (err: any) {
      console.error("[Realtime Traffic] Erreur de récupération:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRealtimeTraffic();
    // Rafraîchissement automatique en arrière-plan toutes les 45 secondes
    const interval = setInterval(() => {
      fetchRealtimeTraffic(false);
    }, 45000);
    return () => clearInterval(interval);
  }, [fetchRealtimeTraffic]);

  // Lance l'analyse détaillée d'un axe
  const handleInspectAxis = async (coords: { lat: number, lng: number }, name: string) => {
    setIsLoadingAnalysis(true);
    setActiveAnalysis(null);
    try {
      const data = await checkTrafficAction({ ...coords, address: name });
      const fData = await getTrafficForecastAction(name);
      setActiveAnalysis({ ...data, name, forecast: fData });
    } catch (e: any) {
      toast({ title: "Erreur", description: "Impossible d'analyser cet axe.", variant: "destructive" });
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  // Confirmation rémunérée (+25 FC)
  const handleRewardConfirm = async (nodeId: string, nodeName: string) => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour recevoir vos +25 FC sur votre E-Wallet.",
        variant: "destructive"
      });
      return;
    }
    try {
      const res = await awardWalletContributionAction({
        userId: user.uid,
        type: 'upvote',
        road: nodeName,
        note: 'Validation 1-Tap depuis le Tableau de Bord'
      });
      if (res.success) {
        setConfirmedNodes(prev => ({ ...prev, [nodeId]: true }));
        toast({
          title: "Gain Immédiat ! 🎉 (+25 FC)",
          description: `Merci ! Vos +25 FC ont été versés sur votre portefeuille. Solde actuel : ${res.newBalanceCDF} FC.`,
          className: "bg-emerald-600 text-white font-bold"
        });
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  // Bulletin vocal IA (Flash Info Kinshasa en direct)
  const handlePlayGlobalVoiceFlash = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (isPlayingAudio) {
        window.speechSynthesis.cancel();
        setIsPlayingAudio(false);
        return;
      }
      const flashText = globalMetrics?.audioFlashText || 
        `Flash info Kinshasa Flow en direct. L'Échangeur de Limete et Kintambo Magasin sont sous surveillance. Conseil K-Flow : pour rejoindre le centre-ville, privilégiez les axes secondaires certifiés. Tosa trafic, keba na nzela !`;
      const utterance = new SpeechSynthesisUtterance(flashText);
      utterance.lang = 'fr-FR';
      utterance.rate = 1.05;
      utterance.onstart = () => setIsPlayingAudio(true);
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      window.speechSynthesis.speak(utterance);
    } else {
      toast({
        title: "Flash Audio 20s",
        description: globalMetrics?.audioFlashText || "Trafic sous surveillance sur les grands axes. Empruntez les voies bis certifiées !",
      });
    }
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-y-auto p-3 sm:p-4 md:p-6">
      <div className="max-w-6xl mx-auto w-full space-y-5 pb-24 md:pb-12">

        {/* ── 1. HEADER DU CENTRE DE CONTRÔLE (1-Screen Traffic Command) ── */}
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 p-5 sm:p-7 text-white shadow-xl border border-slate-700/60 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-[10px] font-black uppercase tracking-wider">
                  Live Kinshasa
                </Badge>
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">• 27 Millions d'habitants</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Centre de Contrôle Trafic K-Flow
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl font-medium">
                Détection en temps réel des goulots, causes précises des pannes et itinéraires d'échappatoire certifiés carrossables.
              </p>
            </div>

            {/* Quick Actions Header */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full lg:w-auto">
              
              {/* Flash Vocal 20s */}
              <Button
                onClick={handlePlayGlobalVoiceFlash}
                className={cn(
                  "flex-1 sm:flex-initial h-12 px-5 rounded-2xl font-black text-xs uppercase tracking-wider gap-2 shadow-lg transition-all",
                  isPlayingAudio 
                    ? "bg-amber-500 hover:bg-amber-400 text-slate-950 ring-4 ring-amber-500/30" 
                    : "bg-white/10 hover:bg-white/20 text-white border border-white/20"
                )}
              >
                {isPlayingAudio ? <VolumeX className="h-4 w-4 animate-bounce" /> : <Volume2 className="h-4 w-4 text-amber-400" />}
                <span>{isPlayingAudio ? "Arrêter Flash" : "Flash Audio 20s (Lingala)"}</span>
              </Button>

              {/* Solde E-Wallet Badge */}
              <Link href="/e-wallet" className="flex-1 sm:flex-initial">
                <div className="h-12 px-4 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 flex items-center justify-between gap-3 text-white transition-all cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-400" />
                    <div>
                      <div className="text-[9px] uppercase font-bold text-emerald-300">Mon E-Wallet</div>
                      <div className="text-xs font-black text-emerald-400">{walletBalanceCDF.toLocaleString()} FC</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-emerald-400" />
                </div>
              </Link>

            </div>
          </div>

          {/* Live Telemetry Ticker Bar */}
          <div className="w-full pt-4 mt-4 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/80">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-bold text-slate-300">Kinshasa :</span>
                <span className="font-extrabold text-emerald-400">
                  {globalMetrics
                    ? `${globalMetrics.isPeakHour ? "Heure de Pointe" : "Heure Normale"} (${globalMetrics.kinshasaHour}h)`
                    : "Chargement..."}
                </span>
              </div>

              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/80">
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-bold text-slate-300">Congestion :</span>
                <span className="font-extrabold text-amber-400">
                  {globalMetrics ? `${globalMetrics.congestionIndex}%` : "--"}
                </span>
              </div>

              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/80">
                <Car className="h-3.5 w-3.5 text-blue-400" />
                <span className="font-bold text-slate-300">Vitesse moy. :</span>
                <span className="font-extrabold text-blue-400">
                  {globalMetrics ? `${globalMetrics.avgSpeed} km/h` : "--"}
                </span>
              </div>

              {globalMetrics?.weather?.weatherLabel && (
                <div className="flex items-center gap-2 bg-sky-950/60 px-3 py-1.5 rounded-xl border border-sky-800/80">
                  <span className="font-bold text-sky-300">{globalMetrics.weather.weatherLabel}</span>
                </div>
              )}

              {globalMetrics && globalMetrics.activeIncidentsCount > 0 && (
                <div className="flex items-center gap-2 bg-red-950/60 px-3 py-1.5 rounded-xl border border-red-800/80">
                  <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                  <span className="font-bold text-red-300">{globalMetrics.activeIncidentsCount} incident(s)</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">
                {lastRefreshedAt
                  ? `${globalMetrics?.telemetrySource || "Source inconnue"} • ${lastRefreshedAt}`
                  : "Synchronisation en direct..."}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fetchRealtimeTraffic(true)}
                disabled={isRefreshing}
                className="h-8 px-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold gap-1.5"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 text-blue-400", isRefreshing && "animate-spin")} />
                <span>Actualiser</span>
              </Button>
            </div>
          </div>
        </div>

        {/* ── 2. RECHERCHE RAPIDE & GPS DIRECT ── */}
        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une avenue (ex: Huileries, Poids Lourds, By-Pass...)"
              className="pl-10 h-11 rounded-xl border-slate-200 dark:border-slate-800 font-bold text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search) {
                  handleInspectAxis({ lat: -4.3250, lng: 15.3100 }, search);
                }
              }}
            />
          </div>
          <Button
            onClick={() => {
              if (search) handleInspectAxis({ lat: -4.3250, lng: 15.3100 }, search);
            }}
            disabled={isLoadingAnalysis}
            className="h-11 px-5 rounded-xl font-bold text-xs gap-1.5 shrink-0"
          >
            {isLoadingAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            Vérifier cet Axe
          </Button>
          <Button asChild variant="outline" className="h-11 px-4 rounded-xl font-bold text-xs gap-1.5 shrink-0 border-primary/30 text-primary hover:bg-primary/5">
            <Link href="/k-flow-nav">
              <Navigation className="h-4 w-4" />
              <span>GPS Nav</span>
            </Link>
          </Button>
        </div>

        {/* ── 3. WIDGET 1-TAP : MON TRAJET QUOTIDIEN (Domicile ↔ Bureau) ── */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <Car className="h-4 w-4 text-primary" />
                Mon Trajet Quotidien (1-Tap Nav)
              </h2>
              <p className="text-xs text-slate-500">Un clic pour connaître le statut exact, le retard et la voie d'évitement</p>
            </div>
            <Badge className="bg-primary/10 text-primary font-black text-[9px] uppercase border-none">
              Gain de Temps
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {commutes.map((commute) => (
              <Card
                key={commute.id}
                onClick={() => handleInspectAxis(commute.coords, commute.title.split('➔')[0].trim())}
                className="rounded-2xl border-slate-200/80 dark:border-slate-800 hover:border-primary/50 transition-all cursor-pointer shadow-sm group hover:shadow-md bg-white dark:bg-slate-900"
              >
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-black text-xs text-slate-900 dark:text-white group-hover:text-primary transition-colors leading-tight">
                      {commute.title}
                    </span>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge className={cn("text-white font-black text-[9px]", commute.badgeColor)}>
                        {commute.delayText || commute.delay}
                      </Badge>
                      {commute.source && commute.source !== "loading" && (
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded",
                          commute.source === "google"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        )}>
                          {commute.source === "google" ? "Google Live" : "Estimation"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium truncate flex items-center justify-between">
                    <span>Via {commute.via}</span>
                    {commute.distKm > 0 && <span className="font-bold text-slate-500">{commute.distKm} km • ~{commute.durMin} min</span>}
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-start gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 leading-tight">
                      {commute.escape}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ── 4. ANALYSE DÉTAILLÉE D'UN AXE SÉLECTIONNÉ (Result Panel) ── */}
        <AnimatePresence>
          {activeAnalysis && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border-2 border-primary/30 shadow-xl space-y-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-primary text-white shadow-md">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-primary/20 text-primary font-black text-[9px] uppercase border-none">
                        Diagnostic Express
                      </Badge>
                      <Badge className={cn(
                        "font-black text-[9px] uppercase border-none",
                        activeAnalysis.source === "google"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      )}>
                        {activeAnalysis.source === "google" ? "Google Live" : "Estimation horaire"}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                      {activeAnalysis.name}
                    </h3>
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setActiveAnalysis(null)} className="rounded-full">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Statut & Retard */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Statut de Fluidité</div>
                  <div className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{STATUS_CONFIG[activeAnalysis.status as keyof typeof STATUS_CONFIG]?.icon}</span>
                    <span>{activeAnalysis.status}</span>
                    {activeAnalysis.delay > 0 && <span className="text-red-600 text-xs">(+{activeAnalysis.delay} min)</span>}
                  </div>
                </div>

                {/* 2. Pourquoi l'embouteillage ? (uniquement signaux observés) */}
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" /> Cause observée
                  </div>
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 leading-tight">
                    {activeAnalysis.cause || activeAnalysis.message}
                  </p>
                </div>

                {/* 3. Itinéraires Alternatifs Vérifiés */}
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Détours Vérifiés
                  </div>
                  <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 leading-tight">
                    {activeAnalysis.forecast?.alternatives?.length
                      ? activeAnalysis.forecast.alternatives
                          .map((alt: any) => `${alt.name} (+${alt.estimatedDelay} min, ${alt.source === "google" ? "Live" : "Est."})`)
                          .join(" • ")
                      : activeAnalysis.alternativeRoutes?.length
                        ? activeAnalysis.alternativeRoutes.map((r: any) => `${r.summary} (+${r.delayMinutes} min)`).join(" • ")
                        : "Aucune déviation vérifiée plus rapide pour le moment."}
                  </p>
                </div>
              </div>

              {/* Bouton GPS Direct */}
              <div className="flex gap-2 justify-end pt-1">
                <Button asChild className="rounded-xl font-bold text-xs gap-1.5 bg-primary text-white">
                  <Link href="/k-flow-nav">
                    <Navigation className="h-4 w-4" />
                    <span>Lancer Navigation GPS</span>
                  </Link>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 5. LE RADAR LIVE DES 8 GOULOTS D'ÉTRANGLEMENT MAJEURS DE KINSHASA ── */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <Radio className="h-4 w-4 text-red-500 animate-pulse" />
                Radar Live des 8 Nœuds Stratégiques de Kinshasa
              </h2>
              <p className="text-xs text-slate-500">Mise à jour télémétrique continue des points névralgiques</p>
            </div>
            <div className="text-[10px] font-bold text-slate-400">
              Affichage haute visibilité
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {bottlenecks.map((node) => {
              const statusKey = (node.status || "INCONNU") as keyof typeof STATUS_CONFIG;
              const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.INCONNU;
              const isConfirmed = confirmedNodes[node.id];
              const speed = node.speedKmh ?? 0;
              const delay = node.delayMin ?? 0;
              const isGoogle = node.source === "google";

              return (
                <div
                  key={node.id}
                  className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3 hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    
                    {/* Top Row: Name + Badge */}
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base">{cfg.icon}</span>
                          <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                            {node.name}
                          </h3>
                        </div>
                        <div className="pl-6 flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-semibold text-slate-400">
                            {node.district}
                          </span>
                          {node.source && node.source !== "loading" && (
                            <span className={cn(
                              "text-[9px] font-black px-1.5 py-0.5 rounded uppercase",
                              isGoogle
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            )}>
                              {isGoogle ? "Google Live" : "Estimation"}
                            </span>
                          )}
                        </div>
                        {node.activeIncidents && node.activeIncidents.length > 0 && (
                          <div className="pl-6 mt-1 flex items-center gap-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
                              🚨 {node.activeIncidents.length} signalement(s) en direct
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="text-right shrink-0">
                        <Badge className={cn("text-white font-black text-[10px] uppercase", cfg.badgeBg)}>
                          {cfg.label}
                        </Badge>
                        <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                          {node.source === "loading" ? "Analyse..." : `+${delay} min • ${speed} km/h`}
                        </div>
                      </div>
                    </div>

                    {/* Cause Box */}
                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-300/40 text-slate-800 dark:text-slate-200 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-800 dark:text-amber-300">
                        <ShieldAlert className="h-3 w-3 text-amber-600" />
                        <span>Pourquoi ça bloque ?</span>
                      </div>
                      <p className="text-xs font-medium leading-relaxed pl-4 text-slate-700 dark:text-slate-300">
                        {node.cause}
                      </p>
                    </div>

                    {/* Checked Escape Route */}
                    <div className={cn(
                      "p-3 rounded-2xl border space-y-1",
                      node.altIsBetter === false
                        ? "bg-amber-500/10 border-amber-300/40 text-slate-800 dark:text-slate-200"
                        : "bg-emerald-500/10 border-emerald-300/40 text-slate-800 dark:text-slate-200"
                    )}>
                      <div className={cn(
                        "flex items-center justify-between gap-1.5 text-[10px] font-black uppercase",
                        node.altIsBetter === false
                          ? "text-amber-800 dark:text-amber-300"
                          : "text-emerald-800 dark:text-emerald-300"
                      )}>
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className={cn("h-3 w-3", node.altIsBetter === false ? "text-amber-600" : "text-emerald-600")} />
                          <span>
                            {node.altIsBetter === false
                              ? "Détour aussi chargé"
                              : "Échappatoire Vérifiée (Anti-Trou)"}
                          </span>
                        </div>
                        {typeof node.altDelayMin === "number" && node.source !== "loading" && (
                          <span className="text-[9px] font-bold">
                            +{node.altDelayMin} min • {node.altSpeedKmh} km/h ({node.altSource === "google" ? "Live" : "Est."})
                          </span>
                        )}
                      </div>
                      <p className={cn(
                        "text-xs font-bold leading-relaxed pl-4",
                        node.altIsBetter === false
                          ? "text-amber-800 dark:text-amber-300"
                          : "text-emerald-800 dark:text-emerald-300"
                      )}>
                        {node.certifiedAlt}
                      </p>
                    </div>

                    {/* Lingala Alert */}
                    <div className="text-[11px] font-bold italic text-primary dark:text-blue-400 pl-1">
                      🇨🇩 "{node.lingala}"
                    </div>

                  </div>

                  {/* Bottom Row Actions */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    
                    {/* Action 1: Confirmer & Gagner (+25 FC) */}
                    {isConfirmed ? (
                      <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>+25 FC Crédités</span>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRewardConfirm(node.id, node.name)}
                        className="rounded-xl text-[11px] font-black text-emerald-700 dark:text-emerald-400 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 gap-1.5 h-8"
                      >
                        <ThumbsUp className="h-3 w-3" />
                        <span>Confirmer (+25 FC)</span>
                      </Button>
                    )}

                    {/* Action 2: Itinéraire Bis */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleInspectAxis(node.coords, node.name)}
                      className="rounded-xl text-xs font-bold gap-1 text-primary hover:bg-primary/10 h-8"
                    >
                      <span>Diagnostiquer</span>
                      <ArrowRight className="h-3 w-3" />
                    </Button>

                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 6. BANNIÈRE E-WALLET & RECHARGE MÉGAS ── */}
        <div className="rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-700 p-5 sm:p-6 text-white shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-white/20 text-white font-black text-[9px] uppercase border-none">
                Gagnez du Cash
              </Badge>
              <span className="text-xs text-emerald-100 font-bold">Portefeuille Citoyen K-Flow</span>
            </div>
            <h3 className="text-xl font-black">Chaque bouchon signalé = de l'argent dans votre poche</h3>
            <p className="text-xs text-emerald-100 max-w-xl">
              Retirez vos Francs Congolais instantanément par M-Pesa, Orange Money ou Airtel Money, ou rechargez des mégas internet gratuits !
            </p>
          </div>

          <Button asChild size="lg" className="rounded-2xl bg-white hover:bg-slate-100 text-emerald-950 font-black text-xs uppercase tracking-wider px-6 h-12 shadow-lg shrink-0">
            <Link href="/e-wallet">
              <span>Ouvrir mon Portefeuille ({walletBalanceCDF.toLocaleString()} FC)</span>
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Link>
          </Button>
        </div>

      </div>
    </div>
  );
}
