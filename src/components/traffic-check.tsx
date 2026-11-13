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
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { checkTrafficAction, awardWalletContributionAction, getRealtimeCommandDashboardAction, locateAxisAction, getCityForecastAction } from '@/app/actions';
import { levelFromStatus, levelFromDelay, type MapNode } from '@/components/game/live-city-map';
import PlayerHud from '@/components/game/player-hud';
import { CloudRain, CalendarDays } from 'lucide-react';
import { voteSlot } from '@/lib/kinshasa-time';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { CONFIG } from '@/lib/config';
import { useUser, useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';
import { KFlowSays } from '@/components/kin/street';
import KinshasaCityMap, { type CityMapNode, type CorridorLive } from '@/components/kin/city-map';
import { RouteScout, RouteStory } from '@/components/kin/route-story';
import { FullPanel } from '@/components/kin/full-panel';
import { MOOD_LINES, moodFromClock, type Mood } from '@/lib/kin-slang';

const STATUS_CONFIG = {
  BLOQUÉ: { color: "bg-purple-600 text-white", border: "border-purple-300", icon: "🔴", label: "Bloqué", badgeBg: "bg-purple-600" },
  EMBOUTEILLAGE: { color: "bg-red-600 text-white", border: "border-red-300", icon: "🔴", label: "Embouteillé", badgeBg: "bg-red-600" },
  MODÉRÉ: { color: "bg-amber-500 text-slate-950", border: "border-amber-300", icon: "🟡", label: "Modéré", badgeBg: "bg-amber-500" },
  FLUIDE: { color: "bg-emerald-500 text-white", border: "border-emerald-300", icon: "🟢", label: "Fluide", badgeBg: "bg-emerald-500" },
  INCONNU: { color: "bg-slate-400 text-white", border: "border-slate-300", icon: "⚪", label: "Pas de données", badgeBg: "bg-slate-400" },
  ERREUR: { color: "bg-red-900 text-white", border: "border-red-800", icon: "⚠️", label: "Erreur", badgeBg: "bg-red-900" },
};

/** Dit d'où vient un chiffre : mesure en direct, estimation horaire ou aucune donnée. */
function SourceChip({ source, confidence }: { source?: string; confidence?: number }) {
  const live = source === 'google' || source === 'gps';
  const estimate = source === 'estimate' || source === 'osrm';
  const label = source === 'gps' ? 'Mesuré en direct · GPS usagers' : live ? 'Mesuré en direct' : estimate ? "Estimation selon l'heure" : 'Pas de données';
  return (
    <span
      title={live ? 'Temps de trajet mesuré par Google Routes avec le trafic actuel' : estimate ? "Pas de mesure en direct : temps sur route vide multiplié par un facteur d'heure de pointe" : 'Aucune source disponible'}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border",
        live ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
          : estimate ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
          : "bg-slate-500/10 text-slate-500 border-slate-400/30"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-500" : estimate ? "bg-amber-500" : "bg-slate-400")} />
      {label}
      {typeof confidence === 'number' && confidence > 0 && <span className="opacity-70">· confiance {confidence}%</span>}
    </span>
  );
}

// 8 Goulots d'étranglement stratégiques de Kinshasa (Plan 1)
const STRATEGIC_BOTTLENECKS = [
  {
    id: "limete-echangeur",
    name: "Échangeur de Limete",
    district: "Limete / Nœud Est",
    coords: { lat: -4.3570, lng: 15.3580 },
    initialStatus: "BLOQUÉ",
    delay: 35,
    speed: 8,
    cause: "Panne de minibus 207 sur voie de droite et rétrécissement vers le pont.",
    certifiedAlt: "Av. des Poids Lourds via Kingabwa (dégagée).",
    lingala: "Echangeur eza bloqué makasi, loba na chauffeur aleka na Kingabwa."
  },
  {
    id: "kintambo-magasin",
    name: "Kintambo Magasin",
    district: "Ngaliema / Nœud Ouest",
    coords: { lat: -4.3270, lng: 15.2740 },
    initialStatus: "EMBOUTEILLAGE",
    delay: 25,
    speed: 12,
    cause: "Régulation manuelle intense des roulages et refoulement vers Mondjiba.",
    certifiedAlt: "Av. du Tourisme le long des berges du fleuve.",
    lingala: "Magasin eza pasi na ba roulages, leka na Tourisme."
  },
  {
    id: "matadi-upn",
    name: "Route de Matadi (UPN)",
    district: "Ngaliema / Sortie Ouest",
    coords: { lat: -4.3800, lng: 15.2580 },
    initialStatus: "EMBOUTEILLAGE",
    delay: 30,
    speed: 10,
    cause: "Chaussée dégradée, nids-de-poule et stationnement sauvage de wewas.",
    certifiedAlt: "Avenue de la Montagne vers Météo.",
    lingala: "UPN nzela ebeba, mituka ezali kotambola malembe."
  },
  {
    id: "lumumba-pascal",
    name: "Boulevard Lumumba (Pascal)",
    district: "Masina / Tchangu",
    coords: { lat: -4.3850, lng: 15.4200 },
    initialStatus: "BLOQUÉ",
    delay: 45,
    speed: 6,
    cause: "Déversement du marché de rue et bus 207 en double file.",
    certifiedAlt: "Route Mokali vers Kimbanseke ou rail Transco.",
    lingala: "Pascal eza tcha, wewa to marche à pied nde nzela."
  },
  {
    id: "bypass-triangle",
    name: "Avenue By-Pass (Triangle)",
    district: "Lemba / Mont-Ngafula",
    coords: { lat: -4.4100, lng: 15.3150 },
    initialStatus: "MODÉRÉ",
    delay: 15,
    speed: 22,
    cause: "Ralentissement au rond-point, chargements anarchiques.",
    certifiedAlt: "Avenue Elengesa (nouvellement asphaltée et fluide).",
    lingala: "Triangle eza mwa bien, kotambola eza te pasi mingi."
  },
  {
    id: "mandela-30juin",
    name: "Rond-point Mandela (Blvd 30 Juin)",
    district: "Gombe / Cœur de ville",
    coords: { lat: -4.3120, lng: 15.2980 },
    initialStatus: "MODÉRÉ",
    delay: 12,
    speed: 25,
    cause: "Sorties des ministères et flux vers Batetela.",
    certifiedAlt: "Avenue de la Justice ou Avenue de la Science.",
    lingala: "30 Juin eza modéré, banzela ya pembeni eza liboso."
  },
  {
    id: "kalamu-victoire",
    name: "Avenue Kasa-Vubu (Victoire)",
    district: "Kalamu / Centre",
    coords: { lat: -4.3430, lng: 15.3120 },
    initialStatus: "EMBOUTEILLAGE",
    delay: 20,
    speed: 14,
    cause: "Forte affluence piétonne et commerces de rue.",
    certifiedAlt: "Avenue de l'Enseignement vers Stade des Martyrs.",
    lingala: "Victoire bato baza mingi na nzela, keba na ralentissement."
  },
  {
    id: "universite-pontgabu",
    name: "Av. de l'Université (Pont Gabu)",
    district: "Kalamu / Limete",
    coords: { lat: -4.3550, lng: 15.3180 },
    initialStatus: "FLUIDE",
    delay: 3,
    speed: 40,
    cause: "Circulation fluide, aucun incident signalé sur le pont.",
    certifiedAlt: "Axe direct praticable.",
    lingala: "Pont Gabu eza kitoko, kende na yo esika olingi."
  }
];

// Trajets quotidiens prédéfinis 1-Tap (Plan 1)
const QUICK_COMMUTES = [
  {
    id: "upn-gombe",
    title: "UPN ➔ Gombe (Centre-Ville)",
    via: "Route de Matadi & 30 Juin",
    coords: { lat: -4.3800, lng: 15.2580 },
    status: "EMBOUTEILLAGE",
    delay: "+35 min",
    badgeColor: "bg-red-500",
    escape: "Prendre Av. du Tourisme via les Berges du Fleuve"
  },
  {
    id: "masina-gombe",
    title: "Masina / Tchangu ➔ Gombe",
    via: "Boulevard Lumumba & Limete",
    coords: { lat: -4.3850, lng: 15.4200 },
    status: "BLOQUÉ",
    delay: "+50 min",
    badgeColor: "bg-purple-600",
    escape: "Bifurquer vers Poids Lourds à Kingabwa"
  },
  {
    id: "lemba-gombe",
    title: "Lemba / Triangle ➔ Gombe",
    via: "By-Pass & Av. Université",
    coords: { lat: -4.4100, lng: 15.3150 },
    status: "MODÉRÉ",
    delay: "+15 min",
    badgeColor: "bg-amber-500",
    escape: "Emprunter la nouvelle Avenue Elengesa"
  },
  {
    id: "kintambo-gombe",
    title: "Kintambo Magasin ➔ Gombe",
    via: "Avenue Mondjiba",
    coords: { lat: -4.3270, lng: 15.2740 },
    status: "EMBOUTEILLAGE",
    delay: "+25 min",
    badgeColor: "bg-red-500",
    escape: "Prendre l'Avenue de l'OUA ou Av. du Port"
  }
];

export default function TrafficCommandDashboard() {
  const { user } = useUser();
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc<UserProfile>(userRef);

  const [search, setSearch] = useState('');
  const [selectedHotspot, setSelectedHotspot] = useState<any>(STRATEGIC_BOTTLENECKS[0]);
  const [activeAnalysis, setActiveAnalysis] = useState<any>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [scoutName, setScoutName] = useState<string>('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [votedNodes, setVotedNodes] = useState<Record<string, 'still' | 'clear'>>({});

  // Données temps réel réactives (OSRM + Firestore, pas de mock data)
  // Avant la première réponse serveur : noms et lieux seulement, aucun chiffre inventé.
  const [bottlenecks, setBottlenecks] = useState<any[]>(
    STRATEGIC_BOTTLENECKS.map(b => ({
      id: b.id,
      name: b.name,
      district: b.district,
      coords: b.coords,
      speedKmh: null,
      delayMin: null,
      status: "INCONNU",
      source: "none",
      confidence: 0,
      cause: null,
      typicalCause: b.cause,
      certifiedAlt: b.certifiedAlt,
      lingala: "Tozali kotala nzela…",
      votes: { still: 0, clear: 0, lastAgeMin: null },
      activeIncidents: []
    }))
  );
  const [commutes, setCommutes] = useState<any[]>(
    QUICK_COMMUTES.map(c => ({ ...c, status: "INCONNU", delay: "…", delayText: "Chargement…", badgeColor: "bg-slate-400", source: "none" }))
  );
  const [globalMetrics, setGlobalMetrics] = useState<{
    kinshasaHour: number;
    isPeakHour: boolean;
    avgSpeed: number | null;
    congestionIndex: number | null;
    activeIncidentsCount: number;
    votesLastHour?: number;
    liveCount?: number;
    nodeCount?: number;
    weather?: { rainMmH: number; rainProbNext2h: number } | null;
    activeEventsCount?: number;
    telemetrySource?: string;
    updatedAt: string;
    audioFlashText: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [corridorStates, setCorridorStates] = useState<Record<string, CorridorLive> | undefined>(undefined);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

  const walletBalanceCDF = profile?.walletBalanceCDF ?? 0;

  // --- Carte vivante : moment affiché (0 = maintenant, 1 = +1 h, 2 = +2 h) et nœud choisi
  const [timeOffset, setTimeOffset] = useState<0 | 1 | 2>(0);
  const [cityForecast, setCityForecast] = useState<Awaited<ReturnType<typeof getCityForecastAction>> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Un seul panneau plein écran à la fois ; la page d'accueil ne montre que la carte et des tuiles.
  const [panel, setPanel] = useState<Panel | null>(null);
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);
  const pushedRef = useRef(false);

  // Le bouton « retour » du téléphone ferme le panneau au lieu de quitter la page.
  const openPanel = useCallback((p: Panel) => {
    if (!pushedRef.current && typeof window !== 'undefined') {
      window.history.pushState({ ...(window.history.state || {}), kfPanel: true }, '');
      pushedRef.current = true;
    }
    setPanel(p);
  }, []);
  const closePanel = useCallback(() => {
    if (pushedRef.current) window.history.back();
    else setPanel(null);
  }, []);
  useEffect(() => {
    const onPop = () => { if (pushedRef.current) { pushedRef.current = false; setPanel(null); } };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    getCityForecastAction().then(setCityForecast).catch(() => setCityForecast(null));
  }, []);

  const mapNodes: MapNode[] = bottlenecks.map(b => {
    const f = timeOffset > 0 ? cityForecast?.nodes?.[b.id]?.[timeOffset - 1] : null;
    return {
      id: b.id,
      name: b.name,
      coords: b.coords,
      level: timeOffset === 0 ? levelFromStatus(b.status) : levelFromDelay(f?.delay ?? null),
      isLive: b.isLive,
      hasIncident: (b.activeIncidents?.length ?? 0) > 0,
    };
  });
  const forecastKnown = timeOffset > 0 ? mapNodes.filter(n => n.level !== 'none').length : 0;

  // Données enrichies pour la carte illustrée (fiche au toucher, signalements à leur vraie position).
  const cityNodes: CityMapNode[] = mapNodes.map((n, i) => {
    const b = bottlenecks[i];
    const f = timeOffset > 0 ? cityForecast?.nodes?.[b.id]?.[timeOffset - 1] : null;
    return {
      ...n,
      district: b.district,
      speedKmh: timeOffset === 0 ? b.speedKmh : null,
      delayMin: timeOffset === 0 ? b.delayMin : (typeof f?.delay === 'number' ? f.delay : null),
      cause: timeOffset === 0 ? b.cause : null,
      typicalCause: b.typicalCause,
      alt: b.certifiedAlt,
      lingala: timeOffset === 0 && b.status !== 'INCONNU' ? b.lingala : null,
      source: timeOffset === 0 ? b.source : 'estimate',
      incidents: timeOffset === 0 ? b.activeIncidents : [],
    };
  });

  // Humeur de K-Flow : pluie d'abord, puis la pire situation sur la carte, sinon l'heure.
  const blockedNodes = mapNodes.filter(n => n.level === 'block');
  const denseNodes = mapNodes.filter(n => n.level === 'dense' || n.level === 'mod');
  const okNodes = mapNodes.filter(n => n.level === 'ok');
  const narratorMood: Mood =
    (globalMetrics?.weather?.rainMmH ?? 0) >= 0.5 ? 'pluie'
      : blockedNodes.length > 0 ? 'bloque'
        : denseNodes.length > okNodes.length ? 'dense'
          : okNodes.length > 0 ? 'fluide'
            : moodFromClock();
  const narratorLines = [
    ...(blockedNodes.length > 0 ? [`Keba ! ${blockedNodes.slice(0, 2).map(n => n.name).join(' et ')} : nzela ekangami.`] : []),
    ...(okNodes.length > 0 && narratorMood !== 'bloque' ? [`${okNodes[0].name} ezali polele. Tokende !`] : []),
    ...MOOD_LINES[narratorMood],
  ];

  const selectNode = (id: string) => {
    setSelectedNodeId(id);
    setOpenNodeId(id);
    openPanel('radar');
    setTimeout(() => document.getElementById(`node-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  };

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
        if (res.corridors) setCorridorStates(res.corridors);
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
    setScoutName(name);
    setActiveAnalysis(null);
    openPanel('route');
    try {
      const data = await checkTrafficAction({ ...coords, address: name });
      setActiveAnalysis({ ...data, name });
    } catch (e: any) {
      closePanel();
      toast({ title: "Erreur", description: "Impossible d'analyser cet axe.", variant: "destructive" });
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  // Recherche d'une avenue : on localise d'abord l'avenue tapée, puis on l'analyse à cet endroit.
  const handleSearch = async () => {
    const q = search.trim();
    if (!q) return;
    setScoutName(q);
    setIsLoadingAnalysis(true);
    setActiveAnalysis(null);
    openPanel('route');
    (document.activeElement as HTMLElement | null)?.blur?.();
    try {
      const loc = await locateAxisAction(q);
      if (!loc.found) {
        setIsLoadingAnalysis(false);
        closePanel();
        toast({ title: "Avenue introuvable", description: `Nous ne trouvons pas « ${q} » à Kinshasa. Essayez un nom plus court (ex. : Huileries, Poids Lourds).`, variant: "destructive" });
        return;
      }
      await handleInspectAxis({ lat: loc.lat, lng: loc.lng }, loc.name);
    } catch {
      setIsLoadingAnalysis(false);
      closePanel();
      toast({ title: "Erreur", description: "Impossible de localiser cette avenue.", variant: "destructive" });
    }
  };

  // Vote 1-tap « toujours bloqué / c'est dégagé ». Un vote par usager, par nœud, par créneau de 30 min
  // (garanti par l'id du document et les règles Firestore). Le vote met à jour la carte de tout le monde.
  const handleVote = async (nodeId: string, nodeName: string, vote: 'still' | 'clear') => {
    if (!user) {
      toast({ title: "Connexion requise", description: "Connectez-vous pour voter et recevoir vos +25 FC.", variant: "destructive" });
      return;
    }
    const slot = voteSlot();
    const voteId = `${user.uid}_${nodeId}_${slot}`;
    try {
      await setDoc(doc(firestore, 'traffic_votes', voteId), {
        userId: user.uid,
        nodeId,
        vote,
        slot,
        createdAt: serverTimestamp()
      });
    } catch {
      // Document déjà créé pour ce créneau : les règles refusent la réécriture.
      setVotedNodes(prev => ({ ...prev, [nodeId]: vote }));
      toast({ title: "Déjà voté", description: "Vous avez déjà donné l'état de ce carrefour. Revenez dans 30 minutes." });
      return;
    }
    setVotedNodes(prev => ({ ...prev, [nodeId]: vote }));
    fetchRealtimeTraffic(true);
    try {
      const res = await awardWalletContributionAction({
        idToken: await user.getIdToken(),
        type: 'upvote',
        refId: voteId,
        road: nodeName,
      });
      if (res.success) {
        const extras = [
          ...(res.missionsCompleted?.length ? [`Mission réussie : ${res.missionsCompleted.join(', ')}`] : []),
          ...(res.badgesUnlocked?.length ? [`Badge : ${res.badgesUnlocked.join(', ')}`] : []),
        ];
        toast({
          title: res.levelUp ? `Niveau ${res.level} ! Rang : ${res.rank}` : `+${res.xpGained} XP`,
          description: [res.message, ...extras].join(' · '),
        });
      } else {
        toast({ title: "Merci, la carte est à jour", description: res.error || "Votre vote est compté." });
      }
    } catch {
      toast({ title: "Merci, la carte est à jour", description: "Votre vote est compté." });
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

  const raining = (globalMetrics?.weather?.rainMmH ?? 0) >= 0.5;
  const hotNodes = bottlenecks.filter(n => ['BLOQUÉ', 'EMBOUTEILLAGE'].includes(n.status)).length;
  const worstCommute = commutes.reduce<any>((w, c) => (typeof c.delayMin === 'number' && (!w || c.delayMin > (w.delayMin ?? -1)) ? c : w), null);

  // Une ligne compacte par nœud ; le détail complet ne s'ouvre que si l'usager touche la ligne.
  const renderNode = (node: any) => {
    const statusKey = (node.status || node.initialStatus || "MODÉRÉ") as keyof typeof STATUS_CONFIG;
    const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.MODÉRÉ;
    const myVote = votedNodes[node.id];
    const nodeVotes = node.votes as { still: number; clear: number; lastAgeMin: number | null } | undefined;
    const speed = node.speedKmh ?? node.speed;
    const delay = node.delayMin ?? node.delay;
    const open = openNodeId === node.id;

    return (
      <div
        key={node.id}
        id={`node-${node.id}`}
        className={cn(
          "rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all scroll-mt-4",
          open && "ring-2 ring-amber-400 border-amber-400"
        )}
      >
        <button
          type="button"
          onClick={() => { setOpenNodeId(open ? null : node.id); setSelectedNodeId(node.id); }}
          aria-expanded={open}
          className="w-full flex items-center gap-3 p-3 text-left"
        >
          <span className="text-base shrink-0">{cfg.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="font-black text-sm text-slate-900 dark:text-white leading-tight truncate">{node.name}</div>
            <div className="text-[10px] font-semibold text-slate-400 truncate">
              {node.district}
              {node.activeIncidents?.length > 0 && <span className="text-red-500"> · 🚨 {node.activeIncidents.length} signalement(s)</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <Badge className={cn("text-white font-black text-[10px] uppercase", cfg.badgeBg)}>{cfg.label}</Badge>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5 tabular-nums">
              {typeof delay === 'number' ? `${node.isLive ? '' : '~'}+${delay} min · ${speed} km/h` : typeof speed === 'number' ? `${speed} km/h` : '—'}
            </div>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-slate-400 shrink-0 transition-transform", open && "rotate-180")} />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-2.5">
                <SourceChip source={node.source} confidence={node.confidence} />

                {/* Pourquoi ça bloque : causes réelles avec preuve et poids */}
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-300/40 text-slate-800 dark:text-slate-200 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-800 dark:text-amber-300">
                    <ShieldAlert className="h-3 w-3 text-amber-600" />
                    <span>Pourquoi ?</span>
                  </div>
                  {Array.isArray(node.why) && node.why.length > 0 ? (
                    <ul className="space-y-2">
                      {node.why.map((w: any, i: number) => (
                        <li key={i} className="space-y-1">
                          <div className="flex items-start justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {w.label}
                              <span className={cn("block text-[10px] font-medium", w.confirmed ? "text-slate-500" : "text-amber-700 dark:text-amber-400")}>{w.evidence}</span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 tabular-nums">{w.pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-amber-500/15 overflow-hidden">
                            <div className="h-full rounded-full bg-amber-500" style={{ width: `${w.pct}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-400">
                      {node.status === 'INCONNU' ? 'Chargement…' : "Rien de signalé ici pour l'instant. Vous êtes sur place ? Dites-le en un tap."}
                    </p>
                  )}
                </div>

                {/* Échappatoire : vérifiée en direct quand le carrefour est chargé */}
                <div className={cn(
                  "p-3 rounded-2xl border text-slate-800 dark:text-slate-200 space-y-1",
                  node.altIsBetter === false ? "bg-amber-500/10 border-amber-300/40" : "bg-emerald-500/10 border-emerald-300/40"
                )}>
                  <div className={cn(
                    "flex items-center justify-between gap-1.5 text-[10px] font-black uppercase",
                    node.altIsBetter === false ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"
                  )}>
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className={cn("h-3 w-3", node.altIsBetter === false ? "text-amber-600" : "text-emerald-600")} />
                      {typeof node.altDelayMin !== 'number'
                        ? 'Échappatoire habituelle'
                        : node.altIsBetter ? 'Déviation vérifiée plus rapide' : 'Déviation aussi chargée'}
                    </span>
                    {typeof node.altDelayMin === 'number' && (
                      <span className="text-[9px] font-bold normal-case">
                        +{node.altDelayMin} min · {node.altSpeedKmh} km/h ({node.altSource === 'google' ? 'en direct' : 'estimé'})
                      </span>
                    )}
                  </div>
                  <p className={cn("text-xs font-bold leading-relaxed pl-4", node.altIsBetter === false ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300")}>
                    {typeof node.altDelayMin === 'number' ? node.altName : node.certifiedAlt}
                  </p>
                </div>

                {node.lingala && (
                  <div className="text-[11px] font-bold italic text-primary dark:text-blue-400 pl-1">🇨🇩 "{node.lingala}"</div>
                )}

                {/* Actions : vote 1-tap (sur place) + film de la route */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col gap-1 min-w-0">
                    {myVote ? (
                      <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{myVote === 'still' ? 'Vous : toujours bloqué' : "Vous : c'est dégagé"}</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => handleVote(node.id, node.name, 'still')}
                          className="rounded-xl text-[11px] font-black text-red-700 dark:text-red-400 border-red-300 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 gap-1 h-9 px-2.5">
                          <ThumbsDown className="h-3 w-3" /><span>Toujours bloqué</span>
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleVote(node.id, node.name, 'clear')}
                          className="rounded-xl text-[11px] font-black text-emerald-700 dark:text-emerald-400 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 gap-1 h-9 px-2.5">
                          <ThumbsUp className="h-3 w-3" /><span>C'est dégagé</span>
                        </Button>
                      </div>
                    )}
                    {nodeVotes && (nodeVotes.still + nodeVotes.clear) > 0 && (
                      <span className="text-[10px] text-slate-500 font-medium">
                        {nodeVotes.still} bloqué · {nodeVotes.clear} dégagé{nodeVotes.lastAgeMin !== null ? ` · dernier vote il y a ${nodeVotes.lastAgeMin} min` : ''}
                      </span>
                    )}
                  </div>
                  <Button size="sm" onClick={() => handleInspectAxis(node.coords, node.name)} className="rounded-xl text-xs font-bold gap-1 h-9">
                    <span>Voir le film</span><ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const PANEL_META: Record<Panel, { title: string; subtitle?: string; icon: React.ReactNode }> = {
    route: {
      title: activeAnalysis?.name || scoutName || 'Ta route',
      subtitle: isLoadingAnalysis ? 'K-Flow part en reconnaissance…' : 'Le film de ta route, en direct',
      icon: <Radar className="h-5 w-5 text-[#2EB6F0]" />,
    },
    trajets: { title: 'Mes trajets quotidiens', subtitle: 'Un tap = le film du trajet', icon: <Car className="h-5 w-5 text-[#2EB6F0]" /> },
    radar: { title: 'Radar des 8 nœuds', subtitle: 'Touchez un carrefour pour le détail', icon: <Radio className="h-5 w-5 text-red-400" /> },
    telemetrie: { title: 'Télémétrie de la ville', subtitle: lastRefreshedAt ? `Mis à jour à ${lastRefreshedAt}` : 'Synchronisation…', icon: <Flame className="h-5 w-5 text-amber-400" /> },
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      {/* ── 1. BARRE DU HAUT : titre + 3 chiffres clés + recherche (reste visible en défilant) ── */}
      <div className="sticky top-0 z-30 bg-[#0A1A29]/95 backdrop-blur text-white border-b border-[#22425C] shadow-lg">
        <div className="max-w-6xl mx-auto w-full px-3 sm:px-4 md:px-6 pt-2.5 pb-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <h1 className="text-base sm:text-xl font-black tracking-tight text-white truncate">
              Centre de Contrôle <span className="hidden sm:inline">Trafic </span><span className="text-[#2EB6F0]">K-Flow</span>
            </h1>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePlayGlobalVoiceFlash}
                aria-label={isPlayingAudio ? "Arrêter le flash audio" : "Écouter le flash audio 20 s (lingala)"}
                className={cn("grid h-9 w-9 place-items-center rounded-full border transition-colors", isPlayingAudio ? "bg-amber-500 border-amber-400 text-slate-950" : "bg-white/10 border-white/15 hover:bg-white/20")}
              >
                {isPlayingAudio ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-amber-300" />}
              </button>
              <button
                type="button"
                onClick={() => fetchRealtimeTraffic(true)}
                disabled={isRefreshing}
                aria-label="Actualiser les mesures"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 border border-white/15 hover:bg-white/20 transition-colors"
              >
                <RefreshCw className={cn("h-4 w-4 text-[#2EB6F0]", isRefreshing && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* Chiffres clés : un tap ouvre toute la télémétrie */}
          <button type="button" onClick={() => openPanel('telemetrie')} className="w-full flex items-center gap-1.5 text-[11px] overflow-x-auto no-scrollbar" aria-label="Voir toute la télémétrie">
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2.5 py-1">
              <Flame className="h-3 w-3 text-amber-400" />
              <b className="text-amber-300">{typeof globalMetrics?.congestionIndex === 'number' ? `${globalMetrics.congestionIndex}%` : '—'}</b>
              <span className="text-slate-400">congestion</span>
            </span>
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2.5 py-1">
              <Car className="h-3 w-3 text-[#2EB6F0]" />
              <b className="text-sky-300">{typeof globalMetrics?.avgSpeed === 'number' ? `${globalMetrics.avgSpeed} km/h` : '—'}</b>
            </span>
            {(globalMetrics?.activeIncidentsCount ?? 0) > 0 && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/30 px-2.5 py-1 text-red-300 font-bold">
                <AlertCircle className="h-3 w-3" /> {globalMetrics!.activeIncidentsCount} incident(s)
              </span>
            )}
            {raining && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-sky-500/15 border border-sky-500/30 px-2.5 py-1 text-sky-300 font-bold">
                <CloudRain className="h-3 w-3" /> Pluie
              </span>
            )}
            <span className="shrink-0 ml-auto inline-flex items-center gap-0.5 text-slate-400 font-bold">Plus <ChevronRight className="h-3 w-3" /></span>
          </button>

          {/* Recherche : l'action principale de la page */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Quelle avenue ? (Huileries, By-Pass…)"
                enterKeyHint="search"
                className="pl-10 h-11 rounded-xl bg-white text-slate-900 border-transparent font-bold text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              />
            </div>
            <Button onClick={handleSearch} disabled={isLoadingAnalysis} className="h-11 px-4 rounded-xl font-black text-xs gap-1.5 shrink-0" aria-label="Vérifier cet axe">
              {isLoadingAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
              <span className="hidden sm:inline">Vérifier</span>
            </Button>
            <Button asChild variant="outline" className="h-11 w-11 sm:w-auto sm:px-4 p-0 rounded-xl font-bold text-xs gap-1.5 shrink-0 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
              <Link href="/k-flow-nav" aria-label="GPS Nav">
                <Navigation className="h-4 w-4" />
                <span className="hidden sm:inline">GPS</span>
              </Link>
            </Button>
          </div>

          {activeAnalysis && panel !== 'route' && (
            <button type="button" onClick={() => openPanel('route')} className="w-full flex items-center gap-2 rounded-xl bg-[#2EB6F0]/15 border border-[#2EB6F0]/40 px-3 py-1.5 text-xs font-bold text-sky-200">
              <Radar className="h-3.5 w-3.5" />
              <span className="truncate">Revoir le film : {activeAnalysis.name}</span>
              <ChevronRight className="h-3.5 w-3.5 ml-auto shrink-0" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full p-3 sm:p-4 md:p-6 space-y-3 pb-24 md:pb-12">
        <KFlowSays mood={narratorMood} lines={narratorLines} tone="light" />

        {/* ── 2. LA CARTE VIVANTE : le cœur de la page ── */}
        <div className="rounded-3xl bg-[#0A1A29] text-[#EAF3FA] p-2.5 sm:p-4 border border-[#22425C] shadow-xl space-y-2.5">
          <div className="flex items-center gap-1.5">
            {([0, 1, 2] as const).map(o => (
              <button
                key={o}
                type="button"
                onClick={() => setTimeOffset(o)}
                aria-pressed={timeOffset === o}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold border transition-colors",
                  timeOffset === o ? "bg-[#EAF3FA] text-[#0A1A29] border-[#EAF3FA]" : "bg-[#11273A] text-[#EAF3FA] border-[#22425C] hover:border-[#8EA8BD]"
                )}
              >
                {o === 0 ? 'Maintenant' : `+${o} h`}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-[#8EA8BD] text-right leading-tight">
              {timeOffset === 0
                ? (lastRefreshedAt ? `maj ${lastRefreshedAt}` : 'Chargement…')
                : forecastKnown > 0
                  ? `Prévision · ${forecastKnown}/8 nœuds`
                  : "Pas assez d'historique"}
            </span>
          </div>
          <KinshasaCityMap
            nodes={cityNodes}
            selectedId={selectedNodeId}
            onSelect={setSelectedNodeId}
            onOpenDetails={selectNode}
            raining={raining}
            corridorStates={timeOffset === 0 ? corridorStates : undefined}
            timeLabel={timeOffset === 0 ? (lastRefreshedAt ? `maj ${lastRefreshedAt}` : undefined) : `prévision +${timeOffset} h`}
          />
        </div>

        {/* ── 3. TUILES : chaque rubrique s'ouvre en plein écran, seulement si l'usager la demande ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Tile
            onClick={() => openPanel('trajets')}
            icon={<Car className="h-5 w-5" />}
            tint="from-sky-500/20 to-sky-500/5 text-sky-600 dark:text-sky-300"
            title="Mes trajets"
            value={worstCommute ? (worstCommute.delayText || `+${worstCommute.delayMin} min`) : `${commutes.length} trajets`}
            hint={worstCommute ? `Pire : ${worstCommute.title}` : 'Domicile ↔ bureau'}
          />
          <Tile
            onClick={() => openPanel('radar')}
            icon={<Radio className="h-5 w-5" />}
            tint={hotNodes > 0 ? "from-red-500/20 to-red-500/5 text-red-600 dark:text-red-300" : "from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-300"}
            title="Radar 8 nœuds"
            value={hotNodes > 0 ? `${hotNodes} bouché${hotNodes > 1 ? 's' : ''}` : 'Rien de bouché'}
            hint="Causes, déviations, votes"
          />
          <Tile
            onClick={() => openPanel('telemetrie')}
            icon={<Flame className="h-5 w-5" />}
            tint="from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-300"
            title="Télémétrie"
            value={globalMetrics ? (globalMetrics.isPeakHour ? 'Heure de pointe' : 'Heure normale') : '…'}
            hint={globalMetrics && typeof globalMetrics.liveCount === 'number' ? `${globalMetrics.liveCount}/${globalMetrics.nodeCount} en direct` : 'Sources et mesures'}
          />
          <Tile
            href="/e-wallet"
            icon={<Wallet className="h-5 w-5" />}
            tint="from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-300"
            title="Mon E-Wallet"
            value={`${walletBalanceCDF.toLocaleString()} FC`}
            hint="+25 FC par vote sur place"
          />
        </div>

        <div className="hidden md:block"><PlayerHud profile={profile} /></div>
      </div>

      {/* ── PANNEAUX PLEIN ÉCRAN ── */}
      <FullPanel
        open={panel !== null}
        onClose={closePanel}
        title={panel ? PANEL_META[panel].title : ''}
        subtitle={panel ? PANEL_META[panel].subtitle : undefined}
        icon={panel ? PANEL_META[panel].icon : undefined}
      >
        {panel === 'route' && (
          <div className="space-y-3">
            {isLoadingAnalysis && !activeAnalysis && <RouteScout name={scoutName} />}
            {activeAnalysis && (
              <>
                <RouteStory analysis={activeAnalysis} raining={raining} onClose={closePanel} />
                <details className="group rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-xs font-black uppercase tracking-wider text-slate-500">
                    <Info className="h-4 w-4" /> Les détails (statut, cause, alternatives)
                    <ChevronDown className="h-4 w-4 ml-auto transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 p-3 pt-0">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Statut de Fluidité</div>
                      <div className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{STATUS_CONFIG[activeAnalysis.status as keyof typeof STATUS_CONFIG]?.icon}</span>
                        <span>{activeAnalysis.status}</span>
                        {activeAnalysis.delay > 0 && <span className="text-red-600 text-xs">({activeAnalysis.isLive ? '' : '~'}+{activeAnalysis.delay} min)</span>}
                      </div>
                      <SourceChip source={activeAnalysis.source} confidence={activeAnalysis.confidence} />
                    </div>
                    <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-1">
                      <div className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" /> {activeAnalysis.cause ? `Signalé il y a ${activeAnalysis.reportAgeMin ?? '?'} min` : "Cause habituelle (non confirmée)"}
                      </div>
                      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 leading-tight">
                        {activeAnalysis.cause || activeAnalysis.typicalCause || "Aucun signalement récent sur cet axe."}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-1">
                      <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> Alternative habituelle
                      </div>
                      <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 leading-tight">
                        {activeAnalysis.typicalAlternative || "Contourner par les voies secondaires."}
                      </p>
                      {Array.isArray(activeAnalysis.alternatives) && activeAnalysis.alternatives.length > 0 && (
                        <ul className="pt-1 space-y-0.5 text-[10px] text-emerald-800 dark:text-emerald-300">
                          {activeAnalysis.alternatives.map((alt: any, i: number) => (
                            <li key={i}>Mesuré : {alt.description} · {alt.duration}{typeof alt.delay === 'number' ? ` (+${alt.delay} min)` : ''}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </details>
              </>
            )}
          </div>
        )}

        {panel === 'trajets' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {commutes.map((commute) => (
              <button
                type="button"
                key={commute.id}
                onClick={() => handleInspectAxis(commute.coords, commute.via)}
                className="text-left rounded-2xl border border-slate-200/80 dark:border-slate-800 hover:border-primary/50 transition-all shadow-sm bg-white dark:bg-slate-900 p-4 space-y-2"
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="font-black text-sm text-slate-900 dark:text-white leading-tight">{commute.title}</span>
                  <Badge className={cn("text-white font-black text-[10px] shrink-0", commute.badgeColor)}>{commute.delayText || commute.delay}</Badge>
                </div>
                <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between gap-2">
                  <span className="truncate">Via {commute.via}</span>
                  {commute.distKm && <span className="font-bold shrink-0">{commute.distKm} km · ~{commute.durMin} min</span>}
                </div>
                <SourceChip source={commute.source} confidence={commute.confidence} />
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-300/40 flex items-start gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 leading-tight">{commute.escape}</span>
                </div>
                <div className="flex items-center justify-end gap-1 text-xs font-black text-primary">Voir le film <ArrowRight className="h-3 w-3" /></div>
              </button>
            ))}
          </div>
        )}

        {panel === 'radar' && (
          <div className="space-y-2">
            {bottlenecks.map(renderNode)}
            <p className="pt-1 text-center text-[11px] text-slate-500">Vous êtes sur place ? Votez : la carte de tout Kinshasa se met à jour et vous gagnez +25 FC.</p>
          </div>
        )}

        {panel === 'telemetrie' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label="Moment" value={globalMetrics ? `${globalMetrics.isPeakHour ? 'Heure de pointe' : 'Heure normale'} (${globalMetrics.kinshasaHour}h)` : '…'} tone="text-emerald-600" />
              <Stat label="Congestion" value={typeof globalMetrics?.congestionIndex === 'number' ? `${globalMetrics.congestionIndex}%` : '—'} tone="text-amber-600" />
              <Stat label="Vitesse moyenne" value={typeof globalMetrics?.avgSpeed === 'number' ? `${globalMetrics.avgSpeed} km/h` : '—'} tone="text-sky-600" />
              <Stat label="Nœuds en direct" value={globalMetrics && typeof globalMetrics.liveCount === 'number' ? `${globalMetrics.liveCount}/${globalMetrics.nodeCount}` : '—'} tone={globalMetrics?.liveCount ? "text-emerald-600" : "text-amber-600"} />
              <Stat label="Incidents signalés" value={String(globalMetrics?.activeIncidentsCount ?? 0)} tone="text-red-600" />
              <Stat label="Votes cette heure" value={String(globalMetrics?.votesLastHour ?? 0)} tone="text-sky-600" />
              {raining && <Stat label="Pluie" value={`${globalMetrics!.weather!.rainMmH.toFixed(1)} mm/h`} tone="text-sky-600" />}
              {(globalMetrics?.activeEventsCount ?? 0) > 0 && <Stat label="Événements en cours" value={String(globalMetrics!.activeEventsCount)} tone="text-amber-600" />}
            </div>
            <p className="text-[11px] text-slate-500">
              Source : {globalMetrics?.telemetrySource || 'Live'}{lastRefreshedAt ? ` · mis à jour à ${lastRefreshedAt}` : ''}. Actualisation automatique toutes les 45 s.
            </p>
            <PlayerHud profile={profile} />
            <Button onClick={() => fetchRealtimeTraffic(true)} disabled={isRefreshing} variant="outline" className="w-full h-11 rounded-xl font-bold gap-2">
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} /> Actualiser maintenant
            </Button>
          </div>
        )}
      </FullPanel>
    </div>
  );
}

type Panel = 'route' | 'trajets' | 'radar' | 'telemetrie';

function Tile({ icon, tint, title, value, hint, onClick, href }: {
  icon: React.ReactNode; tint: string; title: string; value: string; hint?: string; onClick?: () => void; href?: string;
}) {
  const inner = (
    <>
      <div className={cn("grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br", tint)}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{title}</div>
        <div className="text-sm font-black text-slate-900 dark:text-white truncate">{value}</div>
        {hint && <div className="text-[10px] text-slate-500 truncate">{hint}</div>}
      </div>
      <ChevronRight className="absolute right-2.5 top-3 h-4 w-4 text-slate-300" />
    </>
  );
  const cls = "relative flex flex-col gap-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3 text-left shadow-sm hover:border-primary/50 active:scale-[0.98] transition-all";
  return href
    ? <Link href={href} className={cls}>{inner}</Link>
    : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3">
      <div className="text-[10px] font-bold uppercase text-slate-400">{label}</div>
      <div className={cn("text-sm font-black", tone)}>{value}</div>
    </div>
  );
}
