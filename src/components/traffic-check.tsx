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
  AlertCircle
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

const STATUS_CONFIG = {
  BLOQUÉ: { color: "bg-purple-600", icon: "🔴", label: "Bloqué" },
  EMBOUTEILLAGE: { color: "bg-red-600", icon: "🔴", label: "Embouteillé" },
  MODÉRÉ: { color: "bg-amber-500", icon: "🟡", label: "Modéré" },
  FLUIDE: { color: "bg-emerald-500", icon: "🟢", label: "Fluide" },
  INCONNU: { color: "bg-slate-400", icon: "⚪", label: "Pas de données" },
  ERREUR: { color: "bg-red-900", icon: "⚠️", label: "Erreur" },
};

export default function TrafficCheck() {
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [result, setResult] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const { toast } = useToast();
  const mapRef = useRef<google.maps.Map | null>(null);

  const handleCheck = useCallback(async (coords: {lat: number, lng: number}, address?: string) => {
    setResult(null); 
    setForecast(null);
    setIsLoading(true);
    try {
      const data = await checkTrafficAction({ ...coords, address });
      setResult(data);
      const fData = await getTrafficForecastAction(address || data.road || "Kinshasa");
      setForecast(fData);
      if (mapRef.current) {
        mapRef.current.panTo(coords);
        mapRef.current.setZoom(16);
      }
      
      if (data.status === "ERREUR") {
          toast({ 
              title: "Erreur d'analyse", 
              description: data.verdict, 
              variant: "destructive" 
          });
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message || "Impossible d'analyser cet axe.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const useMyLocation = () => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(coords);
          handleCheck(coords, "Ma position actuelle");
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
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden">
        {/* Header Bar */}
        <div className="bg-white border-b p-4 md:p-6 shadow-sm z-30">
          <div className="max-w-4xl mx-auto space-y-4 w-full min-w-0">
            <div className="flex items-center gap-3">
              <div className="bg-primary p-2.5 rounded-2xl shadow-xl shadow-primary/20">
                <TrafficCone className="text-white h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Vérifier le Trafic</h1>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Analyse en temps réel par segment</p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2 w-full min-w-0">
              <AutocompleteInput 
                value={search} 
                onChange={setSearch} 
                onSelect={(coords, address) => {
                  setLocation(coords);
                  handleCheck(coords, address);
                }}
              />
              <Button 
                variant="outline" 
                onClick={useMyLocation} 
                disabled={isLocating || isLoading}
                className="h-12 rounded-xl border-2 font-bold gap-2 bg-white hover:bg-slate-50"
              >
                {isLocating ? <Loader2 className="animate-spin h-4 w-4" /> : <LocateFixed className="h-4 w-4 text-primary" />}
                Autour de moi
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full min-w-0">
          <div className="max-w-xl mx-auto w-full min-w-0">
          {/* Result Panel */}
          <AnimatePresence>
            {result && (
              <motion.div 
                initial={{ y: 20, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 20, opacity: 0, scale: 0.95 }}
                className="w-full bg-white rounded-3xl shadow-xl border border-slate-100 flex flex-col overflow-hidden"
              >
                <div className={cn("p-8 text-white relative", STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG]?.color)}>
                  <button onClick={() => setResult(null)} className="absolute top-4 right-4 text-white/50 hover:text-white"><X /></button>
                  <div className="space-y-4 relative z-10">
                    <Badge className="bg-white/20 border-white/30 text-white font-bold mb-2">VERDICT K-FLOW</Badge>
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">{STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG]?.icon}</span>
                      <h2 className="text-3xl font-black uppercase tracking-tighter leading-none">
                        {STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG]?.label}
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6 flex-1">
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                    <p className="text-sm font-bold text-slate-800 leading-relaxed italic">"{result.verdict}"</p>
                    <p className="text-xs font-black text-primary uppercase tracking-widest">{result.lingala}</p>
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
                    <div className="space-y-3 w-full min-w-0">
                      <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <Zap className="h-3 w-3 text-primary" /> Prévisions Prochaines Heures
                      </h3>
                      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 w-full">
                        {forecast.hourlyForecast.map((hr: any, i: number) => (
                          <div key={i} className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-white min-w-[70px] shrink-0 shadow-sm">
                            <span className="text-[10px] font-black text-slate-400">{hr.time}</span>
                            <div className={cn("w-3 h-3 rounded-full mt-2 mb-1", hr.status === 'FLUIDE' ? 'bg-emerald-500' : hr.status === 'EMBOUTEILLAGE' ? 'bg-red-500' : 'bg-amber-500')} />
                            <span className="text-[9px] font-bold text-slate-600">{hr.delay > 0 ? `+${hr.delay}m` : 'OK'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.alternatives && result.alternatives.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <Zap className="h-3 w-3 text-amber-500" /> Itinéraires plus fluides
                      </h3>
                      {result.alternatives.map((alt: any, i: number) => (
                        <div key={i} className="p-4 rounded-2xl border-2 border-emerald-100 bg-emerald-50/50 flex justify-between items-center group hover:bg-emerald-50 transition-all">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-xs truncate">{alt.description}</p>
                            <p className="text-[10px] font-black text-emerald-600 uppercase">{alt.duration} en tout</p>
                          </div>
                          <Button asChild size="icon" variant="ghost" className="rounded-full text-emerald-600 hover:bg-emerald-100">
                            <Link href="/k-flow-nav"><Navigation className="h-4 w-4" /></Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3">
                    <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-[10px] text-blue-800 font-bold leading-relaxed">
                      L'analyse est basée sur le ratio de congestion actuel par rapport à la circulation fluide théorique.
                    </p>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 border-t flex flex-col gap-3">
                  <Button asChild variant="outline" className="h-14 rounded-2xl border-2 font-black text-xs uppercase tracking-widest gap-2">
                    <Link href="/signaler-embouteillage">
                      <RefreshCw className="h-4 w-4" />
                      Signaler un changement
                    </Link>
                  </Button>
                  <Button asChild className="h-14 rounded-2xl font-black text-xs uppercase tracking-widest gap-2 shadow-xl shadow-primary/20">
                    <Link href="/k-flow-nav">
                      <Navigation className="h-4 w-4" />
                      Lancer le guidage
                    </Link>
                  </Button>
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
