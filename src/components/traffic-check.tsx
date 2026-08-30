'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Map, useMap, useMapsLibrary, Marker } from '@vis.gl/react-google-maps';
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
  MessageCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { checkTrafficAction, getTrafficForecastAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { CONFIG } from '@/lib/config';
import { MAJOR_AXES } from '@/lib/constants';

const STATUS_CONFIG = {
  BLOQUÉ: { color: "bg-purple-600", icon: "🔴", label: "Bloqué" },
  EMBOUTEILLAGE: { color: "bg-red-600", icon: "🔴", label: "Embouteillé" },
  MODÉRÉ: { color: "bg-amber-500", icon: "🟡", label: "Modéré" },
  FLUIDE: { color: "bg-emerald-500", icon: "🟢", label: "Fluide" },
  INCONNU: { color: "bg-slate-400", icon: "⚪", label: "Pas de données" },
  ERREUR: { color: "bg-red-900", icon: "⚠️", label: "Erreur" },
};

const HOTSPOT_CANDIDATES = [
  { name: "Échangeur de Limete", district: "Limete", coords: { lat: -4.3570, lng: 15.3580 } },
  { name: "Av. Mondjiba (Kintambo Magasin)", district: "Ngaliema", coords: { lat: -4.3270, lng: 15.2740 } },
  { name: "Route de Matadi (UPN)", district: "Ngaliema", coords: { lat: -4.3800, lng: 15.2580 } },
  { name: "Blvd Lumumba (Masina Pascal)", district: "Masina", coords: { lat: -4.3850, lng: 15.4200 } },
  { name: "Av. Kasa-Vubu (Victoire)", district: "Kalamu", coords: { lat: -4.3430, lng: 15.3120 } },
  { name: "Av. By-Pass (Triangle)", district: "Lemba", coords: { lat: -4.4100, lng: 15.3150 } },
  { name: "Blvd 30 Juin (Rond-point Mandela)", district: "Gombe", coords: { lat: -4.3120, lng: 15.2980 } },
  { name: "Av. des Huileries", district: "Lingwala", coords: { lat: -4.3250, lng: 15.3100 } },
  { name: "Av. Libération (24/11 - Lingwala)", district: "Lingwala", coords: { lat: -4.3350, lng: 15.3020 } },
  { name: "Av. de l'Université (Pont Gabu)", district: "Kalamu", coords: { lat: -4.3550, lng: 15.3180 } },
  { name: "Av. Elengesa (Pont)", district: "Makala", coords: { lat: -4.3720, lng: 15.3050 } },
  { name: "Av. des Poids Lourds (Kingabwa)", district: "Limete", coords: { lat: -4.3150, lng: 15.3400 } },
];

export default function TrafficCheck() {
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [result, setResult] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isAutoAlert, setIsAutoAlert] = useState(false);
  const [autoAxisName, setAutoAxisName] = useState('');
  const [hotspotIndex, setHotspotIndex] = useState<number>(-1);
  const { toast } = useToast();
  const mapRef = useRef<google.maps.Map | null>(null);
  const hasInitializedRef = useRef(false);

  const handleCheck = useCallback(async (coords: {lat: number, lng: number}, address?: string, isAuto: boolean = false) => {
    setResult(null); 
    setForecast(null);
    setIsLoading(true);
    setIsAutoAlert(isAuto);
    if (address) {
      setAutoAxisName(address);
    } else if (search) {
      setAutoAxisName(search);
    }
    try {
      const data = await checkTrafficAction({ ...coords, address });
      setResult(data);
      if (data.road && !address) {
        setAutoAxisName(data.road);
      }
      const fData = await getTrafficForecastAction(address || data.road || "Kinshasa");
      setForecast(fData);
      if (mapRef.current) {
        mapRef.current.panTo(coords);
        mapRef.current.setZoom(16);
      }
      
      if (data.status === "ERREUR" && !isAuto) {
          toast({ 
              title: "Erreur d'analyse", 
              description: data.verdict, 
              variant: "destructive" 
          });
      }
    } catch (e: any) {
      if (!isAuto) {
        toast({ title: "Erreur", description: e.message || "Impossible d'analyser cet axe.", variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  }, [search, toast]);

  const currentRouteName = autoAxisName || result?.road || search || "Axe de Kinshasa";

  const handleShareWhatsApp = () => {
    if (!result) return;
    const statusLabel = STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG]?.label || result.status;
    const statusIcon = STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG]?.icon || "🚦";
    const delayText = result.delay > 0 ? `+${result.delay} min` : "Fluide";
    
    const message = `🚦 *INFO TRAFIC KINSHASA - KINSHASA FLOW* 🚦\n\n📍 *Axe :* ${currentRouteName}\n${statusIcon} *Statut :* ${statusLabel} (${delayText})\n💬 *Verdict :* "${result.verdict}"\n🇨🇩 *Lingala :* ${result.lingala || "Tosa trafic!"}\n\n📱 *Vérifiez l'état de vos routes en temps réel sur :*\n👉 https://kinshasaflow.online/verifier-trafic`;

    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const loadRandomHotspot = useCallback((currentIdx?: number) => {
    let nextIdx = Math.floor(Math.random() * HOTSPOT_CANDIDATES.length);
    if (currentIdx !== undefined && HOTSPOT_CANDIDATES.length > 1 && nextIdx === currentIdx) {
      nextIdx = (nextIdx + 1) % HOTSPOT_CANDIDATES.length;
    }
    setHotspotIndex(nextIdx);
    const chosen = HOTSPOT_CANDIDATES[nextIdx];
    setLocation(chosen.coords);
    handleCheck(chosen.coords, chosen.name, true);
  }, [handleCheck]);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      loadRandomHotspot();
    }
  }, [loadRandomHotspot]);

  const useMyLocation = () => {
    setIsLocating(true);
    setIsAutoAlert(false);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(coords);
          handleCheck(coords, "Ma position actuelle", false);
          setIsLocating(false);
        },
        () => {
          toast({ title: "Accès refusé", description: "Veuillez saisir une rue manuellement.", variant: "destructive" });
          setIsLocating(false);
        }
      );
    }
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-slate-50 overflow-hidden rounded-2xl md:rounded-3xl border border-slate-100/80">
        {/* Header Bar */}
        <div className="bg-white border-b p-3.5 sm:p-4 md:p-6 shadow-sm z-30 shrink-0">
          <div className="max-w-4xl mx-auto space-y-3 md:space-y-4 w-full min-w-0">
            <div className="flex items-center gap-2.5 md:gap-3">
              <div className="bg-primary p-2 md:p-2.5 rounded-2xl shadow-xl shadow-primary/20 shrink-0">
                <TrafficCone className="text-white h-4 w-4 md:h-5 md:w-5" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Vérifier le Trafic</h1>
                <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest">Analyse en temps réel par segment</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full min-w-0">
              <AutocompleteInput 
                value={search} 
                onChange={setSearch} 
                onSelect={(coords, address) => {
                  setLocation(coords);
                  setIsAutoAlert(false);
                  handleCheck(coords, address, false);
                }}
              />
              <Button 
                variant="outline" 
                onClick={useMyLocation} 
                disabled={isLocating || isLoading}
                className="h-11 sm:h-12 rounded-xl border-2 font-bold gap-2 bg-white hover:bg-slate-50 shrink-0 text-xs sm:text-sm"
              >
                {isLocating ? <Loader2 className="animate-spin h-4 w-4" /> : <LocateFixed className="h-4 w-4 text-primary" />}
                Autour de moi
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-8 w-full min-w-0 overscroll-contain">
          <div className="max-w-xl mx-auto w-full min-w-0 pb-24 md:pb-12">
          
          {/* Automatic Hotspot Warning Header */}
          <AnimatePresence>
            {isAutoAlert && result && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-300/70 rounded-2xl p-3 sm:p-4 shadow-sm flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="bg-amber-500 text-white p-2 rounded-xl shrink-0 shadow-md shadow-amber-500/20">
                    <Flame className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-500 text-white font-black text-[9px] uppercase px-2 py-0 border-none">
                        Alerte Préventive
                      </Badge>
                      <span className="text-[10px] font-bold text-slate-500 hidden sm:inline">Point chaud sous surveillance</span>
                    </div>
                    <p className="text-xs sm:text-sm font-black text-slate-900 truncate mt-0.5">
                      {result.road || autoAxisName}
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadRandomHotspot(hotspotIndex)}
                  disabled={isLoading}
                  className="h-9 px-3 rounded-xl border-amber-300 bg-white hover:bg-amber-50 text-[10px] font-black uppercase text-amber-800 shrink-0 gap-1.5 shadow-sm"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 text-amber-600", isLoading && "animate-spin")} />
                  <span>Autre axe</span>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Initial Loading Pulse */}
          {isLoading && !result && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              className="w-full bg-white rounded-3xl p-8 sm:p-12 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center space-y-4 py-12 sm:py-16 mb-6"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                  <Radar className="h-8 w-8 text-primary animate-spin" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping"></div>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-800">
                  {isAutoAlert ? "Scan d'un point chaud de Kinshasa..." : "Analyse du trafic en cours..."}
                </h3>
                <p className="text-xs font-medium text-slate-400">
                  {isAutoAlert ? "Détection d'un axe nécessitant votre attention." : "Calcul de la fluidité et des prévisions horaires."}
                </p>
              </div>
            </motion.div>
          )}

          {/* Result Panel */}
          <AnimatePresence>
            {result && (
              <motion.div 
                initial={{ y: 20, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 20, opacity: 0, scale: 0.95 }}
                className="w-full bg-white rounded-3xl shadow-xl border border-slate-100 flex flex-col overflow-hidden mb-6"
              >
                <div className={cn("p-5 sm:p-6 md:p-8 text-white relative", STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG]?.color)}>
                  <button onClick={() => { setResult(null); setIsAutoAlert(false); }} className="absolute top-4 right-4 text-white/70 hover:text-white p-1.5 rounded-full bg-black/10 hover:bg-black/20 transition-colors"><X className="h-5 w-5" /></button>
                  <div className="space-y-2 md:space-y-3 relative z-10 pr-8">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-white/20 border-white/30 text-white font-bold text-[10px] md:text-xs">
                        {isAutoAlert ? "POINT CHAUD EN DIRECT" : "VERDICT K-FLOW"}
                      </Badge>
                    </div>

                    {/* Road Name Prominently Displayed */}
                    <div className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-3.5 py-1.5 rounded-2xl w-fit border border-white/20">
                      <MapPin className="h-4 w-4 text-white shrink-0" />
                      <span className="text-sm sm:text-base font-black text-white leading-tight">
                        {currentRouteName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 md:gap-3 pt-1">
                      <span className="text-3xl md:text-4xl">{STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG]?.icon}</span>
                      <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter leading-none">
                        {STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG]?.label}
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-5 md:p-6 space-y-4 md:space-y-6 flex-1">
                  <div className="p-4 md:p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 md:space-y-3">
                    <p className="text-xs sm:text-sm font-bold text-slate-800 leading-relaxed italic">"{result.verdict}"</p>
                    <p className="text-[10px] sm:text-xs font-black text-primary uppercase tracking-widest">{result.lingala}</p>
                  </div>

                  {result.status === "ERREUR" && (
                      <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-3">
                        <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-xs font-black text-red-800 uppercase">Détail technique</p>
                            <p className="text-[10px] text-red-600 font-medium leading-relaxed">
                                Veuillez vérifier dans votre console Google Cloud que l'API "Routes API" est bien activée pour votre clé "Kinshasaflow 3".
                            </p>
                        </div>
                      </div>
                  )}

                  {forecast && forecast.hourlyForecast && (
                    <div className="space-y-2 md:space-y-3 w-full min-w-0">
                      <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <Zap className="h-3 w-3 text-primary" /> Prévisions Prochaines Heures
                      </h3>
                      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 w-full">
                        {forecast.hourlyForecast.map((hr: any, i: number) => (
                          <div key={i} className="flex flex-col items-center p-2.5 sm:p-3 rounded-xl border border-slate-100 bg-white min-w-[64px] sm:min-w-[70px] shrink-0 shadow-sm">
                            <span className="text-[10px] font-black text-slate-400">{hr.time}</span>
                            <div className={cn("w-3 h-3 rounded-full mt-1.5 mb-1", hr.status === 'FLUIDE' ? 'bg-emerald-500' : hr.status === 'EMBOUTEILLAGE' ? 'bg-red-500' : 'bg-amber-500')} />
                            <span className="text-[9px] font-bold text-slate-600">{hr.delay > 0 ? `+${hr.delay}m` : 'OK'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.alternatives && result.alternatives.length > 0 && (
                    <div className="space-y-3 md:space-y-4">
                      <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <Zap className="h-3 w-3 text-amber-500" /> Itinéraires plus fluides
                      </h3>
                      {result.alternatives.map((alt: any, i: number) => (
                        <div key={i} className="p-3.5 sm:p-4 rounded-2xl border-2 border-emerald-100 bg-emerald-50/50 flex justify-between items-center group hover:bg-emerald-50 transition-all">
                          <div className="min-w-0 pr-2">
                            <p className="font-bold text-slate-800 text-xs truncate">{alt.description}</p>
                            <p className="text-[10px] font-black text-emerald-600 uppercase">{alt.duration} en tout</p>
                          </div>
                          <Button asChild size="icon" variant="ghost" className="rounded-full text-emerald-600 hover:bg-emerald-100 shrink-0">
                            <Link href="/k-flow-nav"><Navigation className="h-4 w-4" /></Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="p-3.5 sm:p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-2.5 sm:gap-3">
                    <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-[10px] text-blue-800 font-bold leading-relaxed">
                      L'analyse est basée sur le ratio de congestion actuel par rapport à la circulation fluide théorique.
                    </p>
                  </div>
                </div>

                <div className="p-4 sm:p-5 md:p-6 bg-slate-50 border-t flex flex-col gap-2.5 sm:gap-3">
                  
                  {/* WhatsApp Share Button */}
                  <Button 
                    onClick={handleShareWhatsApp}
                    className="h-12 sm:h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider gap-2 shadow-xl shadow-emerald-600/20"
                  >
                    <MessageCircle className="h-5 w-5 fill-current" />
                    <span>Partager ce Trafic sur WhatsApp</span>
                  </Button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <Button asChild variant="outline" className="h-12 rounded-2xl border-2 font-black text-xs uppercase tracking-wider gap-1.5">
                      <Link href="/signaler-embouteillage">
                        <RefreshCw className="h-4 w-4" />
                        <span>Signaler</span>
                      </Link>
                    </Button>
                    <Button asChild className="h-12 rounded-2xl font-black text-xs uppercase tracking-wider gap-1.5 shadow-lg shadow-primary/20">
                      <Link href="/k-flow-nav">
                        <Navigation className="h-4 w-4" />
                        <span>GPS Nav</span>
                      </Link>
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
    </div>
  );
}

function AutocompleteInput({ value, onChange, onSelect }: { value: string, onChange: (v: string) => void, onSelect: (coords: {lat: number, lng: number}, address: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary('places');

  useEffect(() => {
    if (!places || !inputRef.current) return;
    const autocomplete = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'cd' },
      bounds: CONFIG.KINSHASA_BOUNDS,
      fields: ['formatted_address', 'geometry', 'name'],
      strictBounds: true,
    });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        const coords = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
        onSelect(coords, place.formatted_address || place.name || '');
      }
    });
  }, [places, onSelect]);

  return (
    <div className="relative flex-1 w-full min-w-0">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
      <Input 
        ref={inputRef}
        placeholder="Entrez le nom d'une avenue ou d'un quartier..." 
        value={value}
        onChange={e => onChange(e.target.value)}
        className="pl-12 h-12 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold focus-visible:ring-primary shadow-inner"
      />
    </div>
  );
}

const TrafficLayerComponent = () => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const g = (window as any).google;
    if (!g) return;
    const layer = new g.maps.TrafficLayer();
    layer.setMap(map);
    return () => layer.setMap(null);
  }, [map]);
  return null;
};
