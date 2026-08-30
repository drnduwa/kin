'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Zap, 
  RefreshCw, 
  Bot, 
  Navigation, 
  Loader2, 
  Sparkles, 
  Flame,
  Lightbulb,
  Clock,
  CornerDownRight,
  Timer
} from 'lucide-react';
import { motion } from "framer-motion";
import { getGoogleTrafficStatusAction, getStrategicInsightsAction } from '@/app/actions';
import { MAJOR_AXES } from '@/lib/constants';
import { StrategicInsightsOutput } from '@/lib/types';
import { useFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

// Pre-defined secret detours tested by Kinshasa drivers
const DETOUR_ROUTES = [
  {
    id: 'gombe-ngaliema',
    title: 'Gombe (Centre) ➔ Ngaliema / UPN (Ouest)',
    congestedAxe: 'Boulevard du 30 Juin & Av. Mondjiba (Kintambo Magasin)',
    smartDetour: 'Passer par l\'Avenue du Livre (Bandal) ➔ Avenue Moulaert ➔ Avenue de la Montagne.',
    timeSaved: '20 à 25 min',
    severity: 'Évitement Recommandé'
  },
  {
    id: 'gombe-limete',
    title: 'Gombe (Centre) ➔ Limete / Masina (Est)',
    congestedAxe: 'Boulevard Lumumba (Échangeur de Limete saturé)',
    smartDetour: 'Prendre l\'Avenue des Poids Lourds ➔ Kingabwa ➔ Petit Boulevard de Limete (7e Rue).',
    timeSaved: '25 à 30 min',
    severity: 'Très Rentable'
  },
  {
    id: 'ouest-sud',
    title: 'Ngaliema / Kintambo ➔ Lemba & Université (Sud)',
    congestedAxe: 'Rond-Point Ngaba & By-Pass',
    smartDetour: 'Emprunter la nouvelle Avenue Elengesa reliant directement Makala au Pont Gabu et à Kalamu.',
    timeSaved: '30 min',
    severity: 'Raccourci Majeur'
  },
  {
    id: 'ndjili-centre',
    title: 'Aéroport N\'djili ➔ Centre-ville (Gombe)',
    congestedAxe: 'Masina Pascal & Marché de la Liberté',
    smartDetour: 'Prendre l\'Avenue Ndjoku vers Kingabwa puis Poids Lourds dès la sortie de l\'Échangeur.',
    timeSaved: '35 min',
    severity: 'Indispensable'
  },
  {
    id: 'victoire-bandal',
    title: 'Victoire / Kalamu ➔ Bandalungwa',
    congestedAxe: 'Avenue Kasa-Vubu (Carrefour Victoire)',
    smartDetour: 'Passer par l\'Avenue de l\'Enseignement ➔ Avenue Inga / Pierre Mulele.',
    timeSaved: '15 min',
    severity: 'Gain Fluide'
  }
];

const TIME_SLOTS = [
  {
    period: 'Matin (06h30 - 09h00)',
    status: 'HEURE DE POINTE',
    color: 'text-red-600 bg-red-50 border-red-200',
    advice: 'Sens Ouest/Est vers Gombe très saturé. Privilégiez un départ avant 06h45 ou après 09h15.'
  },
  {
    period: 'Midi (11h30 - 14h00)',
    status: 'TRAFIC MODÉRÉ',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    advice: 'Créneau idéal pour traverser la ville. Les grands boulevards roulent à vitesse normale.'
  },
  {
    period: 'Soir (16h30 - 20h30)',
    status: 'HEURE CRITIQUE',
    color: 'text-red-600 bg-red-50 border-red-200',
    advice: 'Sortie de Gombe vers Limete, Masina et Ngaliema bloquée. Utilisez nos raccourcis IA.'
  },
  {
    period: 'Nuit (Après 21h00)',
    status: 'FLUIDE',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    advice: 'Circulation très fluide sur tous les axes majeurs de Kinshasa.'
  }
];

export default function StrategicInsights() {
  const [insights, setInsights] = useState<StrategicInsightsOutput | null>(null);
  const [selectedDetour, setSelectedDetour] = useState<string>(DETOUR_ROUTES[0].id);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { firestore, user } = useFirebase();
  const { toast } = useToast();

  const performAnalysis = useCallback(async (isSilent = false) => {
    setIsRefreshing(true);

    try {
      const data = await getGoogleTrafficStatusAction(MAJOR_AXES);

      const aiResults = await getStrategicInsightsAction({
        axes: data.map(d => ({
          road: d.road,
          status: d.status,
          delay: d.delay,
          speed: d.speed
        }))
      });
      setInsights(aiResults);

      if (user) {
        await addDoc(collection(firestore, 'traffic_insights'), {
          userId: user.uid,
          timestamp: serverTimestamp(),
          globalStatus: aiResults.globalAdvice,
          recommendations: aiResults.tips,
          criticalAxes: data.filter(d => d.status === 'EMBOUTEILLAGE').map(d => d.road)
        });
      }

      if (!isSilent) toast({ title: "Stratégies actualisées" });
    } catch (error) {
      console.error(error);
      if (!isSilent) toast({ title: "Conseils locaux chargés", description: "Utilisation des stratégies de secours." });
    } finally {
      setIsRefreshing(false);
    }
  }, [firestore, user, toast]);

  useEffect(() => {
    performAnalysis(true);
  }, [performAnalysis]);

  const activeDetour = useMemo(() => {
    return DETOUR_ROUTES.find(d => d.id === selectedDetour) || DETOUR_ROUTES[0];
  }, [selectedDetour]);

  // Fallback tips tailored for Kinshasa drivers
  const currentTips = useMemo(() => {
    if (insights && insights.tips && insights.tips.length > 0) {
      return insights.tips;
    }
    return [
      "Évitez l'Échangeur de Limete aux heures de pointe en empruntant l'Avenue des Poids Lourds.",
      "Pour rejoindre UPN depuis Gombe, contournez le bouchon de Kintambo Magasin via Bandal Moulaert.",
      "L'Avenue Elengesa est la meilleure alternative pour relier Makala, Kalamu et le rond-point Ngaba.",
      "Surveillez les sorties d'écoles à Gombe vers 12h30 et 15h30 pour éviter les ralentissements."
    ];
  }, [insights]);

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-slate-50 overflow-hidden rounded-2xl md:rounded-3xl border border-slate-100">
      
      {/* ── Top Header Bar ── */}
      <div className="bg-white border-b shadow-sm z-30 p-3.5 sm:p-4 md:p-5 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-white p-2.5 rounded-2xl shadow-md shadow-amber-500/20 shrink-0">
              <Lightbulb className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Guide Anti-Bouchons</h1>
                <Badge className="bg-amber-500 text-white font-black text-[9px] uppercase px-1.5 py-0 border-none">
                  MALIN & IA
                </Badge>
              </div>
              <p className="text-[10px] md:text-xs font-medium text-slate-500">
                Raccourcis secrets, déviations et stratégies d'évitement en temps réel à Kinshasa
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => performAnalysis(false)} 
              disabled={isRefreshing} 
              className="rounded-xl h-10 border-2 font-bold px-3 text-xs bg-white hover:bg-slate-50 gap-1.5"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 text-amber-600" />}
              <span>Actualiser</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="p-3 sm:p-4 md:p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-12">

          {/* 1. Hero Banner : Générateur de Raccourcis de Kinshasa */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-xl relative overflow-hidden border border-slate-800">
            <div className="relative z-10 space-y-5">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <Badge className="bg-amber-500 text-slate-950 font-black text-[9px] uppercase px-2 py-0.5 border-none mb-1.5">
                    DÉVIATIONS & GAIN DE TEMPS
                  </Badge>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                    Sélectionnez un trajet pour voir le raccourci conseillé
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-300 self-start sm:self-auto">
                  <Sparkles className="h-4 w-4" />
                  <span>Jusqu'à -35 min économisées</span>
                </div>
              </div>

              {/* Corridor Selection Pills */}
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {DETOUR_ROUTES.map((route) => {
                  const isSelected = selectedDetour === route.id;
                  return (
                    <button
                      key={route.id}
                      onClick={() => setSelectedDetour(route.id)}
                      className={cn(
                        "px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all shrink-0",
                        isSelected
                          ? "bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/30 scale-105"
                          : "bg-white/10 text-white/80 hover:bg-white/20 border border-white/10"
                      )}
                    >
                      {route.title}
                    </button>
                  );
                })}
              </div>

              {/* Selected Detour Details Card */}
              <motion.div 
                key={activeDetour.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/10 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/15 space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Left: The Congested Problem */}
                  <div className="bg-red-500/15 border border-red-500/30 rounded-xl p-3.5 space-y-1">
                    <p className="text-[10px] font-black uppercase text-red-300 tracking-wider flex items-center gap-1.5">
                      <Flame className="h-3.5 w-3.5 text-red-400" /> Axe saturé à éviter
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-white leading-snug">
                      {activeDetour.congestedAxe}
                    </p>
                  </div>

                  {/* Right: The Smart Solution */}
                  <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-3.5 space-y-1">
                    <p className="text-[10px] font-black uppercase text-emerald-300 tracking-wider flex items-center gap-1.5">
                      <CornerDownRight className="h-3.5 w-3.5 text-emerald-400" /> Raccourci Malin conseillé
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-white leading-snug">
                      {activeDetour.smartDetour}
                    </p>
                  </div>

                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/10 pt-3">
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-amber-300" />
                    <span className="text-xs text-white/80 font-medium">Gain estimé :</span>
                    <strong className="text-sm font-black text-amber-300">{activeDetour.timeSaved}</strong>
                  </div>

                  <Button asChild className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl h-10 px-5 shadow-lg shadow-amber-500/20 gap-2">
                    <Link href="/k-flow-nav">
                      <Navigation className="h-4 w-4 fill-current" />
                      <span>Lancer le GPS sur ce raccourci</span>
                    </Link>
                  </Button>
                </div>
              </motion.div>

            </div>
          </div>

          {/* 2. Real-Time Smart Tips from AI & Drivers */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Conseils & Stratégies du Moment
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentTips.map((tip, idx) => (
                <div key={idx} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-start gap-3 hover:shadow-md transition-all">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-slate-800 leading-relaxed">
                      {tip}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Horloge des Heures de Pointe (Quand partir ?) */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Guide des Meilleurs Horaires à Kinshasa
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {TIME_SLOTS.map((slot, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-xs font-black text-slate-900">{slot.period}</span>
                      <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border", slot.color)}>
                        {slot.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                      {slot.advice}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Assistant IA Floating Helper */}
          <div className="bg-gradient-to-r from-primary to-blue-600 rounded-3xl p-5 sm:p-6 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="bg-white/20 p-3 rounded-2xl shrink-0">
                <Bot className="h-7 w-7 text-white" />
              </div>
              <div>
                <h4 className="font-black text-base tracking-tight">Vous avez un trajet spécifique à faire ?</h4>
                <p className="text-xs text-white/80 font-medium">Demandez à l'Assistant IA le meilleur raccourci actuel pour votre adresse exacte.</p>
              </div>
            </div>
            <Button asChild className="bg-white hover:bg-slate-100 text-primary font-black rounded-2xl h-11 px-6 shrink-0 shadow-lg">
              <Link href="/assistant">Demander à l'IA</Link>
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
