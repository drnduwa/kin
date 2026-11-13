'use client';

import React, { useState, useEffect } from 'react';
import WelcomePage from '@/components/welcome-page';
import { KinLoader } from '@/components/kin/street';
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
      <KinLoader className="min-h-screen w-full bg-[#0B1118]" />
    );
  }

  // Si l'utilisateur est déjà connecté, on affiche un loader propre pendant la redirection
  if (user) {
    return (
      <KinLoader className="min-h-screen w-full bg-[#0B1118]" />
    );
  }

  return <WelcomePage />;
}
