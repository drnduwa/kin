'use client';

import React, { useEffect, useState } from 'react';
import { Map, useMap } from '@vis.gl/react-google-maps';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Lock, Star, Loader2, Map as MapIcon, X } from 'lucide-react';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';
import { STAR_COSTS, UserProfile, isUserSubscribedOrHasPass } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { CONFIG } from '@/lib/config';

const TrafficLayerComponent = () => {
    const map = useMap();
    useEffect(() => {
        if (!map) return;
        const g = (window as any).google;
        if (!g) return;
        const trafficLayer = new g.maps.TrafficLayer();
        trafficLayer.setMap(map);
        return () => trafficLayer.setMap(null);
    }, [map]);
    return null;
};

export default function TrafficMap() {
    const [searchQuery, setSearchQuery] = useState('');
    const [center, setCenter] = useState(CONFIG.KINSHASA_CENTER);
    const [zoom, setZoom] = useState(15);
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isUnlocking, setIsUnlocking] = useState(false);

    const { user, firestore } = useFirebase();
    const { toast } = useToast();

    const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: profile } = useDoc<UserProfile>(userRef);

    useEffect(() => {
        if (isUserSubscribedOrHasPass(profile)) {
            setIsUnlocked(true);
        }
    }, [profile]);

    const handleUnlock = async () => {
        if (!user || !profile) return;

        if (isUserSubscribedOrHasPass(profile)) {
            setIsUnlocked(true);
            return;
        }

        if (profile.currentStarsBalance < STAR_COSTS.MAP_VIEW) {
            toast({
                title: "Solde insuffisant",
                description: `L'accès à la carte premium coûte ${STAR_COSTS.MAP_VIEW} stars. Rechargez votre compte ou activez un Pass Illimité.`,
                variant: "destructive",
                action: <Button asChild variant="outline" size="sm"><Link href="/mes-stars">Boutique</Link></Button>
            });
            return;
        }

        setIsUnlocking(true);
        try {
            await runTransaction(firestore, async (transaction) => {
                const userDoc = await transaction.get(userRef!);
                const data = userDoc.data() as UserProfile;
                const newBalance = data.currentStarsBalance - STAR_COSTS.MAP_VIEW;
                
                transaction.update(userRef!, {
                    currentStarsBalance: newBalance,
                    totalStarsUsed: (data.totalStarsUsed || 0) + STAR_COSTS.MAP_VIEW
                });

                const starTransRef = doc(collection(userRef!, 'star_transactions'));
                transaction.set(starTransRef, {
                    userId: user.uid,
                    type: 'spent',
                    starsChange: -STAR_COSTS.MAP_VIEW,
                    balanceAfterTransaction: newBalance,
                    description: "Accès Carte Premium (Session)",
                    timestamp: serverTimestamp(),
                });
            });
            setIsUnlocked(true);
            toast({ title: "Carte déverrouillée !", description: "Bonne navigation sur les routes de Kinshasa." });
        } catch (error) {
            toast({ title: "Erreur", description: "Impossible de déverrouiller la carte.", variant: "destructive" });
        } finally {
            setIsUnlocking(false);
        }
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim() || !isUnlocked) return;

        try {
            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&key=${CONFIG.GOOGLE_MAPS_API_KEY}&components=country:CD&bounds=-4.55,15.15|-4.1,15.6`);
            const data = await response.json();
            if (data.status === 'OK' && data.results[0]) {
                const location = data.results[0].geometry.location;
                setCenter(location);
                setZoom(16);
            }
        } catch (error) {
            console.error('Error during geocoding API call:', error);
        }
    };

    return (
        <div className="w-full h-full rounded-3xl overflow-hidden shadow-2xl relative bg-slate-900">
            <AnimatePresence>
                {!isUnlocked && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-20 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 text-center"
                    >
                        <div className="max-w-md space-y-8">
                            <div className="bg-primary/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto ring-4 ring-primary/20">
                                <MapIcon className="h-12 w-12 text-primary" />
                            </div>
                            <div className="space-y-3">
                                <h2 className="text-3xl font-black text-white tracking-tight">Vue d'ensemble Premium</h2>
                                <p className="text-slate-400 font-medium">Visualisez le trafic en temps réel sur toute la ville de Kinshasa avec précision.</p>
                            </div>
                            
                            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 space-y-6">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Coût d'accès</span>
                                    <Badge className="bg-amber-500 text-white font-black px-4 py-1 text-lg rounded-full shadow-lg shadow-amber-500/20">
                                        {STAR_COSTS.MAP_VIEW} ⭐
                                    </Badge>
                                </div>
                                <Button 
                                    onClick={handleUnlock} 
                                    disabled={isUnlocking}
                                    className="w-full h-16 rounded-xl text-xl font-black shadow-2xl shadow-primary/40 hover:scale-[1.02] transition-transform"
                                >
                                    {isUnlocking ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Lock className="mr-2" />}
                                    Déverrouiller la ville
                                </Button>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Votre solde : {profile?.currentStarsBalance || 0} stars</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {isUnlocked && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-4">
                    <form onSubmit={handleSearch} className="flex w-full items-center gap-2">
                        <Input 
                            type="text"
                            placeholder="Rechercher une avenue (ex: Nguma)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-white/90 backdrop-blur-md shadow-2xl rounded-xl h-12 border-none font-bold"
                        />
                        <Button type="submit" size="icon" className="h-12 w-12 shadow-2xl rounded-xl">
                            <Search className="h-5 w-5" />
                        </Button>
                    </form>
                </div>
            )}

            <Map
                zoom={zoom}
                center={center}
                onZoomChanged={(e) => setZoom(e.detail.zoom)}
                onCenterChanged={(e) => setCenter(e.detail.center)}
                gestureHandling={'greedy'}
                disableDefaultUI={true}
                className="w-full h-full"
            >
                <TrafficLayerComponent />
            </Map>
        </div>
    );
}