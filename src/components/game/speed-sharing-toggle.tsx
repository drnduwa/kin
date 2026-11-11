'use client';

/** Interrupteur « Partager ma vitesse (anonyme) » : stocké dans le profil (gpsOptIn). */
import { doc, updateDoc } from 'firebase/firestore';
import { Gauge } from 'lucide-react';
import { useUser, useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

export default function SpeedSharingToggle() {
  const { user } = useUser();
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const userRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: profile } = useDoc<any>(userRef);
  if (!profile) return null;
  const on = profile.gpsOptIn === true;

  const toggle = async (value: boolean) => {
    if (!userRef) return;
    try {
      await updateDoc(userRef, { gpsOptIn: value });
      toast({
        title: value ? 'Merci ! Votre vitesse aide toute la ville' : 'Partage de vitesse arrêté',
        description: value ? "Seule la vitesse près des grands carrefours est envoyée, jamais votre trajet. Vous pouvez l'arrêter quand vous voulez." : undefined,
      });
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'enregistrer ce choix.", variant: 'destructive' });
    }
  };

  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex items-start gap-3">
      <Gauge className="h-5 w-5 text-sky-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <label htmlFor="gps-optin" className="font-black text-slate-900 dark:text-white block">Partager ma vitesse (anonyme)</label>
        <p className="text-xs text-slate-500 mt-0.5">
          Pendant que l'app est ouverte, votre vitesse près des 8 grands carrefours est ajoutée à la carte. Votre trajet n'est jamais enregistré,
          et il faut au moins 3 conducteurs pour qu'une vitesse s'affiche. Environ 50 Ko par heure.
        </p>
      </div>
      <Switch id="gps-optin" checked={on} onCheckedChange={toggle} />
    </section>
  );
}
