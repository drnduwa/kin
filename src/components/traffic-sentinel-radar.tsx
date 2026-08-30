'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Radar, 
  AlertTriangle, 
  Navigation, 
  X, 
  ShieldAlert, 
  ChevronRight, 
  Sparkles,
  Flame,
  Volume2,
  VolumeX,
  Compass,
  Radio
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFirebase } from '@/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface BottleneckPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  detour: string;
  timeDelay: string;
  severity: 'high' | 'medium';
}

// 12 Strategic Bottlenecks of Kinshasa with exact coordinates & detours
const KINSHASA_BOTTLENECK_ZONES: BottleneckPoint[] = [
  {
    id: 'echangeur-limete',
    name: 'Échangeur de Limete (Boulevard Lumumba)',
    lat: -4.3570,
    lng: 15.3580,
    detour: 'Prenez l\'Avenue des Poids Lourds via Kingabwa pour éviter le nœud de l\'Échangeur.',
    timeDelay: '+25 min',
    severity: 'high'
  },
  {
    id: 'kintambo-magasin',
    name: 'Kintambo Magasin & Mondjiba',
    lat: -4.3270,
    lng: 15.2740,
    detour: 'Contournez par l\'Avenue du Livre (Bandal) ➔ Avenue Moulaert ➔ Av. de la Montagne.',
    timeDelay: '+20 min',
    severity: 'high'
  },
  {
    id: 'upn-route-matadi',
    name: 'Route de Matadi (Binza Météo ➔ UPN)',
    lat: -4.3880,
    lng: 15.2340,
    detour: 'Déviation conseillée par l\'Avenue de la Libération ou les berges de Selembao.',
    timeDelay: '+30 min',
    severity: 'high'
  },
  {
    id: 'rond-point-ngaba',
    name: 'Rond-Point Ngaba & By-Pass',
    lat: -4.4100,
    lng: 15.3150,
    detour: 'Empruntez la nouvelle Avenue Elengesa reliant directement Makala et Kalamu.',
    timeDelay: '+35 min',
    severity: 'high'
  },
  {
    id: 'carrefour-victoire',
    name: 'Carrefour Victoire (Kalamu)',
    lat: -4.3430,
    lng: 15.3120,
    detour: 'Passez par l\'Avenue de l\'Enseignement ➔ Avenue Inga / Pierre Mulele.',
    timeDelay: '+15 min',
    severity: 'medium'
  },
  {
    id: 'masina-pascal',
    name: 'Masina Pascal & Marché de la Liberté',
    lat: -4.4050,
    lng: 15.4120,
    detour: 'Prendre l\'Avenue Ndjoku vers Kingabwa puis Poids Lourds dès la sortie de l\'Échangeur.',
    timeDelay: '+35 min',
    severity: 'high'
  },
  {
    id: 'rond-point-mandela',
    name: 'Rond-Point Mandela (Blvd du 30 Juin)',
    lat: -4.3050,
    lng: 15.3050,
    detour: 'Empruntez l\'Avenue de la Justice ou Colonel Ebeya pour contourner le centre.',
    timeDelay: '+15 min',
    severity: 'medium'
  },
  {
    id: 'debonhomme-matete',
    name: 'Carrefour Debonhomme / Pont Matete',
    lat: -4.3680,
    lng: 15.3720,
    detour: 'Prenez le Petit Boulevard de Limete (7e Rue) pour contourner le pont Matete.',
    timeDelay: '+20 min',
    severity: 'high'
  },
  {
    id: 'pompage-ngaliema',
    name: 'Saut-de-Mouton Pompage (Ngaliema)',
    lat: -4.3310,
    lng: 15.2410,
    detour: 'Passer par l\'Avenue du Tourisme le long des berges du fleuve.',
    timeDelay: '+15 min',
    severity: 'medium'
  },
  {
    id: 'socimat-gombe',
    name: 'Rond-Point Socimat (Gombe)',
    lat: -4.3080,
    lng: 15.2890,
    detour: 'Passez par l\'Avenue du Port ou Colonel Mondjiba.',
    timeDelay: '+10 min',
    severity: 'medium'
  }
];

// Haversine formula to compute distance in km
function calculateDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Synthesize high-tech radar alert ping
const playRadarAlertSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    // Pulse 1 : Radar sweep alert (880 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Pulse 2 : Second warning ping (1174.66 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, now + 0.12);
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);
  } catch (_) {}
};

export interface RadarWarning {
  id: string;
  title: string;
  distanceKm: number;
  delay: string;
  detour: string;
  severity: 'high' | 'medium';
}

