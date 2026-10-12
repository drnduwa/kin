'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Map, 
  useMap, 
  useMapsLibrary, 
  Marker,
} from '@vis.gl/react-google-maps';
import { 
  Search, 
  Loader2, 
  Star, 
  Zap, 
  X, 
  Navigation as NavigationIcon,
  CheckCircle2,
  LocateFixed,
  ChevronRight,
  ShieldCheck,
  Volume2,
  VolumeX,
  Mic,
  Compass,
  ArrowUp,
  ArrowUpRight,
  CornerUpRight,
  CornerUpLeft,
  Radar
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUser, useFirebase, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, runTransaction, serverTimestamp, collection, query, orderBy, limit } from 'firebase/firestore';
import { STAR_COSTS, UserProfile, EventReport, isUserSubscribedOrHasPass } from '@/lib/types';
import { generateSpeechAction, getGoogleTrafficStatusAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import Link from 'next/link';
import { MAJOR_AXES } from '@/lib/constants';
import { CONFIG } from '@/lib/config';

interface RouteSummary {
    index: number;
    distance: string;
    duration: string;
    durationInTraffic: string;
    delayMinutes: number;
    isSmart: boolean;
}

interface RouteInfo {
    distance: string;
    duration: string;
    durationInTraffic?: string;
    destinationCoords?: { lat: number, lng: number };
    allRoutes?: RouteSummary[];
    result?: google.maps.DirectionsResult;
    currentStep?: any;
    nextStep?: any;
}

interface TrafficSegment {
    from: string;
    to: string;
    status: 'fluide' | 'congestionné' | 'bloqué' | 'inconnu';
    delayMinutes: number;
    distanceText: string;
}

interface SummaryData {
    destination: string;
    distance: string;
    duration: string;
    delayMinutes: number;
    segments: TrafficSegment[];
    recommendation: string;
    bestRouteIndex: number;
    allRoutes?: RouteSummary[];
}

const translateInstruction = (text: string) => {
    let t = text;
    const map: Record<string, string> = {
        "At the roundabout": "Au rond-point",
        "Continue onto": "Continuer sur",
        "Turn right": "Tourner à droite",
        "Turn left": "Tourner à gauche",
        "Head south": "Dirigez-vous vers le sud",
        "Head north": "Dirigez-vous vers le nord",
        "Head east": "Dirigez-vous vers l'est",
        "Head west": "Dirigez-vous vers l'ouest",
        "Merge onto": "Rejoindre",
        "Take the exit": "Prendre la sortie",
        "Keep left": "Rester à gauche",
        "Keep right": "Rester à droite",
        "Slight right": "Légèrement à droite",
        "Slight left": "Légèrement à gauche",
        "Take the 1st exit": "Prendre la 1ère sortie",
        "Take the 2nd exit": "Prendre la 2ème sortie",
        "Take the 3rd exit": "Prendre la 3ème sortie",
        "Take the 4th exit": "Prendre la 4ème sortie",
        "onto": "sur",
        "way": "voie",
        "Road": "Route",
        "Street": "Rue",
        "Blvd": "Boulevard"
    };
    Object.keys(map).forEach(key => {
        const regex = new RegExp(`\\b${key}\\b`, 'gi');
        t = t.replace(regex, map[key]);
    });
    return t;
};

const getDirectionIcon = (instruction: string) => {
    const text = instruction.toLowerCase();
    if (text.includes('droite') || text.includes('right')) return <CornerUpRight className="h-10 w-10" />;
    if (text.includes('gauche') || text.includes('left')) return <CornerUpLeft className="h-10 w-10" />;
    if (text.includes('rond-point') || text.includes('roundabout')) return <ArrowUpRight className="h-10 w-10" />;
    return <ArrowUp className="h-10 w-10" />;
};

function useInterpolatedLocation(rawLocation: {lat: number, lng: number} | null) {
    const [smoothLocation, setSmoothLocation] = useState<{lat: number, lng: number} | null>(null);
    const [heading, setHeading] = useState(0);
    const [speed, setSpeed] = useState(0);
    const lastPos = useRef<{lat: number, lng: number} | null>(null);
    const animationFrame = useRef<number>(0);

    useEffect(() => {
        if (!rawLocation) return;

        if (!lastPos.current) {
            setSmoothLocation(rawLocation);
            lastPos.current = rawLocation;
            return;
        }

        const g = (window as any).google;
        if (g?.maps?.geometry?.spherical) {
            const newHeading = g.maps.geometry.spherical.computeHeading(
                new g.maps.LatLng(lastPos.current.lat, lastPos.current.lng),
                new g.maps.LatLng(rawLocation.lat, rawLocation.lng)
            );
            if (Math.abs(newHeading) > 1) {
                setHeading(newHeading);
            }
            const dist = g.maps.geometry.spherical.computeDistanceBetween(
                new g.maps.LatLng(lastPos.current.lat, lastPos.current.lng),
                new g.maps.LatLng(rawLocation.lat, rawLocation.lng)
            );
            setSpeed(Math.round(dist * 3.6));
        }

        let startTime: number;
        const duration = 1000;
        const startPos = { ...lastPos.current };

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);

            const currentLat = startPos.lat + (rawLocation.lat - startPos.lat) * progress;
            const currentLng = startPos.lng + (rawLocation.lng - startPos.lng) * progress;

            const interpolated = { lat: currentLat, lng: currentLng };
            setSmoothLocation(interpolated);
            lastPos.current = interpolated;

            if (progress < 1) {
                animationFrame.current = requestAnimationFrame(animate);
            }
        };

        animationFrame.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame.current);
    }, [rawLocation]);

    return { smoothLocation, heading, speed };
}

