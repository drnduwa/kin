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
  ArrowRight,
  ArrowLeft,
  Truck,
  Zap,
  Check,
  Navigation,
  Compass
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
import Link from 'next/link';

// Incident Presets with 1-click selection
const INCIDENT_TYPES = [
  { id: 'bouchon', label: 'Gros Bouchon', icon: Flame, color: 'bg-red-500 text-white shadow-red-500/30', borderActive: 'border-red-500 ring-red-500/20', severity: 'high', defaultDesc: 'Gros bouchon, circulation très ralentie.' },
  { id: 'ralentissement', label: 'Ralentissement', icon: Car, color: 'bg-amber-500 text-white shadow-amber-500/30', borderActive: 'border-amber-500 ring-amber-500/20', severity: 'medium', defaultDesc: 'Ralentissement inhabituel, avance au pas.' },
  { id: 'accident', label: 'Accident', icon: AlertTriangle, color: 'bg-rose-600 text-white shadow-rose-600/30', borderActive: 'border-rose-600 ring-rose-600/20', severity: 'high', defaultDesc: 'Accident sur la chaussée, passage difficile.' },
  { id: 'chantier', label: 'Travaux / Chantier', icon: Construction, color: 'bg-orange-500 text-white shadow-orange-500/30', borderActive: 'border-orange-500 ring-orange-500/20', severity: 'medium', defaultDesc: 'Travaux en cours, voie rétrécie.' },
  { id: 'nid_de_poule', label: 'Nid-de-Poule Profond', icon: ShieldAlert, color: 'bg-yellow-600 text-white shadow-yellow-600/30', borderActive: 'border-yellow-600 ring-yellow-600/20', severity: 'medium', defaultDesc: 'Chaussée très dégradée / nids-de-poule.' },
  { id: 'inondation', label: 'Inondation / Eau', icon: Waves, color: 'bg-blue-600 text-white shadow-blue-600/30', borderActive: 'border-blue-600 ring-blue-600/20', severity: 'high', defaultDesc: 'Route inondée, passage délicat pour petites berlines.' },
  { id: 'police', label: 'Contrôle Police', icon: Siren, color: 'bg-indigo-600 text-white shadow-indigo-600/30', borderActive: 'border-indigo-600 ring-indigo-600/20', severity: 'medium', defaultDesc: 'Contrôle routier / ralentissement.' },
  { id: 'panne', label: 'Camion en Panne', icon: Truck, color: 'bg-slate-800 text-white shadow-slate-800/30', borderActive: 'border-slate-800 ring-slate-800/20', severity: 'high', defaultDesc: 'Poids-lourd en panne bloquant une voie.' }
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

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 50 : -50,
    opacity: 0,
    scale: 0.98
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: { duration: 0.25, ease: 'easeOut' }
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -50 : 50,
    opacity: 0,
    scale: 0.98,
    transition: { duration: 0.2, ease: 'easeIn' }
  })
};

