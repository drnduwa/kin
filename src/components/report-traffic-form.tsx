'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
  Camera, 
  Send, 
  Loader2, 
  MapPin, 
  AlertTriangle, 
  CheckCircle2, 
  LocateFixed,
  Construction,
  Waves,
  Siren,
  Car,
  Flame,
  ShieldAlert,
  Sparkles,
  X,
  Truck,
  Zap
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { STAR_COSTS, UserProfile } from '@/lib/types';
import { useFirebase, useUser } from '@/firebase';
import { collection, serverTimestamp, doc, runTransaction } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { broadcastEmailAction } from '@/app/actions';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// Incident Presets with 1-click selection
const INCIDENT_TYPES = [
  { id: 'bouchon', label: 'Gros Bouchon', icon: Flame, color: 'bg-red-500 text-white shadow-red-500/30', severity: 'high', defaultDesc: 'Gros bouchon, circulation très ralentie.' },
  { id: 'ralentissement', label: 'Ralentissement', icon: Car, color: 'bg-amber-500 text-white shadow-amber-500/30', severity: 'medium', defaultDesc: 'Ralentissement inhabituel, avance au pas.' },
  { id: 'accident', label: 'Accident', icon: AlertTriangle, color: 'bg-rose-600 text-white shadow-rose-600/30', severity: 'high', defaultDesc: 'Accident sur la chaussée, passage difficile.' },
  { id: 'chantier', label: 'Travaux / Chantier', icon: Construction, color: 'bg-orange-500 text-white shadow-orange-500/30', severity: 'medium', defaultDesc: 'Travaux en cours, voie rétrécie.' },
  { id: 'nid_de_poule', label: 'Nid-de-Poule Profond', icon: ShieldAlert, color: 'bg-yellow-600 text-white shadow-yellow-600/30', severity: 'medium', defaultDesc: 'Chaussée très dégradée / nids-de-poule.' },
  { id: 'inondation', label: 'Inondation / Eau', icon: Waves, color: 'bg-blue-600 text-white shadow-blue-600/30', severity: 'high', defaultDesc: 'Route inondée, passage délicat pour petites berlines.' },
  { id: 'police', label: 'Contrôle Police', icon: Siren, color: 'bg-indigo-600 text-white shadow-indigo-600/30', severity: 'medium', defaultDesc: 'Contrôle routier / ralentissement.' },
  { id: 'panne', label: 'Camion en Panne', icon: Truck, color: 'bg-slate-800 text-white shadow-slate-800/30', severity: 'high', defaultDesc: 'Poids-lourd en panne bloquant une voie.' }
];

// Quick Kinshasa Hotspot Chips for 1-Click Location
const QUICK_HOTSPOTS = [
  'Échangeur de Limete',
  'Kintambo Magasin',
  'Route de Matadi (UPN)',
  'Rond-Point Mandela (30 Juin)',
  'Carrefour Victoire (Kalamu)',
  'Rond-Point Ngaba',
  'Masina Pascal',
  'By-Pass Salongo',
  'Avenue des Huileries',
  'Gare Centrale'
];

// Quick Situation Tags (No typing required!)
const QUICK_TAGS = [
  'Bloqué dans les 2 sens',
  'Avance au pas',
  'Passage sur 1 voie',
  'Route coupée',
  'Praticable pour 4x4 uniquement',
  'Circulation fluide'
];

