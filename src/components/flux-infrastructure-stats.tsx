'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { 
  Construction,
  RefreshCw,
  Search,
  AlertTriangle,
  MapPin,
  CheckCircle2,
  Clock,
  Camera,
  Navigation,
  Waves,
  Car,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Layers,
  Sparkles,
  PlusCircle,
  HelpCircle,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { EventReport } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';

// Major Active Roadwork Projects in Kinshasa
const MAJOR_PROJECTS = [
  {
    id: 'matadi-upn',
    title: 'Élargissement Route de Matadi (Binza Météo ➔ UPN)',
    district: 'Ngaliema',
    progress: 65,
    status: 'Travaux en cours',
    lanes: '1 voie par sens (Chaussée rétrécie)',
    impact: 'Fort ralentissement aux heures de pointe',
    advice: 'Prendre l\'Avenue de la Montagne ou passer tôt avant 07h00.',
    tag: 'Axe Ouest',
    tagColor: 'bg-amber-100 text-amber-800'
  },
  {
    id: 'universite-gabu',
    title: 'Réhabilitation Avenue de l\'Université & Pont Gabu',
    district: 'Kalamu / Lemba',
    progress: 80,
    status: 'Finition des berges & Asphalte',
    lanes: '2 voies praticables avec prudence',
    impact: 'Ralentissement modéré aux abords du pont',
    advice: 'Privilégier l\'Avenue Elengesa pour contourner le pont Gabu.',
    tag: 'Axe Centre-Sud',
    tagColor: 'bg-blue-100 text-blue-800'
  },
  {
    id: 'elengesa-neuf',
    title: 'Avenue Elengesa (Makala ➔ Ngaba / By-Pass)',
    district: 'Makala / Ngaba',
    progress: 100,
    status: 'Axe Neuf Ouvert',
    lanes: '2 voies fluides',
    impact: 'Circulation fluide, excellent délestage',
    advice: 'Meilleur itinéraire pour éviter le rond-point Ngaba et Victoire.',
    tag: 'Recommandé',
    tagColor: 'bg-emerald-100 text-emerald-800'
  },
  {
    id: 'poids-lourds',
    title: 'Avenue des Poids Lourds & Kingabwa',
    district: 'Limete',
    progress: 90,
    status: 'Entretien régulier & Éclairage',
    lanes: '2 voies praticables',
    impact: 'Trafic de poids lourds, fluide pour les berlines',
    advice: 'Idéal pour relier Gombe à Limete 7e Rue sans passer par Lumumba.',
    tag: 'Axe Industriel',
    tagColor: 'bg-purple-100 text-purple-800'
  }
];

// Strategic Bridges & Flyovers Status
const BRIDGES_AND_FLYOVERS = [
  { name: 'Saut-de-Mouton Mandela (Gombe)', status: 'FLUIDE', note: 'Circulation normale', delay: 0 },
  { name: 'Saut-de-Mouton Pompage (Ngaliema)', status: 'DENSE', note: 'Ralentissements vers DGC', delay: 10 },
  { name: 'Saut-de-Mouton Socimat (Gombe)', status: 'FLUIDE', note: 'Passage fluide', delay: 0 },
  { name: 'Échangeur de Limete (Nœud Est)', status: 'EMBOUTEILLAGE', note: 'Bouchon aux bretelles vers N\'djili', delay: 20 },
  { name: 'Pont Matete (Axe Lumumba)', status: 'MODÉRÉ', note: 'Ralentissement aux abords du marché', delay: 8 },
  { name: 'Pont Gabu (Avenue Université)', status: 'MODÉRÉ', note: 'Travaux de nuit, passage ralenti', delay: 5 },
  { name: 'Pont Makelele (Kintambo / Bandal)', status: 'FLUIDE', note: 'Trafic normal', delay: 0 },
  { name: 'Pont Sendwe (Kalamu / Gombe)', status: 'FLUIDE', note: 'Axe ouvert et dégagé', delay: 0 },
];

// Typical Road Hazards in Kinshasa
const COMMON_HAZARDS = [
  {
    icon: Waves,
    title: 'Eaux & Inondations Pluviales',
    desc: 'Après la pluie, zones comme Carrefour Mososo, Debonhomme et Blvd Triomphal deviennent très lentes.',
    advice: 'Évitez les berlines basses par temps d\'orage.'
  },
  {
    icon: AlertTriangle,
    title: 'Nids-de-Poule & Chaussées Dégradées',
    desc: 'Les ralentissements soudains sont souvent provoqués par des trous forçant les voitures à rouler au pas.',
    advice: 'Gardez vos distances de sécurité.'
  },
  {
    icon: Construction,
    title: 'Chantiers & Engins de Travaux',
    desc: 'Travaux d\'assainissement et pose de collecteurs réduisant le nombre de voies disponibles.',
    advice: 'Consultez nos raccourcis sur le Guide Anti-Bouchons.'
  },
  {
    icon: Car,
    title: 'Marchés & Arrêts Anarchiques',
    desc: 'Les arrêts prolongés des taxis-bus (207) et les étals créent des goulots d\'étranglement.',
    advice: 'Anticipez les changements de voie.'
  }
];

