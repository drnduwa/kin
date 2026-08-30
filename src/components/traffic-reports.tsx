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
  Bot
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
  coords?: { lat: number, lng: number };
}

export default function TrafficReports() {
  const [navIncidents, setNavIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
          description: res.status === "FLUIDE" ? "Circulation fluide" : `Retard estimé de ${res.delay} min`,
          district: axis.district,
          status: res.status as TrafficStatus,
          speed: res.speed,
          delay: res.delay,
          updatedAt: "GPS Live",
          source: 'gps',
          coords: axis.origin
        };
      });

      setNavIncidents(analyzedAxes);
    } catch (err) {
      console.error("Traffic API Error:", err);
      toast({ title: "Erreur API", description: "Impossible de scanner les 100 axes.", variant: "destructive" });
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
        district: "Citoyen",
        status: rep.severity === 'high' ? 'EMBOUTEILLAGE' : rep.severity === 'medium' ? 'DENSE' : 'MODÉRÉ',
        speed: 0, delay: 5, updatedAt: "Communauté", source: 'user'
    }));
    return [...formattedUserReports, ...navIncidents].sort((a, b) => b.delay - a.delay);
  }, [navIncidents, userReports]);

  const filteredIncidents = useMemo(() => {
    if (!searchQuery.trim()) return allIncidents;
    const q = searchQuery.toLowerCase();
    return allIncidents.filter(i => 
        i.road.toLowerCase().includes(q) || 
        i.district.toLowerCase().includes(q) || 
        i.description.toLowerCase().includes(q)
    );
  }, [allIncidents, searchQuery]);

  const stats = useMemo(() => {
    const total = navIncidents.length || 1;
    const congested = navIncidents.filter(i => i.status === 'EMBOUTEILLAGE' || i.status === 'DENSE').length;
    return {
        saturation: Math.round((congested / total) * 100),
        blockedCount: navIncidents.filter(i => i.status === 'EMBOUTEILLAGE').length,
        denseCount: navIncidents.filter(i => i.status === 'DENSE').length,
        fluideCount: navIncidents.filter(i => i.status === 'FLUIDE').length,
        topHotspots: allIncidents.slice(0, 5)
    };
  }, [navIncidents, allIncidents]);

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full w-full bg-slate-50/50 overflow-hidden rounded-2xl md:rounded-3xl border border-slate-100/80">
      
      <div className="bg-white border-b shadow-sm z-30 p-3.5 sm:p-4 md:p-6 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-2xl">
                    <Activity className="text-primary h-6 w-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Rapports 100 Axes</h1>
                    <div className="flex items-center gap-2 mt-0.5">
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px] font-black uppercase tracking-widest" variant="outline">SCAN TEMPS RÉEL</Badge>
                        {lastUpdated && <span className="text-[10px] font-bold text-slate-400">MàJ: {format(lastUpdated, 'HH:mm:ss')}</span>}
                    </div>
                </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
                <Button asChild className="rounded-xl h-11 bg-primary hover:bg-primary/90 text-white shadow-lg font-black uppercase tracking-widest text-[10px] px-6">
                    <Link href="/signaler-embouteillage">
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Signaler
                    </Link>
                </Button>
                <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-xl border border-amber-100 shadow-inner">
                    <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                    <span className="text-sm font-black text-amber-700">{profile?.currentStarsBalance || 0}</span>
                </div>
                <Button variant="outline" onClick={() => fetchTrafficData(true)} disabled={isRefreshing} className="rounded-xl h-11 border-2 font-bold px-4">
                    {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Actualiser
                </Button>
            </div>
        </div>
      </div>

      <div className="p-3 sm:p-4 md:p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-7xl mx-auto space-y-8 pb-20">
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saturation Ville</p>
                            <p className={cn("text-4xl font-black tracking-tighter", stats.saturation > 70 ? "text-red-600" : "text-emerald-500")}>
                                {stats.saturation}%
                            </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-2xl">
                            <Waves className="text-primary h-6 w-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Points Rouges</p>
                            <p className="text-4xl font-black text-slate-900 tracking-tighter">{stats.blockedCount}</p>
                        </div>
                        <div className="p-3 bg-red-50 rounded-2xl text-red-500">
                            <AlertCircle className="h-6 w-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Routes Fluides</p>
                            <p className="text-4xl font-black text-slate-900 tracking-tighter">{stats.fluideCount}</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-500">
                            <TrendingDown className="h-6 w-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-primary text-white">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Scan Total</p>
                            <p className="text-4xl font-black tracking-tighter">100</p>
                        </div>
                        <div className="p-3 bg-white/10 rounded-2xl">
                            <MapPin className="h-6 w-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-blue-400/20 rounded-2xl blur opacity-25 group-focus-within:opacity-100 transition duration-500"></div>
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                            <Input 
                                placeholder="Rechercher parmi les 100 axes (ex: Lumumba, Gombe, Bypass)..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-12 h-14 bg-white border-none shadow-sm rounded-2xl font-bold text-lg"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Séquençage des 100 axes...</p>
                            </div>
                        ) : filteredIncidents.length > 0 ? (
                            <div className="grid gap-4">
                                {filteredIncidents.map((incident) => (
                                    <motion.div 
                                        key={incident.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                    >
                                        <Card className="rounded-3xl border-none shadow-sm hover:shadow-lg transition-all overflow-hidden group bg-white">
                                            <div className="flex">
                                                <div className={cn(
                                                    "w-2 transition-all duration-500",
                                                    incident.status === 'EMBOUTEILLAGE' ? "bg-red-600" :
                                                    incident.status === 'DENSE' ? "bg-orange-500" :
                                                    incident.status === 'MODÉRÉ' ? "bg-amber-500" :
                                                    incident.status === 'FLUIDE' ? "bg-emerald-500" :
                                                    "bg-slate-300"
                                                )} />
                                                <CardContent className="p-5 flex-1 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-black text-lg text-slate-900 leading-tight">{incident.road}</h3>
                                                            {incident.source === 'gps' && <Badge className="bg-primary/5 text-primary border-none text-[8px] font-black">GPS</Badge>}
                                                        </div>
                                                        <p className="text-sm text-slate-500 font-medium">{incident.description}</p>
                                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                                            <Badge variant="outline" className="text-[9px] font-black uppercase text-primary/70 py-0 border-primary/20">{incident.district}</Badge>
                                                            <Badge className={cn(
                                                                "text-[9px] font-black uppercase py-0",
                                                                incident.status === 'EMBOUTEILLAGE' ? "bg-red-100 text-red-700" :
                                                                incident.status === 'DENSE' ? "bg-orange-100 text-orange-700" :
                                                                incident.status === 'MODÉRÉ' ? "bg-amber-100 text-amber-700" :
                                                                incident.status === 'FLUIDE' ? "bg-emerald-100 text-emerald-700" :
                                                                "bg-slate-100 text-slate-700"
                                                            )}>
                                                                {incident.status}
                                                            </Badge>
                                                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                                <Clock className="h-3 w-3" /> {incident.updatedAt}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-6 shrink-0 border-l border-slate-50 pl-6 md:pl-8">
                                                        <div className="text-center">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Vitesse</p>
                                                            <p className="font-black text-slate-800 text-xl">
                                                                {incident.source === 'gps' ? incident.speed : '--'}
                                                                <span className="text-[10px] ml-0.5">km/h</span>
                                                            </p>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Retard</p>
                                                            <p className={cn(
                                                                "font-black text-xl",
                                                                incident.delay > 10 ? "text-red-600" : incident.delay > 5 ? "text-orange-500" : "text-emerald-600"
                                                            )}>{incident.delay > 0 ? `+${incident.delay}` : '--'}<span className="text-[10px] ml-0.5">min</span></p>
                                                        </div>
                                                        <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/5 text-primary" asChild>
                                                            <Link href="/k-flow-nav"><ArrowUpRight className="h-5 w-5" /></Link>
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </div>
                                        </Card>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20 space-y-4 bg-white rounded-[3rem] border-2 border-dashed">
                                <AlertCircle className="h-12 w-12 text-slate-200 mx-auto" />
                                <p className="text-slate-400 font-bold">Aucun rapport trouvé pour votre recherche.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <Card className="border-none shadow-sm rounded-[2rem] bg-white overflow-hidden">
                        <CardHeader className="bg-slate-900 text-white p-6">
                            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                <Activity className="h-4 w-4 text-primary" />
                                Top Hotspots (Points Chauds)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {stats.topHotspots.map((item, i) => (
                                <div key={i} className="p-4 border-b last:border-0 hover:bg-slate-50 transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="font-bold text-sm text-slate-800 leading-tight">{item.road}</p>
                                        <span className="text-xs font-black text-red-600">+{item.delay}m</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="text-[8px] font-black py-0 px-1.5 uppercase">{item.district}</Badge>
                                        <p className="text-[10px] font-bold text-slate-400">{item.status}</p>
                                    </div>
                                </div>
                            ))}
                            {stats.topHotspots.length === 0 && <div className="p-8 text-center text-xs italic text-slate-400">Aucun blocage critique détecté.</div>}
                        </CardContent>
                    </Card>

                    <div className="p-8 bg-primary rounded-[2.5rem] text-white shadow-2xl shadow-primary/30 relative overflow-hidden group cursor-pointer">
                        <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform"></div>
                        <Bot className="h-10 w-10 mb-6 text-white opacity-20" />
                        <h4 className="text-xl font-black uppercase tracking-tight mb-3">Besoin d'un itinéraire alternatif ?</h4>
                        <p className="text-sm font-bold text-primary-foreground/80 leading-relaxed mb-6">
                            L'IA K-Flow analyse les 100 axes pour vous proposer le chemin le plus rapide vers votre destination.
                        </p>
                        <Button className="w-full bg-white text-primary hover:bg-slate-100 font-black rounded-2xl h-12 shadow-xl" asChild>
                            <Link href="/assistant">Lancer l'Assistant</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}