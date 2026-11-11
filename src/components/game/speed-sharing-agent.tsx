'use client';

/**
 * Agent invisible : si l'usager a activé « Partager ma vitesse », il relève sa position pendant
 * que l'app est visible et envoie une courte trace toutes les 60 s. Le serveur n'en garde que
 * des vitesses agrégées par carrefour.
 */
import { useEffect, useRef } from 'react';
import { doc } from 'firebase/firestore';
import { useUser, useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { submitSpeedProbesAction } from '@/app/scale-actions';

export default function SpeedSharingAgent() {
  const { user } = useUser();
  const { firestore } = useFirebase();
  const userRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: profile } = useDoc<any>(userRef);
  const buffer = useRef<Array<{ lat: number; lng: number; t: number }>>([]);
  const enabled = !!user && profile?.gpsOptIn === true;

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.geolocation) return;
    let watchId: number | null = null;

    const start = () => {
      if (watchId !== null || document.visibilityState !== 'visible') return;
      watchId = navigator.geolocation.watchPosition(
        p => {
          buffer.current.push({ lat: p.coords.latitude, lng: p.coords.longitude, t: p.timestamp || Date.now() });
          if (buffer.current.length > 40) buffer.current.splice(0, buffer.current.length - 40);
        },
        () => { /* refus ou erreur : on n'insiste pas */ },
        { enableHighAccuracy: false, maximumAge: 15000, timeout: 30000 },
      );
    };
    const stop = () => { if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; } };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(async () => {
      const samples = buffer.current.splice(0);
      if (samples.length < 3 || !user) return;
      try {
        await submitSpeedProbesAction({ idToken: await user.getIdToken(), samples });
      } catch { /* réseau : on réessaiera au prochain cycle */ }
    }, 60_000);

    return () => { stop(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [enabled, user]);

  return null;
}
