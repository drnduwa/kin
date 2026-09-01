
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Bell, Loader2, Sparkles, CheckCircle2, X } from 'lucide-react';
import { saveSubscription, saveFCMToken } from '@/lib/push';
import { useFirebase } from '@/firebase';
import { firebaseConfig } from '@/firebase/config';
import { getToken, onMessage } from 'firebase/messaging';
import { motion, AnimatePresence } from 'framer-motion';

export function NotificationPermission() {
  const { user, firestore, messaging } = useFirebase();
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported' | 'loading'>('loading');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem('dismissed_notification_prompt');
      setIsDismissed(dismissed === 'true');
      if ('Notification' in window && 'serviceWorker' in navigator) {
        setPermission(Notification.permission);
      } else {
        setPermission('unsupported');
      }
    }
  }, []);

  useEffect(() => {
    if (messaging) {
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Notification reçue au premier plan:', payload);
        toast({
          title: payload.notification?.title || 'Kinshasa Flow',
          description: payload.notification?.body || 'Mise à jour reçue.',
        });
      });
      return () => unsubscribe();
    }
  }, [messaging, toast]);

  const subscribeUser = async () => {
    if (!user || !messaging) return;
    
    // Une clé VAPID valide est requise pour éviter l'erreur "65 bytes".
    // Si la clé n'est pas définie dans .env, nous utilisons un format de secours 
    // mais le build échouera sans une clé réelle générée via web-push generate-vapid-keys.
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY || "BMv7Y_PlaceHolder_VAPID_Key_Should_Be_87_Chars_Long_For_Full_Compatibility_123456789"; 

    setIsSubscribing(true);

    try {
      // 1. Enregistrement explicite du Service Worker pour FCM
      const swParams = new URLSearchParams({
        apiKey: firebaseConfig.apiKey || '',
        projectId: firebaseConfig.projectId || '',
        messagingSenderId: firebaseConfig.messagingSenderId || '',
        appId: firebaseConfig.appId || '',
        authDomain: firebaseConfig.authDomain || '',
        storageBucket: firebaseConfig.storageBucket || '',
      });
      const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${swParams.toString()}`, {
        scope: '/firebase-cloud-messaging-push-scope'
      });
      
      console.log('Service Worker enregistré avec succès pour FCM');

      // 2. Récupération du Token FCM
      const currentToken = await getToken(messaging, {
        vapidKey: vapidKey,
        serviceWorkerRegistration: registration
      });

      if (currentToken) {
        await saveFCMToken(firestore, user.uid, currentToken);
        console.log('Token FCM enregistré avec succès.');
        
        // 3. Optionnel: Enregistrement Web Push standard (Fallback)
        try {
          const sub = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidKey
          });
          if (sub) {
            await saveSubscription(firestore, user.uid, sub.toJSON());
          }
        } catch (e) {
          console.warn('Standard Web Push failed, FCM active only.');
        }

        setPermission('granted');
        toast({ 
          title: 'Mode Background Actif !', 
          description: 'Vous recevrez les alertes même si l\'application est fermée.' 
        });
      }
    } catch (error) {
      console.error('Erreur d\'activation des notifications:', error);
      toast({ 
        title: 'Erreur VAPID', 
        description: "Clé VAPID invalide ou format incorrect. Vérifiez vos variables d'environnement.", 
        variant: 'destructive' 
      });
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dismissed_notification_prompt', 'true');
    }
  };

  if (!user || isDismissed || permission === 'loading' || permission === 'granted' || permission === 'unsupported') {
    return null;
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-white/95 backdrop-blur-md border border-primary/20 p-3 sm:p-4 flex items-center justify-between gap-3 shadow-md relative z-30 mb-2 rounded-2xl shrink-0"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="bg-primary/10 p-2 sm:p-2.5 rounded-xl shrink-0">
          <Bell className="text-primary h-5 w-5 animate-pulse" />
        </div>
        <div className="min-w-0">
          <p className="font-black text-slate-900 text-xs sm:text-sm tracking-tight truncate">Alertes Trafic Kinshasa</p>
          <p className="text-slate-500 font-medium text-[10px] sm:text-xs truncate">Recevez des alertes pop-up sur les bouchons en direct.</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 shrink-0">
        <Button 
          onClick={subscribeUser} 
          disabled={isSubscribing} 
          size="sm"
          className="h-9 px-3.5 rounded-xl font-black shadow-md shadow-primary/20 gap-1.5 text-xs"
        >
          {isSubscribing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 fill-white" />
              <span>Activer</span>
            </>
          )}
        </Button>
        <button 
          onClick={handleDismiss} 
          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
          title="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