export function TrafficSentinelRadar() {
  const { firestore } = useFirebase();
  const router = useRouter();

  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [activeWarning, setActiveWarning] = useState<RadarWarning | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  
  // Track last alerted bottlenecks to avoid spamming (8-minute cooldown)
  const alertedCooldownRef = useRef<Record<string, number>>({});
  const watchIdRef = useRef<number | null>(null);

  // 1. Background GPS Watcher
  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined' || !navigator.geolocation) return;

    const handlePositionUpdate = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      setUserCoords({ lat: latitude, lng: longitude });

      // Scan nearby bottlenecks
      checkProximityToBottlenecks(latitude, longitude);
    };

    const handleError = () => {
      // Graceful silence on GPS denial
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      handleError,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isEnabled]);

  // 2. Scan bottlenecks within 0.4 km - 1.5 km ahead
  const checkProximityToBottlenecks = useCallback((currentLat: number, currentLng: number) => {
    const now = Date.now();
    const COOLDOWN_MS = 8 * 60 * 1000; // 8 minutes

    for (const spot of KINSHASA_BOTTLENECK_ZONES) {
      const distance = calculateDistanceInKm(currentLat, currentLng, spot.lat, spot.lng);

      // Trigger zone: between 400m and 1.5 km (0.4 - 1.5 km)
      if (distance >= 0.35 && distance <= 1.5) {
        const lastAlerted = alertedCooldownRef.current[spot.id] || 0;
        if (now - lastAlerted > COOLDOWN_MS) {
          alertedCooldownRef.current[spot.id] = now;

          // Sound & Haptics
          playRadarAlertSound();
          if ('vibrate' in navigator) {
            try {
              navigator.vibrate([200, 80, 200, 80, 400]);
            } catch (_) {}
          }

          // Trigger warning card
          setActiveWarning({
            id: spot.id,
            title: spot.name,
            distanceKm: Math.round(distance * 10) / 10,
            delay: spot.timeDelay,
            detour: spot.detour,
            severity: spot.severity
          });

          // Also trigger Web Notification if supported
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`⚠️ Bouchon à ${Math.round(distance * 10) / 10} km : ${spot.name}`, {
                body: `Retard ${spot.timeDelay}. ${spot.detour}`,
                icon: '/icon-192x192.png',
                badge: '/icon-192x192.png',
                tag: spot.id
              });
            } catch (_) {}
          }

          break; // Trigger one warning at a time
        }
      }
    }
  }, []);

  const handleDismiss = () => {
    setActiveWarning(null);
  };

  const handleLaunchDetour = () => {
    setActiveWarning(null);
    router.push('/insights');
  };

  return (
    <>
      {/* ── Active Floating 1 km Radar Alert Card ── */}
      <AnimatePresence>
        {activeWarning && (
          <motion.div 
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed top-3 left-3 right-3 sm:left-auto sm:right-5 sm:w-[420px] z-[9999] pointer-events-auto"
          >
            <div className="bg-slate-900 text-white rounded-3xl shadow-[0_15px_50px_rgba(0,0,0,0.4)] border-2 border-amber-500/80 p-4 sm:p-5 overflow-hidden relative backdrop-blur-xl">
              
              {/* Pulsing Radar Glow in Background */}
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/20 rounded-full blur-2xl animate-pulse"></div>

              <div className="relative z-10 space-y-3">
                
                {/* Header Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    <Badge className="bg-amber-500 text-slate-950 font-black text-[9px] uppercase tracking-wider border-none px-2 py-0.5">
                      RADAR SENTINELLE • 1 KM DEVANT
                    </Badge>
                  </div>

                  <button 
                    onClick={handleDismiss}
                    className="p-1 rounded-full text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Main Alert Body */}
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-black text-sm sm:text-base text-white tracking-tight leading-snug">
                      {activeWarning.title}
                    </h3>
                    <span className="text-xs font-black text-amber-400 shrink-0 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                      {activeWarning.distanceKm} km
                    </span>
                  </div>

                  <p className="text-[11px] font-bold text-red-400">
                    ⚠️ Retard estimé sur cet axe : <strong className="text-white">{activeWarning.delay}</strong>
                  </p>
                </div>

                {/* Detour Recommendation */}
                <div className="bg-white/10 border border-white/15 rounded-2xl p-3 text-xs space-y-1">
                  <p className="text-[10px] font-black uppercase text-emerald-400 flex items-center gap-1 tracking-wider">
                    <Sparkles className="h-3 w-3" /> Raccourci Conseillé
                  </p>
                  <p className="text-slate-200 font-medium leading-relaxed text-[11px]">
                    {activeWarning.detour}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <Button 
                    onClick={handleLaunchDetour}
                    className="flex-1 rounded-2xl h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 gap-1.5"
                  >
                    <Compass className="h-4 w-4" />
                    <span>Prendre le Raccourci</span>
                  </Button>
                  
                  <Button 
                    variant="ghost" 
                    onClick={handleDismiss}
                    className="rounded-2xl h-11 px-3 text-xs font-bold text-slate-400 hover:text-white hover:bg-white/10"
                  >
                    Ignorer
                  </Button>
                </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