export default function ReportTrafficForm() {
  const { toast } = useToast();
  const router = useRouter();
  const { firestore, firebaseApp } = useFirebase();
  const { user } = useUser();

  const [step, setStep] = useState<number>(1);
  const [direction, setDirection] = useState<number>(1);

  const [selectedType, setSelectedType] = useState(INCIDENT_TYPES[0]);
  const [location, setLocation] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customDesc, setCustomDesc] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Auto-detect GPS position on mount
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

  const goToNextStep = () => {
    setDirection(1);
    setStep(prev => Math.min(3, prev + 1));
  };

  const goToPrevStep = () => {
    setDirection(-1);
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleSelectType = (type: typeof INCIDENT_TYPES[0]) => {
    setSelectedType(type);
    // Smoothly auto-advance to step 2 after a tiny tap delay for great UX
    setTimeout(() => {
      setDirection(1);
      setStep(2);
    }, 250);
  };

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

  const handleSubmit = async () => {
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

      setIsSuccess(true);
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

  // SUCCESS SCREEN
  if (isSuccess) {
    return (
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full"
      >
        <Card className="border-none shadow-2xl rounded-3xl md:rounded-[2.5rem] overflow-hidden bg-white text-center p-6 sm:p-10 space-y-6">
          <div className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/30 animate-bounce">
            <Check className="h-10 w-10 stroke-[3]" />
          </div>

          <div className="space-y-2">
            <Badge className="bg-amber-500 text-slate-950 font-black text-xs px-3 py-1 uppercase tracking-wider border-none">
              +{STAR_COSTS.REPORT_HAZARD_REWARD || 10} Stars Créditées ⭐
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Signalement Diffusé en Direct !
            </h2>
            <p className="text-sm text-slate-500 font-medium max-w-md mx-auto">
              Votre alerte a été transmise à l'ensemble de la communauté de Kinshasa pour fluidifier le trafic.
            </p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 max-w-md mx-auto text-left space-y-1.5 text-xs">
            <div className="flex items-center justify-between font-bold">
              <span className="text-slate-400">Incident :</span>
              <span className="font-black text-slate-900">{selectedType.label}</span>
            </div>
            <div className="flex items-center justify-between font-bold">
              <span className="text-slate-400">Lieu :</span>
              <span className="font-black text-slate-900">{location || 'Position détectée'}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button asChild className="w-full sm:w-auto h-12 rounded-2xl bg-primary text-white font-black px-6 shadow-lg shadow-primary/20 gap-2">
              <Link href="/reports">
                <Compass className="h-4 w-4" />
                <span>Voir le Baromètre Trafic</span>
              </Link>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsSuccess(false);
                setStep(1);
                setLocation('');
                setSelectedTags([]);
                setImagePreview(null);
              }}
              className="w-full sm:w-auto h-12 rounded-2xl font-bold border-2"
            >
              Signaler un autre incident
            </Button>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <Card className="w-full border-none shadow-2xl rounded-3xl md:rounded-[2.5rem] overflow-hidden bg-white">
      
      {/* ── Header & Step Progress Bar ── */}
      <CardHeader className="bg-gradient-to-r from-primary via-blue-600 to-indigo-700 p-5 sm:p-7 text-white relative">
        <div className="relative z-10 space-y-3">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-white/20 text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 border-none">
                ÉTAPE {step} SUR 3
              </Badge>
              {step > 1 && (
                <button 
                  onClick={goToPrevStep}
                  className="text-xs font-bold text-white/80 hover:text-white flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" /> Retour
                </button>
              )}
            </div>

            <span className="text-xs font-black text-amber-300 bg-black/20 px-2.5 py-1 rounded-full flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 fill-amber-300" />
              +{STAR_COSTS.REPORT_HAZARD_REWARD || 10} Stars
            </span>
          </div>

          <div>
            <CardTitle className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
              {step === 1 && "1. Quel est le problème ?"}
              {step === 2 && "2. Où se situe l'incident ?"}
              {step === 3 && "3. Preuve photo & Détails"}
            </CardTitle>
            <CardDescription className="text-white/85 text-xs font-medium pt-0.5">
              {step === 1 && "Touchez une icône pour sélectionner la nature de l'incident."}
              {step === 2 && "Utilisez le GPS ou choisissez un carrefour de Kinshasa."}
              {step === 3 && "Prenez une photo ou envoyez directement votre signalement."}
            </CardDescription>
          </div>

          {/* Stepper Progress Bar */}
          <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-amber-400 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>

        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-7 min-h-[340px] flex flex-col justify-between">
        <AnimatePresence mode="wait" custom={direction}>
          
          {/* ════════ STEP 1 : TYPE D'INCIDENT ════════ */}
          {step === 1 && (
            <motion.div
              key="step1"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {INCIDENT_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = selectedType.id === type.id;
                  return (
                    <button
                      type="button"
                      key={type.id}
                      onClick={() => handleSelectType(type)}
                      className={cn(
                        "flex flex-col items-center justify-center p-3.5 sm:p-4 rounded-2xl border-2 text-center transition-all relative overflow-hidden group",
                        isSelected
                          ? cn("border-transparent shadow-lg scale-105 font-black ring-4 ring-primary/20", type.color)
                          : "border-slate-200/80 bg-slate-50/60 hover:bg-slate-100 text-slate-700"
                      )}
                    >
                      <Icon className={cn("h-7 w-7 mb-2 transition-transform group-hover:scale-110", isSelected ? "text-white" : "text-slate-600")} />
                      <span className="text-xs font-black leading-tight">{type.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 flex justify-end">
                <Button 
                  onClick={goToNextStep}
                  className="w-full sm:w-auto h-12 rounded-2xl bg-primary text-white font-black px-6 gap-2 shadow-md shadow-primary/20"
                >
                  <span>Continuer</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ════════ STEP 2 : LOCALISATION ════════ */}
          {step === 2 && (
            <motion.div
              key="step2"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              {/* Auto GPS Trigger */}
              <div className="bg-primary/5 border-2 border-primary/20 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
                    <LocateFixed className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900">Position GPS Automatique</p>
                    <p className="text-[11px] text-slate-500 font-medium truncate max-w-[200px] sm:max-w-xs">
                      {location || "Non détectée"}
                    </p>
                  </div>
                </div>

                <Button 
                  type="button" 
                  size="sm" 
                  onClick={handleUseGPS}
                  disabled={isLocating}
                  className="rounded-xl h-9 font-black text-xs bg-primary text-white shrink-0 gap-1"
                >
                  {isLocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                  <span>Actualiser</span>
                </Button>
              </div>

              {/* Quick Hotspot Chips */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                  Ou touchez un grand carrefour de Kinshasa :
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                  {QUICK_HOTSPOTS.map((hotspot) => {
                    const isSelected = location === hotspot;
                    return (
                      <button
                        type="button"
                        key={hotspot}
                        onClick={() => setLocation(hotspot)}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0",
                          isSelected 
                            ? "bg-slate-900 text-white border-slate-900 shadow-sm scale-105 font-black" 
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                        )}
                      >
                        {hotspot}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Manual Input */}
              <Input 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ou tapez une rue / quartier..."
                className="h-12 rounded-2xl border-2 border-slate-200 bg-slate-50/50 font-bold text-xs sm:text-sm"
              />

              <div className="pt-2 flex items-center justify-between gap-3">
                <Button 
                  variant="outline" 
                  onClick={goToPrevStep}
                  className="h-12 rounded-2xl font-bold px-4 border-2"
                >
                  Précédent
                </Button>

                <Button 
                  onClick={goToNextStep}
                  className="h-12 rounded-2xl bg-primary text-white font-black px-6 gap-2 shadow-md shadow-primary/20"
                >
                  <span>Continuer</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ════════ STEP 3 : PHOTO & CONFIRMATION ════════ */}
          {step === 3 && (
            <motion.div
              key="step3"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              {/* Quick Tags Chips */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                  Précisions rapides (Optionnel) :
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
                            : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200"
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Big Direct Camera Trigger */}
              <div className="relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  id="photo-step-upload" 
                  onChange={handlePictureChange} 
                  disabled={isSubmitting} 
                />

                <label 
                  htmlFor="photo-step-upload" 
                  className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-300 hover:border-primary rounded-3xl cursor-pointer bg-slate-50/70 hover:bg-slate-100 transition-all overflow-hidden relative group"
                >
                  {imagePreview ? (
                    <div className="relative w-full h-full">
                      <Image src={imagePreview} alt="Aperçu photo" fill className="object-cover" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <Badge className="bg-emerald-500 text-white font-black text-xs gap-1.5 py-1 px-3">
                          <CheckCircle2 className="h-4 w-4" />
                          Photo attachée (Changer)
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center p-3">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                        <Camera className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-black text-slate-800">Prendre une photo en direct</p>
                      <p className="text-[10px] text-slate-400 font-medium">Touchez pour ouvrir la caméra</p>
                    </div>
                  )}
                </label>
              </div>

              {/* Big Submit Button */}
              <div className="pt-2 flex items-center gap-3">
                <Button 
                  variant="outline" 
                  onClick={goToPrevStep}
                  disabled={isSubmitting}
                  className="h-14 rounded-2xl font-bold px-4 border-2"
                >
                  Précédent
                </Button>

                <Button 
                  onClick={handleSubmit} 
                  disabled={isSubmitting}
                  className="flex-1 h-14 rounded-2xl text-base font-black uppercase tracking-wider bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/25 transition-all hover:scale-[1.01] active:scale-95 gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Envoi en cours...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      <span>Diffuser (+10 ⭐)</span>
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </CardContent>

    </Card>
  );
}