function MapCameraHandler({ 
  smoothLocation, 
  autoFollow, 
  showSummary, 
  isNavigating, 
  is3D, 
  heading 
}: { 
  smoothLocation: {lat: number, lng: number} | null,
  autoFollow: boolean,
  showSummary: boolean,
  isNavigating: boolean,
  is3D: boolean,
  heading: number
}) {
    const map = useMap();

    useEffect(() => {
        if (map && smoothLocation && autoFollow && !showSummary) {
            map.moveCamera({
                center: smoothLocation,
                heading: isNavigating && is3D ? heading : 0,
                tilt: isNavigating && is3D ? 45 : 0,
                zoom: isNavigating ? 19 : 15
            });
        }
    }, [map, smoothLocation, autoFollow, heading, isNavigating, is3D, showSummary]);

    return null;
}

export default function KFlowNav() {
    const { user, firestore } = useFirebase();
    const { toast } = useToast();
    const [rawLocation, setRawLocation] = useState<{lat: number, lng: number} | null>(null);
    const { smoothLocation, heading, speed } = useInterpolatedLocation(rawLocation);
    const [destination, setDestination] = useState<string>('');
    const [isNavigating, setIsNavigating] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
    const [is3D, setIs3D] = useState(true);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
    const [autoFollow, setAutoFollow] = useState(true);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResults, setScanResults] = useState<any[] | null>(null);
    
    const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: profile } = useDoc<UserProfile>(userRef);

    const incidentsCollection = useMemoFirebase(() => collection(firestore, 'events'), [firestore]);
    const incidentsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(incidentsCollection, orderBy('createdAt', 'desc'), limit(50));
    }, [firestore, incidentsCollection]);
    const { data: incidents } = useCollection<EventReport>(incidentsQuery);

    useEffect(() => {
        if (typeof window !== 'undefined' && navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    setRawLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                },
                (err) => console.warn("GPS error", err),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, []);

    const handleAnalyzeRoute = async () => {
        if (!user || !profile) return;
        if (!destination) {
            toast({ title: "Destination vide", description: "Où souhaitez-vous aller ?", variant: "destructive" });
            return;
        }

        const hasPass = isUserSubscribedOrHasPass(profile);

        if (!hasPass && profile.currentStarsBalance < STAR_COSTS.NAVIGATION_SESSION) {
            toast({
                title: "Solde insuffisant",
                description: `L'analyse premium coûte ${STAR_COSTS.NAVIGATION_SESSION} stars. Rechargez votre compte ou activez un Pass Illimité.`,
                variant: "destructive",
                action: <Button asChild variant="outline" size="sm"><Link href="/mes-stars">Boutique</Link></Button>
            });
            return;
        }

        setIsUnlocking(true);
        setIsAnalyzing(true);

        try {
            const g = (window as any).google;
            if (!g) throw new Error("API Google Maps non chargée.");

            const service = new g.maps.DirectionsService();
            const result = await service.route({
                origin: smoothLocation || CONFIG.KINSHASA_CENTER,
                destination: destination,
                travelMode: g.maps.TravelMode.DRIVING,
                provideRouteAlternatives: true,
                drivingOptions: { 
                    departureTime: new Date(), 
                    trafficModel: g.maps.TrafficModel.BEST_GUESS
                }
            });

            if (!result || !result.routes.length) throw new Error("Aucun itinéraire trouvé.");

            const mainRoute = result.routes[0];
            const leg = mainRoute.legs[0];
            
            const legDurationTypical = leg.duration?.value || 1;
            const legDurationTraffic = leg.duration_in_traffic?.value || legDurationTypical;
            const legDistanceTotal = leg.distance?.value || 1;
            
            let blockedCount = 0;
            let congestedCount = 0;

            const rawSegments: TrafficSegment[] = leg.steps.map((step: any) => {
                const currentDuration = step.duration?.value || 0;
                const typicalDuration = (step.distance?.value / legDistanceTotal) * legDurationTypical;
                const ratio = typicalDuration > 0 ? currentDuration / typicalDuration : 1;
                
                let status: TrafficSegment['status'] = 'fluide';
                if (ratio > 1.8) {
                    status = 'bloqué';
                    blockedCount++;
                }
                else if (ratio > 1.25) {
                    status = 'congestionné';
                    congestedCount++;
                }
                
                const rawName = step.instructions.replace(/<[^>]*>?/gm, '').split(',')[0];
                const name = translateInstruction(rawName);

                return {
                    from: name,
                    to: "",
                    status,
                    delayMinutes: Math.max(0, Math.round((currentDuration - typicalDuration) / 60)),
                    distanceText: step.distance?.text || '',
                };
            });

            const mergedSegments: TrafficSegment[] = [];
            if (rawSegments.length > 0) {
                let current = { ...rawSegments[0] };
                for (let i = 1; i < rawSegments.length; i++) {
                    const step = rawSegments[i];
                    if (step.status === current.status || (step.distanceText.includes(' m') && !step.distanceText.includes(' km'))) {
                        current.to = step.from;
                        current.delayMinutes += step.delayMinutes;
                    } else {
                        mergedSegments.push(current);
                        current = { ...step };
                    }
                }
                mergedSegments.push(current);
            }

            const globalDelay = Math.max(0, Math.round((legDurationTraffic - legDurationTypical) / 60));
            
            const summaries: RouteSummary[] = result.routes.slice(0, 2).map((r: any, i: number) => {
                const l = r.legs[0];
                const dur = l.duration?.value || 0;
                const durT = l.duration_in_traffic?.value || dur;
                return {
                    index: i,
                    distance: l.distance?.text || '',
                    duration: l.duration?.text || '',
                    durationInTraffic: l.duration_in_traffic?.text || l.duration?.text || '',
                    delayMinutes: Math.max(0, Math.round((durT - dur) / 60)),
                    isSmart: i > 0 || (result.routes.length > 1 && durT < (result.routes[1]?.legs[0].duration_in_traffic?.value || Infinity))
                };
            });

            let bestIdx = 0;
            let rec = `Conditions excellentes : le flux est fluide sur l'ensemble de votre trajet.`;
            
            if (blockedCount > 0) {
                rec = `Flux critique : ${blockedCount} zone(s) de blocage total détectée(s). Retard estimé de ${globalDelay} min.`;
            } else if (congestedCount > 1) {
                rec = `Ralentissements détectés. Prévoyez environ ${globalDelay} min de retard.`;
            }

            if (result.routes.length > 1) {
                const dur0 = result.routes[0].legs[0].duration_in_traffic?.value || result.routes[0].legs[0].duration?.value || 0;
                const dur1 = result.routes[1].legs[0].duration_in_traffic?.value || result.routes[1].legs[0].duration?.value || 0;
                const gain = Math.round((dur0 - dur1) / 60);
                if (gain >= 2) {
                    bestIdx = 1;
                    rec = `Optimisation K-Flow : cet itinéraire permet de gagner ${gain} min en contournant les zones rouges.`;
                }
            }

            if (!hasPass) {
                await runTransaction(firestore, async (transaction) => {
                    const userDoc = await transaction.get(userRef!);
                    const data = userDoc.data() as UserProfile;
                    const newBalance = data.currentStarsBalance - STAR_COSTS.NAVIGATION_SESSION;
                    transaction.update(userRef!, { currentStarsBalance: newBalance });
                    const starTransRef = doc(collection(userRef!, 'star_transactions'));
                    transaction.set(starTransRef, {
                        userId: user.uid,
                        type: 'spent',
                        starsChange: -STAR_COSTS.NAVIGATION_SESSION,
                        balanceAfterTransaction: newBalance,
                        description: `Guidage GPS : ${destination}`,
                        timestamp: serverTimestamp(),
                    });
                });
            }

            setSummaryData({
                destination,
                distance: leg.distance?.text || '--',
                duration: leg.duration_in_traffic?.text || leg.duration?.text || '--',
                delayMinutes: globalDelay,
                segments: mergedSegments.filter(s => s.status !== 'fluide' || mergedSegments.length < 5),
                recommendation: rec,
                bestRouteIndex: bestIdx,
                allRoutes: summaries
            });
            
            setSelectedRouteIndex(bestIdx);
            setShowSummary(true);

        } catch (error: any) {
            console.error(error);
            toast({ title: "Erreur d'analyse", description: error.message || "Échec de connexion.", variant: "destructive" });
        } finally {
            setIsUnlocking(false);
            setIsAnalyzing(false);
        }
    };

    const handleScanSector = async () => {
        if (!smoothLocation) return;
        setIsScanning(true);
        try {
            const nearby = MAJOR_AXES.map((axis, idx) => ({
                ...axis,
                dist: Math.sqrt(Math.pow(axis.origin.lat - smoothLocation.lat, 2) + Math.pow(axis.origin.lng - smoothLocation.lng, 2)) * 111
            })).filter(a => a.dist <= 2).slice(0, 10);

            if (nearby.length > 0) {
                const results = await getGoogleTrafficStatusAction(nearby as any);
                setScanResults(results);
            } else {
                setScanResults([]);
            }
            
            if (isAudioEnabled) {
                const msg = "Radar activé. Analyse des axes dans un rayon de deux kilomètres terminée.";
                generateSpeechAction(msg).then(res => {
                    if (res?.media) new Audio(res.media).play();
                });
            }
        } catch (e) {
            toast({ title: "Radar indisponible" });
        } finally {
            setIsScanning(false);
        }
    };

    const handleStartNavigation = () => {
        setIsNavigating(true);
        setShowSummary(false);
        setAutoFollow(true);
        setIs3D(true);
    };

    const handleReCenter = () => {
        if (!smoothLocation) return;
        setAutoFollow(true);
    };

    const onRouteUpdate = (info: RouteInfo) => {
        setRouteInfo(info);
    };

    return (
        <div className="w-full h-full rounded-[2rem] overflow-hidden relative shadow-2xl bg-[#0b121e] flex flex-col border border-slate-800">
                {/* ── Instructions Banner (Google Style) ── */}
                <AnimatePresence>
                    {isNavigating && (
                        <motion.div 
                            initial={{ y: -100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -100, opacity: 0 }}
                            className="absolute top-4 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none"
                        >
                            <div className="w-full max-w-xl bg-[#00695c] shadow-2xl rounded-3xl p-5 flex items-center gap-6 pointer-events-auto border-t border-white/20">
                                <div className="text-white bg-[#004d40] p-3 rounded-2xl shadow-inner">
                                    {getDirectionIcon(routeInfo?.currentStep?.instructions || "")}
                                </div>
                                <div className="flex-1 text-white">
                                    <p className="text-2xl font-black leading-tight tracking-tight">
                                        {translateInstruction(routeInfo?.currentStep?.instructions.replace(/<[^>]*>?/gm, '').split(',')[0] || "Suivre l'itinéraire")}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1 opacity-80">
                                        <p className="text-[10px] font-black uppercase tracking-widest">Ensuite :</p>
                                        <p className="text-xs font-bold">{translateInstruction(routeInfo?.nextStep?.instructions.replace(/<[^>]*>?/gm, '').split(',')[0] || "--")}</p>
                                    </div>
                                </div>
                                <div className="bg-white/10 p-3 rounded-full">
                                    <Mic className="text-white h-5 w-5" />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Top Bar (Search Mode) ── */}
                {!isNavigating && !showSummary && (
                    <div className="absolute top-4 left-0 right-0 z-30 flex justify-center px-4">
                        <motion.div 
                            initial={{ y: -50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="w-full max-w-xl bg-white p-4 rounded-3xl shadow-2xl border border-slate-100 flex flex-col gap-4"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
                                    <NavigationIcon className="text-white h-5 w-5" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-lg font-black text-slate-900 tracking-tight">Navigation GPS</h2>
                                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Kinshasa Flow Engine</p>
                                </div>
                                <Badge variant="secondary" className="bg-amber-100 text-amber-700 font-bold px-3 py-1 rounded-full border-amber-200">
                                    {STAR_COSTS.NAVIGATION_SESSION} ⭐
                                </Badge>
                            </div>
                            
                            <div className="flex gap-2">
                                <AutocompleteInput 
                                    value={destination} 
                                    onChange={setDestination} 
                                    onSearch={handleAnalyzeRoute}
                                    isLoading={isUnlocking}
                                />
                                <Button 
                                    onClick={handleAnalyzeRoute} 
                                    disabled={isUnlocking || !destination}
                                    className="h-12 px-6 rounded-xl font-black shadow-xl"
                                >
                                    {isUnlocking ? <Loader2 className="animate-spin" /> : "CHERCHER"}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* ── Bottom Info Bar (Nav Mode) ── */}
                <AnimatePresence>
                    {isNavigating && (
                        <motion.div 
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            exit={{ y: 100 }}
                            className="absolute bottom-0 left-0 right-0 z-40 flex justify-center p-4 bg-black/40 backdrop-blur-xl border-t border-white/5"
                        >
                            <div className="w-full max-w-3xl flex items-center justify-between gap-4">
                                <button onClick={() => setIsNavigating(false)} className="h-14 w-14 rounded-full bg-red-600/20 text-red-500 border border-red-600/30 flex items-center justify-center hover:bg-red-600/30 transition-all">
                                    <X className="h-7 w-7" />
                                </button>
                                
                                <div className="flex-1 flex justify-center items-center gap-8">
                                    <div className="text-center">
                                        <p className="text-3xl font-black text-emerald-400">
                                            {routeInfo?.allRoutes?.[selectedRouteIndex]?.durationInTraffic.split(' ')[0] || '--'}
                                            <span className="text-sm ml-1 uppercase">min</span>
                                        </p>
                                        <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-white/50 uppercase tracking-widest mt-1">
                                            <span>{routeInfo?.allRoutes?.[selectedRouteIndex]?.distance || '--'}</span>
                                            <span>•</span>
                                            <span>ETA {format(new Date(Date.now() + (routeInfo?.allRoutes?.[selectedRouteIndex]?.delayMinutes || 0) * 60000), 'HH:mm')}</span>
                                        </div>
                                    </div>
                                </div>

                                <button onClick={handleReCenter} className="h-14 w-14 rounded-full bg-white/10 text-white flex items-center justify-center border border-white/10">
                                    <Compass className="h-7 w-7" />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Floating Controls ── */}
                <div className="absolute right-4 top-32 z-30 flex flex-col gap-4">
                    <button 
                        onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                        className={cn(
                            "h-14 w-14 rounded-full border shadow-2xl flex items-center justify-center transition-all",
                            isAudioEnabled ? "bg-primary border-primary text-white" : "bg-[#1c2331]/90 border-white/10 text-white/70"
                        )}
                    >
                        {isAudioEnabled ? <Volume2 className="h-7 w-7" /> : <VolumeX className="h-7 w-7" />}
                    </button>
                    
                    <button 
                        onClick={handleScanSector}
                        disabled={isScanning}
                        className="h-14 w-14 rounded-full bg-emerald-600 text-white shadow-2xl flex items-center justify-center border border-emerald-500/50 relative overflow-hidden"
                    >
                        {isScanning ? <Loader2 className="h-7 w-7 animate-spin" /> : <Radar className="h-7 w-7" />}
                        {isScanning && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
                    </button>
                </div>

                {/* ── Speedometer ── */}
                <div className="absolute bottom-24 left-6 z-30">
                    <div className="bg-[#1c2331]/90 backdrop-blur-md border border-white/10 h-20 w-20 rounded-full flex flex-col items-center justify-center shadow-2xl ring-4 ring-black/20">
                        <p className="text-3xl font-black text-white leading-none">{speed}</p>
                        <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-1">km/h</p>
                    </div>
                </div>

                {/* ── Smart Whiteboard Overlay ── */}
                <AnimatePresence>
                    {scanResults && (
                        <motion.div 
                            initial={{ x: -400, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -400, opacity: 0 }}
                            className="absolute top-24 left-4 bottom-24 z-50 w-72 bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
                        >
                            <div className="bg-emerald-600 p-6 text-white flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-black uppercase tracking-tight">Whiteboard</h3>
                                    <p className="text-[9px] font-black uppercase opacity-60">Radar 2km Kinshasa</p>
                                </div>
                                <button onClick={() => setScanResults(null)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                {scanResults.length > 0 ? scanResults.map((res, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                        <div className="min-w-0">
                                            <p className="font-bold text-slate-800 text-xs truncate">{res.road}</p>
                                            <p className={cn(
                                                "text-[9px] font-black uppercase",
                                                res.status === 'EMBOUTEILLAGE' ? "text-red-500" :
                                                res.status === 'DENSE' ? "text-orange-500" : "text-emerald-500"
                                            )}>{res.status}</p>
                                        </div>
                                        <div className="text-right shrink-0 ml-2">
                                            <p className="text-[10px] font-black text-slate-400">+{res.delay}m</p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="py-10 text-center space-y-4">
                                        <ShieldCheck className="h-10 w-10 text-emerald-500 mx-auto opacity-20" />
                                        <p className="text-xs font-bold text-slate-400 uppercase">Secteur Fluide</p>
                                    </div>
                                )}
                            </div>
                            <div className="p-6 bg-slate-50 border-t">
                                <Badge className="w-full justify-center py-1.5 bg-primary/10 text-primary border-none text-[8px] font-black">SCAN RÉEL</Badge>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Summary Overlay ── */}
                <AnimatePresence>
                    {showSummary && summaryData && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-50 bg-[#0b121e]/90 backdrop-blur-xl p-4 flex items-center justify-center"
                        >
                            <div className="w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col">
                                <div className="bg-primary p-8 text-white relative">
                                    <button onClick={() => setShowSummary(false)} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors">
                                        <X className="h-6 w-6" />
                                    </button>
                                    <div className="space-y-4">
                                        <Badge className="bg-white/20 border-white/30 text-white font-bold mb-2">DÉTAILS DU TRAJET</Badge>
                                        <h2 className="text-3xl font-black tracking-tight leading-tight">{summaryData.destination}</h2>
                                        
                                        <div className="flex gap-2">
                                            {summaryData.allRoutes?.map((route, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setSelectedRouteIndex(i)}
                                                    className={cn(
                                                        "flex-1 p-4 rounded-2xl border-2 transition-all text-left relative",
                                                        selectedRouteIndex === i ? "bg-white/20 border-white" : "bg-black/10 border-white/10"
                                                    )}
                                                >
                                                    <p className="text-[9px] font-black uppercase mb-1 opacity-70">{route.isSmart ? "Plus Rapide" : "Standard"}</p>
                                                    <p className="text-xl font-black">{route.durationInTraffic}</p>
                                                    {selectedRouteIndex === i && <CheckCircle2 className="absolute top-2 right-2 h-4 w-4" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-8 space-y-6">
                                    <div className="p-6 bg-blue-50 rounded-[1.5rem] border border-blue-100 flex items-start gap-4">
                                        <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                                        <p className="text-sm text-slate-700 font-bold leading-relaxed">{summaryData.recommendation}</p>
                                    </div>

                                    <div className="space-y-3">
                                        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Analyse par tronçons</h3>
                                        {summaryData.segments.slice(0, 3).map((seg, i) => (
                                            <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-2.5 h-2.5 rounded-full",
                                                        seg.status === 'fluide' ? "bg-emerald-500" :
                                                        seg.status === 'congestionné' ? "bg-amber-500" : "bg-red-500"
                                                    )} />
                                                    <p className="font-bold text-slate-700 text-xs">{seg.from}</p>
                                                </div>
                                                {seg.delayMinutes > 0 && <span className="text-[10px] font-black text-red-500">+{seg.delayMinutes}m</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="p-8 bg-slate-50 border-t flex gap-4">
                                    <Button variant="ghost" onClick={() => setShowSummary(false)} className="h-16 rounded-2xl font-black flex-1">RETOUR</Button>
                                    <Button onClick={handleStartNavigation} className="h-16 rounded-2xl bg-primary text-white font-black text-lg flex-[2] shadow-2xl shadow-primary/30 uppercase tracking-widest">
                                        DÉMARRER
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Map Canvas ── */}
                <div className="flex-1 relative">
                    <Map
                        defaultCenter={CONFIG.KINSHASA_CENTER}
                        defaultZoom={13}
                        gestureHandling={'greedy'}
                        disableDefaultUI={true}
                        onDragstart={() => setAutoFollow(false)}
                        onZoomChanged={() => setAutoFollow(false)}
                        className="w-full h-full"
                    >
                        <TrafficLayerComponent />
                        
                        <MapCameraHandler 
                          smoothLocation={smoothLocation}
                          autoFollow={autoFollow}
                          showSummary={showSummary}
                          isNavigating={isNavigating}
                          is3D={is3D}
                          heading={heading}
                        />

                        {smoothLocation && (
                            <Marker
                                position={smoothLocation}
                                icon={{
                                    path: "M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z",
                                    fillColor: '#248eeb',
                                    fillOpacity: 1,
                                    strokeColor: 'white',
                                    strokeWeight: 2,
                                    scale: 2,
                                    rotation: heading,
                                    anchor: (window as any).google?.maps?.Point ? new (window as any).google.maps.Point(12, 12) : undefined
                                } as google.maps.Symbol}
                            />
                        )}

                        <DirectionsHandler 
                            origin={smoothLocation} 
                            destination={destination} 
                            isNavigating={isNavigating}
                            selectedRouteIndex={selectedRouteIndex}
                            onRouteUpdate={onRouteUpdate}
                        />
                        
                        {incidents?.map((incident) => (
                            <Marker 
                                key={incident.id} 
                                position={(incident as any).coords || CONFIG.KINSHASA_CENTER} 
                                label={incident.severity === 'high' ? "🚨" : "⚠️"}
                            />
                        ))}
                    </Map>
                </div>
        </div>
    );
}

function AutocompleteInput({ value, onChange, onSearch, isLoading }: { value: string, onChange: (v: string) => void, onSearch: () => void, isLoading: boolean }) {
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
            if (place.formatted_address || place.name) onChange(place.formatted_address || place.name || '');
        });
    }, [places, onChange]);

    return (
        <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input 
                ref={inputRef}
                placeholder="Où allez-vous à Kinshasa ?" 
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSearch()}
                disabled={isLoading}
                className="pl-12 h-14 rounded-2xl border-none bg-slate-100 font-bold text-slate-800"
            />
        </div>
    );
}

function DirectionsHandler({ origin, destination, isNavigating, selectedRouteIndex, onRouteUpdate }: { 
    origin: {lat: number; lng: number} | null, 
    destination: string, 
    isNavigating: boolean,
    selectedRouteIndex: number,
    onRouteUpdate: (info: RouteInfo) => void
}) {
    const map = useMap();
    const routesLibrary = useMapsLibrary('routes');
    const [renderers, setRenderers] = useState<google.maps.DirectionsRenderer[]>([]);

    useEffect(() => {
        if (!routesLibrary || !map) return;
        
        const g = (window as any).google;
        const r1 = new g.maps.DirectionsRenderer({
            map,
            suppressMarkers: true,
            polylineOptions: { strokeColor: '#3b82f6', strokeWeight: 8, strokeOpacity: 0.5, zIndex: 10 }
        });

        const r2 = new g.maps.DirectionsRenderer({
            map,
            suppressMarkers: true,
            polylineOptions: { strokeColor: '#a855f7', strokeWeight: 12, strokeOpacity: 0.9, zIndex: 20 }
        });

        setRenderers([r1, r2]);
        return () => { r1.setMap(null); r2.setMap(null); };
    }, [routesLibrary, map]);

    useEffect(() => {
        if (!isNavigating || !origin || !destination || !routesLibrary || renderers.length === 0 || !map) return;

        const g = (window as any).google;
        const service = new g.maps.DirectionsService();
        service.route({
            origin: origin,
            destination: destination,
            travelMode: g.maps.TravelMode.DRIVING,
            provideRouteAlternatives: true,
            drivingOptions: { departureTime: new Date(), trafficModel: g.maps.TrafficModel.BEST_GUESS }
        }, (result: any, status: any) => {
            if (status === g.maps.DirectionsStatus.OK && result) {
                const routes = result.routes;
                
                renderers.forEach((r: any, idx: number) => {
                    if (routes[idx]) {
                        r.setMap(map);
                        r.setDirections(result);
                        r.setRouteIndex(idx);
                        r.setOptions({ polylineOptions: { ...r.get('polylineOptions'), strokeOpacity: selectedRouteIndex === idx ? 0.9 : 0.2 }});
                    } else {
                        r.setMap(null);
                    }
                });

                const summaries: RouteSummary[] = routes.slice(0, 2).map((r: any, i: number) => {
                    const l = r.legs[0];
                    return {
                        index: i,
                        distance: l.distance?.text || '',
                        duration: l.duration?.text || '',
                        durationInTraffic: l.duration_in_traffic?.text || l.duration?.text || '',
                        delayMinutes: Math.max(0, Math.round(((l.duration_in_traffic?.value || 0) - (l.duration?.value || 0)) / 60)),
                        isSmart: i > 0
                    };
                });

                const activeLeg = routes[Math.min(selectedRouteIndex, routes.length - 1)].legs[0];
                onRouteUpdate({ 
                    distance: activeLeg.distance?.text || '', 
                    duration: activeLeg.duration?.text || '', 
                    currentStep: activeLeg.steps[0],
                    nextStep: activeLeg.steps[1],
                    allRoutes: summaries,
                });
            }
        });
    }, [isNavigating, origin, destination, routesLibrary, renderers, selectedRouteIndex, onRouteUpdate, map]);

    return null;
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