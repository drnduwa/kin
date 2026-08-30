'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw, 
  Search, 
  Clock, 
  Star, 
  Loader2, 
  AlertCircle, 
  PlusCircle, 
  Activity, 
  TrendingDown, 
  ArrowUpRight, 
  MapPin, 
  Waves, 
  Bot,
  Car,
  Flame,
  ShieldAlert,
  Compass,
  Sparkles,
  CheckCircle2,
  Navigation,
  Share2,
  Camera,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getGoogleTrafficStatusAction } from '@/app/actions';
import { MAJOR_AXES } from '@/lib/constants';
import { useCollection, useFirebase, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, orderBy, limit, doc } from 'firebase/firestore';
import { EventReport, UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

type TrafficStatus = 'EMBOUTEILLAGE' | 'DENSE' | 'MODÉRÉ' | 'FLUIDE' | 'INCONNU';

interface Incident {
  id: string;
  road: string;
  description: string;
  district: string;
  status: TrafficStatus;
  speed: number;
  delay: number;
  updatedAt: string;
  source: 'gps' | 'user';
  picture?: string;
  coords?: { lat: number, lng: number };
}

const DISTRICT_FILTERS = [
  { id: 'all', label: 'Toute la Ville', icon: Layers },
  { id: 'hotspots', label: '🔥 Points Chauds', icon: Flame },
  { id: 'Gombe', label: '🏢 Gombe (Centre)', icon: MapPin },
  { id: 'Ngaliema', label: '⛰️ Ngaliema & UPN', icon: MapPin },
  { id: 'Limete', label: '🌉 Limete & Poids Lourds', icon: MapPin },
  { id: 'Masina', label: '✈️ Masina & N\'djili', icon: MapPin },
  { id: 'Kalamu', label: '🏟️ Kalamu & Victoire', icon: MapPin },
  { id: 'Lemba', label: '🚦 Lemba & By-Pass', icon: MapPin },
  { id: 'citizens', label: '📸 Alertes Citoyens', icon: Camera },
];

export default function TrafficReports() {
  const [navIncidents, setNavIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { firestore, user } = useFirebase();
  const { toast } = useToast();

  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc<UserProfile>(userRef);

  const userReportsQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'events'), orderBy('createdAt', 'desc'), limit(50));
  }, [firestore]);
  
  const { data: userReports } = useCollection<EventReport>(userReportsQuery);

  const fetchTrafficData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    if (!isRefresh) setLoading(true);
    
    try {
      const data = await getGoogleTrafficStatusAction(MAJOR_AXES);
      setLastUpdated(new Date());
      
      const analyzedAxes: Incident[] = data.map((res, idx) => {
        const axis = MAJOR_AXES[idx];
        return {
          id: `google-${idx}`,
          road: res.road,
          description: res.status === "FLUIDE" ? "Circulation normale et fluide" : `Ralentissement de +${res.delay} min`,
          district: axis.district,
          status: res.status as TrafficStatus,
          speed: res.speed || 35,
          delay: res.delay || 0,
          updatedAt: "GPS Direct",
          source: 'gps',
          coords: axis.origin
        };
      });

      setNavIncidents(analyzedAxes);
    } catch (err) {
      console.error("Traffic API Error:", err);
      toast({ title: "Erreur d'actualisation", description: "Impossible de récupérer les flux de trafic.", variant: "destructive" });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { fetchTrafficData(); }, [fetchTrafficData]);

  const allIncidents = useMemo(() => {
    const formattedUserReports: Incident[] = (userReports || []).map(rep => ({
        id: rep.id,
        road: rep.location,
        description: rep.description,
        district: "Témoin",
        status: rep.severity === 'high' ? 'EMBOUTEILLAGE' : rep.severity === 'medium' ? 'DENSE' : 'MODÉRÉ',
        speed: 15,
        delay: rep.severity === 'high' ? 20 : 10,
        updatedAt: "Signalement Citoyen",
        source: 'user',
        picture: rep.picture
    }));
    return [...formattedUserReports, ...navIncidents].sort((a, b) => b.delay - a.delay);
  }, [navIncidents, userReports]);

  // Key Strategic Arteries of Kinshasa
  const strategicArteries = useMemo(() => {
    const bld30 = allIncidents.find(i => i.road.toLowerCase().includes('30 juin')) || {
      road: 'Boulevard du 30 Juin', district: 'Gombe', status: 'FLUIDE', delay: 0, speed: 45
    };
    const bldLumumba = allIncidents.find(i => i.road.toLowerCase().includes('lumumba')) || {
      road: 'Boulevard Lumumba', district: 'Limete', status: 'MODÉRÉ', delay: 8, speed: 25
    };
    const routeMatadi = allIncidents.find(i => i.road.toLowerCase().includes('mondjiba') || i.road.toLowerCase().includes('matadi')) || {
      road: 'Avenue Mondjiba / Kintambo', district: 'Ngaliema', status: 'DENSE', delay: 15, speed: 18
    };

    return [
      { name: 'Blvd du 30 Juin (Gombe)', data: bld30 },
      { name: 'Blvd Lumumba (Axe Est)', data: bldLumumba },
      { name: 'Av. Mondjiba (Axe Ouest)', data: routeMatadi }
    ];
  }, [allIncidents]);

  const stats = useMemo(() => {
    const total = navIncidents.length || 1;
    const congested = navIncidents.filter(i => i.status === 'EMBOUTEILLAGE' || i.status === 'DENSE').length;
    const saturation = Math.round((congested / total) * 100);
    const avgSpeed = Math.round(navIncidents.reduce((acc, curr) => acc + (curr.speed || 30), 0) / total);
    const avgDelay = Math.round(navIncidents.reduce((acc, curr) => acc + (curr.delay || 0), 0) / total);

    let summaryText = "Circulation globale normale dans la capitale.";
    let summaryColor = "emerald";
    let statusLabel = "Circulation Fluide";

    if (saturation > 40) {
      summaryText = "Heure de pointe intense : ralentissements majeurs sur les boulevards.";
      summaryColor = "red";
      statusLabel = "Forte Saturation";
    } else if (saturation > 15) {
      summaryText = "Ralentissements modérés aux carrefours habituels (Limete, Kintambo).";
      summaryColor = "amber";
      statusLabel = "Ralentissements Localisés";
    }

    return {
      saturation,
      avgSpeed: avgSpeed > 0 ? avgSpeed : 32,
      avgDelay: avgDelay > 0 ? avgDelay : 4,
      blockedCount: navIncidents.filter(i => i.status === 'EMBOUTEILLAGE').length,
      denseCount: navIncidents.filter(i => i.status === 'DENSE').length,
      fluideCount: navIncidents.filter(i => i.status === 'FLUIDE').length,
      summaryText,
      summaryColor,
      statusLabel,
      topHotspots: allIncidents.filter(i => i.delay > 5).slice(0, 4)
    };
  }, [navIncidents, allIncidents]);

  const filteredIncidents = useMemo(() => {
    let list = allIncidents;

    if (selectedFilter === 'hotspots') {
      list = list.filter(i => i.status === 'EMBOUTEILLAGE' || i.status === 'DENSE' || i.delay > 5);
    } else if (selectedFilter === 'citizens') {
      list = list.filter(i => i.source === 'user');
    } else if (selectedFilter !== 'all') {
      list = list.filter(i => i.district.toLowerCase().includes(selectedFilter.toLowerCase()));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i => 
        i.road.toLowerCase().includes(q) || 
        i.district.toLowerCase().includes(q) || 
        i.description.toLowerCase().includes(q)
      );
    }

    return list;
  }, [allIncidents, selectedFilter, searchQuery]);

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full w-full bg-slate-50 overflow-hidden rounded-2xl md:rounded-3xl border border-slate-100">
      
      {/* ── Top App Bar ── */}
      <div className="bg-white border-b shadow-sm z-30 p-3.5 sm:p-4 md:p-5 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-2xl shrink-0">
              <Compass className="text-primary h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Baromètre Trafic Kinshasa</h1>
                <Badge className="bg-emerald-500 text-white font-black text-[9px] uppercase px-1.5 py-0 border-none animate-pulse">
                  Direct
                </Badge>
              </div>
              <p className="text-[10px] md:text-xs font-medium text-slate-500">
                État des routes, points noirs et alertes en temps réel {lastUpdated && `• Actualisé à ${format(lastUpdated, 'HH:mm')}`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild size="sm" className="rounded-xl h-10 bg-primary hover:bg-primary/90 text-white font-black text-xs px-4 shadow-md shadow-primary/20 gap-1.5">
              <Link href="/signaler-embouteillage">
                <PlusCircle className="h-4 w-4" />
                <span>Signaler (+10 ⭐)</span>
              </Link>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => fetchTrafficData(true)} 
              disabled={isRefreshing} 
              className="rounded-xl h-10 border-2 font-bold px-3 text-xs bg-white hover:bg-slate-50"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1.5">Actualiser</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Scrollable Body Content ── */}
      <div className="p-3 sm:p-4 md:p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-12">
          
          {/* 1. Flash Info & Baromètre de la Ville */}
          <div className={cn(
            "rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden transition-all",
            stats.summaryColor === 'red' ? "bg-gradient-to-br from-red-600 via-rose-600 to-orange-600" :
            stats.summaryColor === 'amber' ? "bg-gradient-to-br from-amber-600 via-orange-500 to-amber-700" :
            "bg-gradient-to-br from-primary via-blue-600 to-indigo-700"
          )}>
            <div className="relative z-10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 backdrop-blur-md p-2.5 rounded-2xl">
                    <Activity className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <Badge className="bg-white/25 text-white border-none text-[9px] font-black uppercase tracking-wider mb-1">
                      FLASH INFO TRAFIC
                    </Badge>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
                      {stats.statusLabel}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/10 self-start sm:self-auto">
                  <Sparkles className="h-4 w-4 text-amber-300 fill-amber-300 shrink-0" />
                  <p className="text-xs font-bold text-white/95">
                    {stats.summaryText}
                  </p>
                </div>
              </div>

              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                <div className="bg-white/15 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Saturation</p>
                  <p className="text-2xl font-black">{stats.saturation}%</p>
                  <p className="text-[9px] text-white/80 font-medium">de la ville ralentie</p>
                </div>

                <div className="bg-white/15 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Vitesse Moy.</p>
                  <p className="text-2xl font-black">{stats.avgSpeed} <span className="text-xs">km/h</span></p>
                  <p className="text-[9px] text-white/80 font-medium">allure moyenne</p>
                </div>

                <div className="bg-white/15 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Retard Moyen</p>
                  <p className="text-2xl font-black">+{stats.avgDelay} <span className="text-xs">min</span></p>
                  <p className="text-[9px] text-white/80 font-medium">sur vos trajets</p>
                </div>

                <div className="bg-white/15 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Points Noirs</p>
                  <p className="text-2xl font-black">{stats.blockedCount + stats.denseCount}</p>
                  <p className="text-[9px] text-white/80 font-medium">axes à éviter</p>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Les 3 Portes Stratégiques de Kinshasa */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" /> Les 3 Artères Vitales de la Capitale
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {strategicArteries.map((art, idx) => (
                <div key={idx} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">{art.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={cn(
                        "inline-block w-2 h-2 rounded-full",
                        art.data.status === 'FLUIDE' ? "bg-emerald-500" :
                        art.data.status === 'MODÉRÉ' ? "bg-amber-500" : "bg-red-500"
                      )} />
                      <span className="text-[10px] font-bold text-slate-600">{art.data.status}</span>
                      {art.data.delay > 0 && <span className="text-[10px] font-black text-red-600">+{art.data.delay}m</span>}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="rounded-xl h-8 w-8 p-0 text-primary hover:bg-primary/10 shrink-0">
                    <Link href="/k-flow-nav"><Navigation className="h-4 w-4" /></Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Commune Filter Pills */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                Explorer par Commune ou Catégorie
              </h3>
              <span className="text-[10px] font-bold text-slate-400">{filteredIncidents.length} axes trouvés</span>
            </div>

            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              {DISTRICT_FILTERS.map((f) => {
                const Icon = f.icon;
                const isActive = selectedFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFilter(f.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all shrink-0",
                      isActive 
                        ? "bg-slate-900 text-white shadow-md shadow-slate-900/20 scale-105 font-black" 
                        : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Search & Detailed Road List */}
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Rechercher une avenue, un carrefour, une commune (ex: Victoire, UPN, 30 Juin)..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-12 bg-white border border-slate-200/80 shadow-sm rounded-2xl font-bold text-sm"
              />
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white rounded-3xl border border-slate-100">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Synchronisation des axes routiers de Kinshasa...</p>
              </div>
            ) : filteredIncidents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredIncidents.map((incident) => (
                  <motion.div 
                    key={incident.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all overflow-hidden bg-white group">
                      <div className="flex items-stretch">
                        <div className={cn(
                          "w-2 shrink-0 transition-all",
                          incident.status === 'EMBOUTEILLAGE' ? "bg-red-600" :
                          incident.status === 'DENSE' ? "bg-orange-500" :
                          incident.status === 'MODÉRÉ' ? "bg-amber-500" :
                          "bg-emerald-500"
                        )} />

                        <CardContent className="p-4 flex-1 flex flex-col justify-between gap-3">
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div>
                                <h4 className="font-black text-sm text-slate-900 leading-snug group-hover:text-primary transition-colors">
                                  {incident.road}
                                </h4>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <Badge variant="outline" className="text-[9px] font-black uppercase text-primary py-0 border-primary/20">
                                    {incident.district}
                                  </Badge>
                                  <span className="text-[9px] font-bold text-slate-400">
                                    {incident.updatedAt}
                                  </span>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className={cn(
                                  "text-xs font-black px-2 py-1 rounded-xl inline-block",
                                  incident.status === 'EMBOUTEILLAGE' ? "bg-red-100 text-red-700" :
                                  incident.status === 'DENSE' ? "bg-orange-100 text-orange-700" :
                                  incident.status === 'MODÉRÉ' ? "bg-amber-100 text-amber-700" :
                                  "bg-emerald-100 text-emerald-700"
                                )}>
                                  {incident.status === 'FLUIDE' ? '🟢 Fluide' : `+${incident.delay} min`}
                                </span>
                              </div>
                            </div>

                            <p className="text-xs text-slate-500 font-medium line-clamp-1">
                              {incident.description}
                            </p>
                          </div>

                          {/* Action Bar */}
                          <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-1">
                            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                              <span>Vitesse: <strong className="text-slate-700">{incident.speed} km/h</strong></span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Button asChild size="sm" variant="outline" className="h-7 px-2.5 rounded-xl text-[10px] font-black border-slate-200 hover:bg-slate-50">
                                <Link href="/verifier-trafic">Vérifier</Link>
                              </Button>
                              <Button asChild size="sm" className="h-7 px-2.5 rounded-xl text-[10px] font-black bg-primary hover:bg-primary/90 text-white gap-1 shadow-sm">
                                <Link href="/k-flow-nav">
                                  <Navigation className="h-3 w-3" />
                                  <span>GPS</span>
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 space-y-3 bg-white rounded-3xl border border-dashed border-slate-200">
                <AlertCircle className="h-10 w-10 text-slate-300 mx-auto" />
                <p className="text-slate-500 font-bold text-sm">Aucun axe ne correspond à vos filtres actuels.</p>
                <Button size="sm" variant="outline" onClick={() => { setSelectedFilter('all'); setSearchQuery(''); }}>
                  Réinitialiser les filtres
                </Button>
              </div>
            )}
          </div>

          {/* 5. Assistant IA Floating Helper Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-3xl p-6 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-white/10 p-3 rounded-2xl shrink-0">
                <Bot className="h-7 w-7 text-white animate-bounce" />
              </div>
              <div>
                <h4 className="font-black text-base tracking-tight">Un doute sur votre itinéraire aujourd'hui ?</h4>
                <p className="text-xs text-white/70 font-medium">Demandez à notre Assistant IA en Lingala ou en Français le meilleur chemin.</p>
              </div>
            </div>
            <Button asChild className="bg-primary hover:bg-primary/90 text-white font-black rounded-2xl h-11 px-6 shrink-0 shadow-lg shadow-primary/30">
              <Link href="/assistant">Lancer le Copilote IA</Link>
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}