export default function FluxInfrastructureStats() {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'chantiers' | 'ponts' | 'photos'>('chantiers');

  // Fetch real citizen photo reports
  const reportsQuery = useMemoFirebase(() => {
    return query(collection(firestore, "events"), orderBy("createdAt", "desc"), limit(20));
  }, [firestore]);
  
  const { data: userReports, isLoading: isReportsLoading } = useCollection<EventReport>(reportsQuery);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return MAJOR_PROJECTS;
    const q = searchQuery.toLowerCase();
    return MAJOR_PROJECTS.filter(p => 
      p.title.toLowerCase().includes(q) || 
      p.district.toLowerCase().includes(q) || 
      p.advice.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-slate-50 overflow-hidden rounded-2xl md:rounded-3xl border border-slate-100">
      
      {/* ── Top Header Bar ── */}
      <div className="bg-white border-b shadow-sm z-30 p-3.5 sm:p-4 md:p-5 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-white p-2.5 rounded-2xl shadow-md shadow-amber-500/20 shrink-0">
              <Construction className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Chantiers & Infrastructures</h1>
                <Badge className="bg-primary text-white font-black text-[9px] uppercase px-1.5 py-0 border-none">
                  OBSERVATOIRE KINSHASA
                </Badge>
              </div>
              <p className="text-[10px] md:text-xs font-medium text-slate-500">
                Suivi des grands travaux, sauts-de-mouton, ponts et état des chaussées dans la capitale
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button asChild size="sm" className="rounded-xl h-10 bg-primary hover:bg-primary/90 text-white font-black text-xs px-4 shadow-md shadow-primary/20 gap-1.5">
              <Link href="/signaler-embouteillage">
                <Camera className="h-4 w-4" />
                <span>Signaler un chantier (+10 ⭐)</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="p-3 sm:p-4 md:p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-12">

          {/* 1. Hero Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-5 shadow-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Grands Chantiers</span>
                <Construction className="h-5 w-5 text-amber-400" />
              </div>
              <p className="text-3xl font-black">{MAJOR_PROJECTS.length} Projets</p>
              <p className="text-xs text-slate-300 font-medium">en cours de modernisation urbaine</p>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Ponts & Échangeurs</span>
                <Car className="h-5 w-5 text-primary" />
              </div>
              <p className="text-3xl font-black text-slate-900">{BRIDGES_AND_FLYOVERS.length} Ouvrages</p>
              <p className="text-xs text-slate-500 font-medium">surveillés en continu par GPS et usagers</p>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Signalements Citoyens</span>
                <Camera className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="text-3xl font-black text-slate-900">{userReports?.length || 0} Photos</p>
              <p className="text-xs text-slate-500 font-medium">preuves réelles postées par les conducteurs</p>
            </div>
          </div>

          {/* 2. Interactive Section Switcher */}
          <div className="flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('chantiers')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black transition-all shrink-0",
                activeTab === 'chantiers'
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                  : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100"
              )}
            >
              <Construction className="h-4 w-4 text-amber-500" />
              <span>Chantiers & Travaux ({MAJOR_PROJECTS.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('ponts')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black transition-all shrink-0",
                activeTab === 'ponts'
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                  : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100"
              )}
            >
              <Car className="h-4 w-4 text-primary" />
              <span>Sauts-de-Mouton & Ponts ({BRIDGES_AND_FLYOVERS.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('photos')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black transition-all shrink-0",
                activeTab === 'photos'
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                  : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100"
              )}
            >
              <Camera className="h-4 w-4 text-emerald-500" />
              <span>Preuves Photos du Terrain ({userReports?.length || 0})</span>
            </button>
          </div>

          {/* TAB 1: Chantiers & Travaux */}
          {activeTab === 'chantiers' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Filtrer par projet ou commune (ex: Matadi, UPN, Elengesa, Limete)..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-11 h-12 bg-white border border-slate-200/80 shadow-sm rounded-2xl font-bold text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredProjects.map((p) => (
                  <Card key={p.id} className="rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all overflow-hidden bg-white">
                    <CardContent className="p-5 space-y-4">
                      
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={cn("text-[9px] font-black uppercase px-2 py-0 border-none", p.tagColor)}>
                              {p.tag}
                            </Badge>
                            <span className="text-[10px] font-bold text-slate-400">{p.district}</span>
                          </div>
                          <h3 className="text-base font-black text-slate-900 leading-snug">
                            {p.title}
                          </h3>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-base font-black text-amber-600">{p.progress}%</span>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Avancement</p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${p.progress}%` }} 
                        />
                      </div>

                      {/* Info Details */}
                      <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2 text-xs border border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-bold">État des voies :</span>
                          <span className="font-black text-slate-800">{p.lanes}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-bold">Impact trafic :</span>
                          <span className="font-black text-amber-700">{p.impact}</span>
                        </div>
                        <div className="border-t border-slate-200/60 pt-2 text-slate-600 font-medium">
                          💡 <strong>Conseil K-Flow :</strong> {p.advice}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button asChild size="sm" variant="outline" className="rounded-xl h-8 text-xs font-black border-slate-200">
                          <Link href="/insights">Voir déviations</Link>
                        </Button>
                        <Button asChild size="sm" className="rounded-xl h-8 text-xs font-black bg-primary text-white gap-1 shadow-sm">
                          <Link href="/k-flow-nav">
                            <Navigation className="h-3.5 w-3.5" />
                            <span>GPS</span>
                          </Link>
                        </Button>
                      </div>

                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: Sauts-de-Mouton & Ponts */}
          {activeTab === 'ponts' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {BRIDGES_AND_FLYOVERS.map((b, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2 flex flex-col justify-between hover:shadow-md transition-all">
                    <div>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <h4 className="text-xs font-black text-slate-900 leading-snug">{b.name}</h4>
                        <span className={cn(
                          "w-2.5 h-2.5 rounded-full shrink-0 mt-0.5",
                          b.status === 'FLUIDE' ? 'bg-emerald-500' :
                          b.status === 'MODÉRÉ' ? 'bg-amber-500' :
                          b.status === 'DENSE' ? 'bg-orange-500' : 'bg-red-500'
                        )} />
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium leading-tight">
                        {b.note}
                      </p>
                    </div>

                    <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                      <Badge className={cn(
                        "text-[8px] font-black uppercase border-none px-1.5 py-0",
                        b.status === 'FLUIDE' ? 'bg-emerald-100 text-emerald-700' :
                        b.status === 'MODÉRÉ' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      )}>
                        {b.status}
                      </Badge>
                      {b.delay > 0 ? (
                        <span className="text-[10px] font-black text-red-600">+{b.delay}m</span>
                      ) : (
                        <span className="text-[10px] font-black text-emerald-600">Fluide</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Photos et Preuves Terrain */}
          {activeTab === 'photos' && (
            <div className="space-y-4">
              {isReportsLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400 font-bold text-xs">
                  Chargement des photos citoyennes...
                </div>
              ) : userReports && userReports.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {userReports.map((r) => (
                    <Card key={r.id} className="rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden bg-white group hover:shadow-md transition-all">
                      {r.picture ? (
                        <div className="w-full h-44 bg-slate-100 relative overflow-hidden">
                          <img 
                            src={r.picture} 
                            alt={r.location} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                          />
                          <div className="absolute top-3 left-3">
                            <Badge className="bg-black/60 backdrop-blur-md text-white font-black text-[9px] uppercase border-none">
                              Preuve Photo
                            </Badge>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-28 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-400">
                          <Camera className="h-8 w-8 opacity-40" />
                        </div>
                      )}

                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-slate-900 truncate">{r.location}</p>
                          <Badge variant="outline" className="text-[8px] font-black uppercase text-primary border-primary/20">
                            {r.severity || 'Signalé'}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-600 font-medium line-clamp-2">
                          {r.description}
                        </p>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-bold">
                          <span>Par {r.user || 'Conducteur'}</span>
                          <span>{r.createdAt?.toDate ? format(r.createdAt.toDate(), 'dd MMM, HH:mm', { locale: fr }) : 'Récemment'}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 space-y-3 bg-white rounded-3xl border border-dashed border-slate-200">
                  <Camera className="h-10 w-10 text-slate-300 mx-auto" />
                  <p className="text-slate-500 font-bold text-sm">Aucune photo pour le moment.</p>
                  <Button asChild size="sm" className="bg-primary text-white font-black rounded-xl">
                    <Link href="/signaler-embouteillage">Soyez le premier à ajouter une photo</Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 3. Illustrated Guide : Causes of Congestion in Kinshasa */}
          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" /> Comprendre les Causes des Bouchons à Kinshasa
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {COMMON_HAZARDS.map((h, i) => {
                const Icon = h.icon;
                return (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 mb-1">{h.title}</h4>
                      <p className="text-[11px] text-slate-500 font-medium leading-snug mb-2">{h.desc}</p>
                      <p className="text-[10px] text-amber-700 font-bold bg-amber-50 rounded-lg p-1.5">
                        💡 {h.advice}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