export default function ReportTrafficForm() {
  const { toast } = useToast();
  const router = useRouter();
  const { firestore, firebaseApp } = useFirebase();
  const { user } = useUser();

  const [selectedType, setSelectedType] = useState(INCIDENT_TYPES[0]);
  const [location, setLocation] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customDesc, setCustomDesc] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-locate GPS position on mount if available
  useEffect(() => {
    if (navigator.geolocation && !location) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation('Ma position GPS actuelle');
          setIsLocating(false);
        },
        () => {
          setIsLocating(false);
        }
      );
    }
  }, []);

  const handleUseGPS = () => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation(`Position GPS (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
          setIsLocating(false);
          toast({ title: "Position GPS détectée !" });
        },
        () => {
          setIsLocating(false);
          toast({ title: "GPS indisponible", description: "Veuillez choisir un lieu dans la liste.", variant: "destructive" });
        }
      );
    }
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handlePictureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({ title: 'Veuillez vous connecter', variant: 'destructive' });
      router.push('/login');
      return;
    }

    const finalLocation = location.trim() || 'Kinshasa (Position détectée)';
    const combinedDescription = [
      selectedType.defaultDesc,
      selectedTags.join(' • '),
      customDesc.trim()
    ].filter(Boolean).join(' — ');

    setIsSubmitting(true);
    try {
      let pictureUrl = "";
      if (imagePreview) {
        const storage = getStorage(firebaseApp);
        const fileRef = storageRef(storage, `reports/${user.uid}/${Date.now()}.jpg`);
        await uploadString(fileRef, imagePreview, 'data_url');
        pictureUrl = await getDownloadURL(fileRef);
      }

      const eventData = {
        location: finalLocation,
        description: combinedDescription,
        severity: selectedType.severity,
        incidentType: selectedType.id,
        userId: user.uid,
        user: user.isAnonymous ? "Conducteur Anonyme" : (user.displayName || "Conducteur K-Flow"),
        userAvatar: user.photoURL || "",
        picture: pictureUrl,
        createdAt: serverTimestamp(),
      };

      const eventsCollection = collection(firestore, 'events');
      
      // Credit Stars transaction
      await runTransaction(firestore, async (transaction) => {
        const userRef = doc(firestore, 'users', user.uid);
        const userDoc = await transaction.get(userRef);
        const profile = userDoc.data() as UserProfile;
        
        const reward = STAR_COSTS.REPORT_HAZARD_REWARD || 10;
        const newBalance = (profile?.currentStarsBalance || 0) + reward;
        
        transaction.update(userRef, { 
          currentStarsBalance: newBalance, 
          totalStarsEarned: (profile?.totalStarsEarned || 0) + reward 
        });
        
        const newEventRef = doc(eventsCollection);
        transaction.set(newEventRef, eventData);
      });

      // Broadcast Email Alert in background
      try {
        await broadcastEmailAction({
          title: `ALERTE : ${selectedType.label.toUpperCase()} (${finalLocation})`,
          message: combinedDescription,
          userName: user.displayName || "Un conducteur K-Flow",
          type: 'report',
          location: finalLocation
        });
      } catch (_) {}

      toast({ 
        title: `Signalement envoyé ! (+${STAR_COSTS.REPORT_HAZARD_REWARD || 10} ⭐)`,
        description: "Merci de contribuer à la fluidité de Kinshasa."
      });

      router.push('/reports');
    } catch (error: any) {
      console.error("Error submitting report:", error);
      toast({ 
        title: "Erreur d'envoi", 
        description: "Veuillez vérifier votre connexion Internet.", 
        variant: "destructive" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full border-none shadow-2xl rounded-3xl md:rounded-[2.5rem] overflow-hidden bg-white">
      
      {/* ── Header ── */}
      <CardHeader className="bg-gradient-to-r from-primary via-blue-600 to-indigo-700 p-6 sm:p-8 text-white relative">
        <div className="relative z-10 space-y-1.5">
          <div className="flex items-center justify-between">
            <Badge className="bg-white/20 text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 border-none">
              SIGNALEMENT RAPIDE EN 1 CLIC
            </Badge>
            <span className="text-xs font-black text-amber-300 bg-black/20 px-3 py-1 rounded-full flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 fill-amber-300" />
              +{STAR_COSTS.REPORT_HAZARD_REWARD || 10} Stars
            </span>
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
            Signaler un Incident
          </CardTitle>
          <CardDescription className="text-white/85 text-xs sm:text-sm font-medium">
            Touchez les icônes pour alerter instantanément les autres conducteurs kinois sans perdre de temps.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-7 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── 1. NATURE DE L'INCIDENT (1-Click Big Visual Grid) ── */}
          <div className="space-y-2.5">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              1. Que se passe-t-il ? (Touchez une icône)
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {INCIDENT_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = selectedType.id === type.id;
                return (
                  <button
                    type="button"
                    key={type.id}
                    onClick={() => setSelectedType(type)}
                    className={cn(
                      "flex flex-col items-center justify-center p-3 sm:p-3.5 rounded-2xl border-2 text-center transition-all relative overflow-hidden group",
                      isSelected
                        ? cn("border-transparent shadow-lg scale-105 font-black ring-4 ring-primary/20", type.color)
                        : "border-slate-200/80 bg-slate-50/60 hover:bg-slate-100 text-slate-700"
                    )}
                  >
                    <Icon className={cn("h-6 w-6 mb-1.5 transition-transform group-hover:scale-110", isSelected ? "text-white" : "text-slate-600")} />
                    <span className="text-xs font-black leading-tight">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 2. LOCALISATION EN 1 CLIC ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                2. Où êtes-vous ?
              </label>

              <button
                type="button"
                onClick={handleUseGPS}
                disabled={isLocating}
                className="text-xs font-black text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-3 py-1 rounded-xl transition-colors"
              >
                {isLocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                <span>Auto-GPS</span>
              </button>
            </div>

            {/* Quick Hotspot Chips */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
              {QUICK_HOTSPOTS.map((hotspot) => {
                const isSelected = location === hotspot;
                return (
                  <button
                    type="button"
                    key={hotspot}
                    onClick={() => setLocation(hotspot)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 border",
                      isSelected 
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm scale-105 font-black" 
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {hotspot}
                  </button>
                );
              })}
            </div>

            {/* Optional Location Input */}
            <Input 
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ou saisissez le nom de la rue / commune..."
              className="h-12 rounded-2xl border-2 border-slate-100 bg-slate-50/50 font-bold text-xs sm:text-sm"
              disabled={isSubmitting}
            />
          </div>

          {/* ── 3. SITUATION RAPIDE PAR TAGS (No Typing!) ── */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              3. Détails rapides (Optionnel)
            </label>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition-all border",
                      isSelected
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm font-black"
                        : "bg-slate-100/80 text-slate-600 border-transparent hover:bg-slate-200"
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 4. PREUVE PHOTO (GROS BOUTON CAMÉRA TACTILE) ── */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Camera className="h-3.5 w-3.5 text-primary" />
              4. Photo du terrain (Optionnel)
            </label>

            <div className="relative">
              <input 
                type="file" 
                accept="image/*" 
                capture="environment"
                className="hidden" 
                id="photo-upload" 
                onChange={handlePictureChange} 
                disabled={isSubmitting} 
              />

              <label 
                htmlFor="photo-upload" 
                className="flex flex-col items-center justify-center w-full h-36 sm:h-40 border-2 border-dashed border-slate-300 hover:border-primary rounded-3xl cursor-pointer bg-slate-50/60 hover:bg-slate-100/80 transition-all overflow-hidden relative group"
              >
                {imagePreview ? (
                  <div className="relative w-full h-full">
                    <Image src={imagePreview} alt="Aperçu photo" fill className="object-cover" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Badge className="bg-emerald-500 text-white font-black text-xs gap-1.5 py-1 px-3">
                        <CheckCircle2 className="h-4 w-4" />
                        Photo prête (Changer)
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center p-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Camera className="h-6 w-6" />
                    </div>
                    <p className="text-xs font-black text-slate-800">Touchez pour prendre une photo en direct</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">Appareil photo ou galerie</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* ── 5. GROS BOUTON ENVOI RAPIDE ── */}
          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full h-15 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/25 transition-all hover:scale-[1.01] active:scale-95 gap-3"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Diffusion de l'alerte...</span>
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                <span>Diffuser l'Alerte (+10 ⭐)</span>
              </>
            )}
          </Button>

        </form>
      </CardContent>

    </Card>
  );
}
