import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  HelpCircle, 
  TrafficCone, 
  Navigation, 
  MessagesSquare, 
  Camera, 
  Radar,
  Star, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight,
  ShieldCheck,
  Compass,
  Lightbulb,
  PhoneCall,
  Volume2
} from 'lucide-react';
import Link from 'next/link';

export default function GuidePage() {
  return (
    <AppShell>
      <div className="w-full h-full overflow-y-auto bg-slate-50/50 p-4 sm:p-6 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6 pb-24">
          
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
            <div className="relative z-10 space-y-2">
              <Badge className="bg-amber-500 text-slate-950 font-black text-xs px-3 py-1 uppercase tracking-wider border-none">
                GUIDE OFFICIEL & AIDE
              </Badge>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                Comment fonctionne Kinshasa Flow ?
              </h1>
              <p className="text-slate-300 text-sm max-w-xl font-medium">
                Découvrez toutes les astuces pour contourner les bouchons, naviguer avec le GPS local et gagner du temps à Kinshasa.
              </p>
            </div>
          </div>

          {/* Special Feature Highlight : Radar Sentinelle 1 km */}
          <Card className="rounded-3xl border-2 border-amber-500/50 bg-gradient-to-br from-slate-950 to-slate-900 text-white p-6 sm:p-8 shadow-xl space-y-4 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-red-500 text-white flex items-center justify-center font-black shadow-lg shadow-red-500/30 shrink-0">
                  <Radar className="h-6 w-6 animate-spin" style={{ animationDuration: '8s' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-amber-500 text-slate-950 font-black text-[9px] uppercase px-2 py-0 border-none">
                      NOUVEAU • EXCLUSIVITÉ
                    </Badge>
                    <span className="text-xs text-amber-300 font-bold">Copilote Proactif</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    Radar Sentinelle : Alerte 1 km avant le Bouchon
                  </h2>
                </div>
              </div>

              <Button asChild className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl h-10 px-5 text-xs shadow-lg shadow-amber-500/20 shrink-0">
                <Link href="/insights">Voir les Raccourcis IA</Link>
              </Button>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed">
              Gardez simplement Kinshasa Flow ouvert sur votre tableau de bord. Dès que vous approchez à <strong>environ 1 km</strong> de l'un des 12 grands goulots d'étranglement de la ville (Échangeur de Limete, Kintambo Magasin, UPN, Rond-point Ngaba...) ou d'un incident récent, l'application déclenche <strong>un double bip sonore et une vibration</strong> pour vous suggérer un itinéraire bis avant d'être bloqué.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="bg-white/10 rounded-2xl p-3 border border-white/10 text-xs space-y-1">
                <span className="text-amber-400 font-black text-xs flex items-center gap-1.5">
                  <Radar className="h-4 w-4" /> 1. Détection GPS
                </span>
                <p className="text-[11px] text-slate-300 font-medium">Surveille votre progression en temps réel.</p>
              </div>

              <div className="bg-white/10 rounded-2xl p-3 border border-white/10 text-xs space-y-1">
                <span className="text-amber-400 font-black text-xs flex items-center gap-1.5">
                  <Volume2 className="h-4 w-4" /> 2. Signal Sonore & Haptique
                </span>
                <p className="text-[11px] text-slate-300 font-medium">Double bip audio instantané 1 km avant.</p>
              </div>

              <div className="bg-white/10 rounded-2xl p-3 border border-white/10 text-xs space-y-1">
                <span className="text-amber-400 font-black text-xs flex items-center gap-1.5">
                  <Compass className="h-4 w-4" /> 3. Raccourci 1-Clic
                </span>
                <p className="text-[11px] text-slate-300 font-medium">Prenez la déviation sans perdre de temps.</p>
              </div>
            </div>
          </Card>

          {/* 4 Pillars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 1 */}
            <Card className="rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-3 bg-white hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black">
                <TrafficCone className="h-6 w-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">1. Vérifier le Trafic avant de partir</h3>
              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                Consultez en temps réel l'état des boulevards et carrefours. Si un axe est saturé, une alerte préventive apparaît automatiquement.
              </p>
              <Button asChild size="sm" className="rounded-xl h-9 font-black text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 gap-1.5">
                <Link href="/verifier-trafic">
                  <span>Tester Vérifier Trafic</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </Card>

            {/* 2 */}
            <Card className="rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-3 bg-white hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center font-black">
                <Navigation className="h-6 w-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">2. K-Flow Nav & Raccourcis Secrets</h3>
              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                Notre GPS calcule les déviations par les quartiers pour vous éviter les grands bouchons comme Kintambo Magasin ou l'Échangeur.
              </p>
              <Button asChild size="sm" className="rounded-xl h-9 font-black text-xs bg-primary hover:bg-primary/90 text-white gap-1.5">
                <Link href="/k-flow-nav">
                  <span>Lancer K-Flow Nav</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </Card>

            {/* 3 */}
            <Card className="rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-3 bg-white hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black">
                <MessagesSquare className="h-6 w-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">3. Chat Communautaire en Direct</h3>
              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                Posez vos questions à la communauté kinoise pour savoir si une rue est praticable ou inondée après la pluie.
              </p>
              <Button asChild size="sm" className="rounded-xl h-9 font-black text-xs bg-blue-600 hover:bg-blue-500 text-white gap-1.5">
                <Link href="/community-chat">
                  <span>Rejoindre le Chat</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </Card>

            {/* 4 */}
            <Card className="rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-3 bg-white hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black">
                <Camera className="h-6 w-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">4. Signaler en 1 Clic & Gagner des Stars</h3>
              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                Prenez une photo d'un incident en 1 clic pour prévenir la ville et recevez immédiatement +10 Stars ⭐ sur votre compte.
              </p>
              <Button asChild size="sm" className="rounded-xl h-9 font-black text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5">
                <Link href="/signaler-embouteillage">
                  <span>Signaler (+10 ⭐)</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </Card>

          </div>

        </div>
      </div>
    </AppShell>
  );
}
