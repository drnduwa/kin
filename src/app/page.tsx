'use client';

import React, { useState, useEffect } from 'react';
import WelcomePage from '@/components/welcome-page';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';

/**
 * Point d'entrée de l'application.
 * Redirige vers le Chat Communautaire si l'utilisateur est connecté.
 */
export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    // Garantit que le code ne s'exécute que côté client
    setIsMounted(true);
  }, []);

  // Redirection automatique vers le Chat pour les utilisateurs connectés
  useEffect(() => {
    if (isMounted && !isUserLoading && user) {
      // Utilisation d'un timeout léger pour éviter les conflits d'hydratation au démarrage
      const timer = setTimeout(() => {
        router.push('/verifier-trafic');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isMounted, isUserLoading, user, router]);

  // Si non monté, on rend un fond neutre pour éviter les flashs d'hydratation
  if (!isMounted) {
    return <div className="min-h-screen bg-background" />;
  }

  if (isUserLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 w-full bg-background">
        <div className="space-y-8 w-full max-w-md flex flex-col items-center">
            <Skeleton className="h-12 w-48 rounded-2xl" />
            <div className="w-full space-y-4">
                <Skeleton className="h-20 w-full rounded-3xl" />
                <Skeleton className="h-6 w-3/4 mx-auto rounded-full" />
            </div>
            <Skeleton className="h-16 w-56 rounded-2xl mt-8" />
        </div>
      </div>
    );
  }

  // Si l'utilisateur est déjà connecté, on affiche un loader propre pendant la redirection
  if (user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 w-full bg-background">
        <div className="h-12 w-12 rounded-full animate-spin border-4 border-primary border-t-transparent shadow-xl shadow-primary/20" />
        <p className="mt-6 font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 animate-pulse">
            Chargement des prévisions...
        </p>
      </div>
    );
  }

  return <WelcomePage />;
}
