'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  AlertCircle, 
  Construction, 
  TrafficCone, 
  RefreshCw, 
  Database,
  ShieldAlert,
  HardHat,
  History,
  TrendingUp,
  BrainCircuit,
  CheckCircle2,
  Zap
} from "lucide-react";
import { useFirebase, errorEmitter } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getGoogleTrafficStatusAction, getForecastAccuracyAction } from '@/app/actions';
import { MAJOR_AXES } from '@/lib/constants';
import { FirestorePermissionError } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Ces listes sont désormais vides, prêtes à recevoir des données réelles
const officialRoadWorks: any[] = [];
const bridgeStatus: any[] = [];

export default function RoutesStats() {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [accuracy, setAccuracy] = useState<Awaited<ReturnType<typeof getForecastAccuracyAction>> | null>(null);
  useEffect(() => { getForecastAccuracyAction().then(setAccuracy).catch(() => {}); }, []);
  const h1 = accuracy?.horizons.find(h => h.horizonMin === 60);
  const accuracyValue = accuracy?.ready && h1?.hitPct != null ? `${h1.hitPct} %` : '--';
  const accuracySub = accuracy?.ready && h1?.hitPct != null
    ? `Bon niveau à +1 h (${h1.checked} vérif.)`
    : accuracy ? `En apprentissage · ${accuracy.days}/7 j` : "Précision des prévisions";

  const handleArchiveState = async () => {
    setIsUpdating(true);
    try {
        const trafficData = await getGoogleTrafficStatusAction(MAJOR_AXES);
        
        const totalSaturation = trafficData.reduce((acc, curr) => {
            const val = curr.status === "EMBOUTEILLAGE" ? 100 : curr.status === "DENSE" ? 75 : curr.status === "MODÉRÉ" ? 40 : 10;
            return acc + val;
        }, 0) / trafficData.length;

        const reportData = {
            timestamp: serverTimestamp(),
            globalSaturation: Math.round(totalSaturation),
            axisStats: trafficData.map((d) => ({
                road: d.road,
                status: d.status,
                speed: d.speed,
                delay: d.delay,
            }))
        };

        const colRef = collection(firestore, "daily_traffic_reports");
        await addDoc(colRef, reportData).catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: colRef.path,
                operation: 'create',
                requestResourceData: reportData,
            });
            errorEmitter.emit('permission-error', permissionError);
        });

        toast({ 
            title: "Archive Routière Enregistrée", 
            description: "L'état des axes a été sauvegardé pour l'analyse prédictive.",
            variant: "default"
        });
    } catch (e: any) {
        toast({ title: "Erreur de mise à jour", description: e.message, variant: "destructive" });
    } finally {
        setIsUpdating(false);
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-50/50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8 pb-20">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <Construction className="text-primary h-8 w-8" />
              Observatoire des Routes
            </h1>
            <p className="text-muted-foreground font-medium italic">Registre et archivage de l'infrastructure kinoise.</p>
          </div>
          <Button 
            onClick={handleArchiveState} 
            disabled={isUpdating}
            className="rounded-xl h-12 px-6 font-black shadow-lg shadow-primary/20 gap-2"
          >
            {isUpdating ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Database className="h-5 w-5" />}
            Mettre à jour & Archiver
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard title="Chantiers Actifs" value={officialRoadWorks.length.toString()} sub="Travaux en cours" icon={HardHat} color="text-primary" bg="bg-primary/5" />
          <MetricCard title="Nids-de-poule" value="0" sub="Signalés ce mois" icon={AlertCircle} color="text-red-500" bg="bg-red-50" />
          <MetricCard title="Ponts Critiques" value="0" sub="Vigilance accrue" icon={ShieldAlert} color="text-orange-500" bg="bg-orange-50" />
          <MetricCard title="Prévisions justes" value={accuracyValue} sub={accuracySub} icon={BrainCircuit} color="text-emerald-600" bg="bg-emerald-50" />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-8">
            <Card className="border-none shadow-sm rounded-[2rem] bg-white overflow-hidden">
              <CardHeader className="bg-slate-900 text-white p-8">
                <CardTitle className="text-xl font-black flex items-center gap-3">
                  <Construction className="text-primary h-6 w-6" />
                  Chantiers de Modernisation
                </CardTitle>
                <CardDescription className="text-slate-400">Suivi des travaux de l'Hôtel de Ville de Kinshasa.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                {officialRoadWorks.length > 0 ? officialRoadWorks.map(work => (
                  <div key={work.id} className="space-y-3 group cursor-default">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-lg font-black text-slate-800 group-hover:text-primary transition-colors">{work.name}</p>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{work.location}</p>
                      </div>
                      <Badge variant="secondary" className="bg-primary/10 text-primary font-black">{work.progress}%</Badge>
                    </div>
                    <Progress value={work.progress} className="h-2 bg-slate-100" />
                    <p className="text-sm font-medium text-slate-500 italic">{work.status}</p>
                  </div>
                )) : (
                    <div className="py-20 text-center border-2 border-dashed rounded-3xl">
                        <p className="text-muted-foreground font-bold">Aucun chantier signalé pour le moment.</p>
                    </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm rounded-[2rem] bg-emerald-900 text-white relative overflow-hidden group">
                <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-emerald-400/20 rounded-full blur-[80px]"></div>
                <CardHeader className="relative z-10 p-8">
                    <CardTitle className="flex items-center gap-3 font-black text-2xl">
                        <BrainCircuit className="h-8 w-8 text-emerald-400" />
                        Capacité Prédictive
                    </CardTitle>
                </CardHeader>
                <CardContent className="relative z-10 p-8 pt-0 space-y-6">
                    <p className="text-emerald-100 font-medium leading-relaxed">
                        Chaque audit alimente notre base de données temporelle. L'IA de Kinshasa Flow utilise ces captures quotidiennes pour identifier les goulots d'étranglement récurrents.
                    </p>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="p-4 bg-white/10 rounded-2xl border border-white/10 flex items-center gap-4">
                            <History className="h-6 w-6 text-emerald-400" />
                            <div>
                                <p className="text-xs font-black uppercase">Apprentissage</p>
                                <p className="text-xl font-black">Audit Actif</p>
                            </div>
                        </div>
                        <div className="p-4 bg-white/10 rounded-2xl border border-white/10 flex items-center gap-4">
                            <TrendingUp className="h-6 w-6 text-emerald-400" />
                            <div>
                                <p className="text-xs font-black uppercase">Précision à +1 h</p>
                                <p className="text-xl font-black">{accuracyValue === '--' ? 'En apprentissage' : accuracyValue}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
          </div>

          <div className="space-y-8">
            <Card className="border-none shadow-sm rounded-[2rem] bg-white overflow-hidden">
              <CardHeader className="p-6 border-b border-slate-50">
                <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-400">
                  <TrafficCone className="h-4 w-4" />
                  État des Ouvrages (Ponts)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {bridgeStatus.length > 0 ? bridgeStatus.map((bridge, idx) => (
                  <div key={idx} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between group hover:bg-white hover:shadow-md transition-all">
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{bridge.name}</p>
                      <p className="text-[10px] font-bold text-slate-500 leading-none">{bridge.status}</p>
                    </div>
                    <div className={cn("h-3 w-3 rounded-full shadow-lg ring-4 ring-white", bridge.color)} />
                  </div>
                )) : (
                    <p className="text-center text-xs text-muted-foreground italic">Aucun audit spécifique aux ponts.</p>
                )}
              </CardContent>
            </Card>

            <div className="p-8 bg-primary rounded-[2rem] text-white shadow-2xl shadow-primary/30 relative overflow-hidden group">
                <p className="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-4">Statistique Infrastructure</p>
                <div className="space-y-1">
                    <p className="text-5xl font-black tracking-tighter">1,240</p>
                    <p className="text-sm font-bold">Kilomètres de voirie sous surveillance</p>
                </div>
                <div className="pt-4">
                    <Progress value={10} className="h-2 bg-white/20" />
                    <p className="text-[9px] font-bold mt-2 opacity-60 uppercase">Chargement des données structurelles...</p>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, sub, icon: Icon, color, bg }: { title: string, value: string, sub: string, icon: any, color: string, bg: string }) {
  return (
    <Card className="border-none shadow-sm rounded-[2rem] bg-white group hover:shadow-xl transition-all">
      <CardContent className="p-6 flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
          <p className={cn("text-3xl font-black", color)}>{value}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{sub}</p>
        </div>
        <div className={cn("p-4 rounded-2xl shadow-lg transition-transform group-hover:scale-110", bg)}>
          <Icon className={cn("h-6 w-6", color)} />
        </div>
      </CardContent>
    </Card>
  );
}
