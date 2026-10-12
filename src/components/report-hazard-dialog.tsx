'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ReportHazardFormValues, reportHazardFormSchema, RoadConditionReport, STAR_COSTS, UserProfile } from '@/lib/types';
import { useFirebase, useUser } from '@/firebase';
import { collection, serverTimestamp, doc, runTransaction, addDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Camera, Loader2, MapPin, Plus, CheckCircle2, Send } from 'lucide-react';
import Image from 'next/image';
import { broadcastEmailAction } from '@/app/actions';

export function ReportHazardDialog({ location }: { location: {lat: number, lng: number} | null }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const { user, firestore, firebaseApp } = useFirebase();
  const { toast } = useToast();

  const form = useForm<ReportHazardFormValues>({
    resolver: zodResolver(reportHazardFormSchema),
    defaultValues: {
      type: 'pothole',
      description: '',
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: ReportHazardFormValues) => {
    if (!user || !location) {
      toast({ title: "Action requise", description: "Veuillez activer votre GPS et vous connecter.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      let imageUrl = "";
      if (data.image && data.image[0]) {
        const storage = getStorage(firebaseApp);
        const file = data.image[0];
        const fileRef = storageRef(storage, `hazards/${user.uid}/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        imageUrl = await getDownloadURL(fileRef);
      }

      const reportData = {
        userId: user.uid,
        userName: user.displayName || "Anonyme",
        type: data.type,
        description: data.description,
        imageUrl,
        coords: location,
        locationName: "Signalement GPS",
        votes: 0,
        status: 'active',
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(firestore, 'road_condition_reports'), reportData);

      // Notification BROADCAST par e-mail
      broadcastEmailAction({
          title: `NOUVEAU DANGER : ${data.type.toUpperCase()}`,
          message: data.description,
          userName: user.displayName || "Un citoyen",
          type: 'hazard',
          location: "Signalement Carte des Dangers"
      });

      toast({ 
        title: "Alerte diffusée !", 
        description: "Merci pour votre contribution à la sécurité routière kinoise." 
      });
      setOpen(false);
      form.reset();
      setImagePreview(null);
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Impossible de publier le rapport.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-xl h-10 px-4 font-black uppercase tracking-widest text-[10px] gap-2 shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" />
          Signaler
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-primary p-8 text-white">
          <DialogTitle className="text-2xl font-black tracking-tight">Signaler un Danger</DialogTitle>
          <DialogDescription className="text-primary-foreground/80 font-medium">Aidez les Kinois à éviter les obstacles.</DialogDescription>
        </div>

        <div className="p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Catégorie</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-12 rounded-xl border-2 border-slate-100 font-bold">
                        <SelectValue placeholder="Type de danger" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="pothole" className="font-bold">🕳️ Nid-de-poule</SelectItem>
                      <SelectItem value="blockage" className="font-bold">🚧 Route Barrée</SelectItem>
                      <SelectItem value="police" className="font-bold">🚓 Présence Policière</SelectItem>
                      <SelectItem value="damaged_road" className="font-bold">⚠️ Route Dégradée</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Détails</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Précisez le danger (ex: Camion en panne, gros trou...)" className="rounded-xl border-2 border-slate-100 min-h-[100px] font-bold" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="image" render={({ field: { onChange, value, ...rest } }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Preuve Photo</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type="file" accept="image/*" className="hidden" id="hazard-image" onChange={(e) => { onChange(e.target.files); handleImageChange(e); }} {...rest} />
                      <label htmlFor="hazard-image" className="flex flex-col items-center justify-center w-full h-32 rounded-2xl border-2 border-dashed border-slate-200 cursor-pointer hover:bg-slate-50 transition-all overflow-hidden bg-slate-50/50">
                        {imagePreview ? (
                          <Image src={imagePreview} alt="Preview" fill className="object-cover" />
                        ) : (
                          <>
                            <Camera className="h-8 w-8 text-slate-300 mb-2" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Prendre une photo</span>
                          </>
                        )}
                      </label>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 p-2 rounded-lg text-white">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-blue-900 uppercase leading-none mb-1">Impact Communautaire</p>
                    <p className="text-[9px] text-blue-700 font-bold">Signalement géolocalisé diffusé aux usagers</p>
                  </div>
                </div>
                <span className="text-xs font-black text-blue-600 bg-white px-2.5 py-1 rounded-full border border-blue-200">Live GPS</span>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={isSubmitting || !location} className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20">
                  {isSubmitting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Send className="mr-2 h-5 w-5" />}
                  Diffuser l'Alerte
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
