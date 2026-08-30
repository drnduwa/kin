'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { onMessage } from 'firebase/messaging';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessagesSquare, 
  AlertTriangle, 
  Bell, 
  X, 
  ChevronRight, 
  MapPin, 
  TrafficCone, 
  Siren,
  Construction,
  Car
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CommunityMessage, EventReport, AppNotification } from '@/lib/types';

export interface PopupItem {
  id: string;
  type: 'chat' | 'traffic' | 'system';
  title: string;
  body: string;
  avatar?: string;
  iconType?: string;
  location?: string;
  link: string;
  timestamp: number;
}

// Gentle, high-fidelity double chime using Web Audio API (no external file dependency)
const playNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;

    // Tone 1: E5 (659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    // Tone 2: B5 (987.77 Hz - WhatsApp style cheerful chime)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.08);
    gain2.gain.setValueAtTime(0.12, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);
  } catch (e) {
    // Graceful fallback if blocked by browser autoplay policy
  }
};

export function InAppPopupNotifications() {
  const { firestore, messaging } = useFirebase();
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  const [currentPopup, setCurrentPopup] = useState<PopupItem | null>(null);
  
  const processedIdsRef = useRef<Set<string>>(new Set());
  const sessionStartTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showPopup = useCallback((item: PopupItem) => {
    if (processedIdsRef.current.has(item.id)) return;
    processedIdsRef.current.add(item.id);

    // Play chime sound & vibrate device
    playNotificationSound();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([70, 40, 70]); } catch (_) {}
    }

    setCurrentPopup(item);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCurrentPopup(null);
    }, 6500);
  }, []);

  // 1. Listen for new Community Chat (Radio Trottoir) messages
  useEffect(() => {
    if (!firestore) return;
    const chatRef = collection(firestore, 'community_chat');
    const q = query(chatRef, orderBy('timestamp', 'desc'), limit(1));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as CommunityMessage;
          const msgTime = data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now();
          
          // Ignore messages from before session start or posted by current user
          if (msgTime < sessionStartTimeRef.current - 5000) return;
          if (user && data.userId === user.uid) return;
          if (pathname === '/community-chat' && !data.alertType) return; // Don't pop regular text if already in chat

          const popup: PopupItem = {
            id: `chat-${change.doc.id}`,
            type: 'chat',
            title: data.alertType ? `🚨 Alerte ${data.alertType.toUpperCase()}` : `💬 ${data.userName || 'Radio Trottoir'}`,
            body: data.text || (data.alertType ? `Signalement à ${data.locationName || 'Kinshasa'}` : 'Nouveau média partagé'),
            avatar: data.userAvatar,
            iconType: data.alertType || 'chat',
            location: data.locationName,
            link: '/community-chat',
            timestamp: msgTime
          };

          showPopup(popup);
        }
      });
    }, (err) => console.warn('In-App Chat Listener:', err));

    return () => unsubscribe();
  }, [firestore, user, pathname, showPopup]);

  // 2. Listen for new Traffic Events / Hazards
  useEffect(() => {
    if (!firestore) return;
    const eventsRef = collection(firestore, 'events');
    const q = query(eventsRef, orderBy('createdAt', 'desc'), limit(1));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as EventReport;
          const evTime = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();

          if (evTime < sessionStartTimeRef.current - 5000) return;
          if (user && data.userId === user.uid) return;

          const popup: PopupItem = {
            id: `event-${change.doc.id}`,
            type: 'traffic',
            title: `⚠️ Incident : ${data.location || 'Kinshasa'}`,
            body: data.description || 'Ralentissement ou incident signalé par un conducteur.',
            avatar: data.userAvatar,
            iconType: data.severity || 'traffic',
            location: data.location,
            link: '/reports',
            timestamp: evTime
          };

          showPopup(popup);
        }
      });
    }, (err) => console.warn('In-App Event Listener:', err));

    return () => unsubscribe();
  }, [firestore, user, showPopup]);

  // 3. Listen for System / Admin Broadcast Notifications
  useEffect(() => {
    if (!firestore) return;
    const notifsRef = collection(firestore, 'notifications');
    const q = query(notifsRef, orderBy('timestamp', 'desc'), limit(1));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as AppNotification;
          const nTime = data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now();

          if (nTime < sessionStartTimeRef.current - 5000) return;

          const popup: PopupItem = {
            id: `notif-${change.doc.id}`,
            type: 'system',
            title: data.title || 'Kinshasa Flow Live',
            body: data.message || 'Mise à jour en direct.',
            link: data.link || '/notifications',
            timestamp: nTime
          };

          showPopup(popup);
        }
      });
    }, (err) => console.warn('In-App Notif Listener:', err));

    return () => unsubscribe();
  }, [firestore, showPopup]);

  // 4. Listen for Foreground FCM Push Notifications
  useEffect(() => {
    if (!messaging) return;
    try {
      const unsubscribe = onMessage(messaging, (payload) => {
        if (payload.notification) {
          const popup: PopupItem = {
            id: `fcm-${Date.now()}`,
            type: 'system',
            title: payload.notification.title || 'Kinshasa Flow',
            body: payload.notification.body || 'Nouvelle notification.',
            link: payload.data?.link || '/notifications',
            timestamp: Date.now()
          };
          showPopup(popup);
        }
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('FCM onMessage listener setup:', e);
    }
  }, [messaging, showPopup]);

  const handleCardClick = () => {
    if (!currentPopup) return;
    const destination = currentPopup.link;
    setCurrentPopup(null);
    if (destination) {
      router.push(destination);
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPopup(null);
  };

  return (
    <div className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md z-[9999] pointer-events-none">
      <AnimatePresence>
        {currentPopup && (
          <motion.div
            initial={{ y: -80, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -80, opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            onClick={handleCardClick}
            className="pointer-events-auto w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-[0_12px_35px_rgba(0,0,0,0.18)] p-3.5 cursor-pointer hover:bg-slate-50/90 dark:hover:bg-slate-800/90 transition-all select-none group relative overflow-hidden"
          >
            {/* Animated Top Accent Bar */}
            <div className={cn(
              "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r",
              currentPopup.type === 'chat' ? "from-emerald-400 via-primary to-blue-500" :
              currentPopup.type === 'traffic' ? "from-amber-400 via-orange-500 to-red-500" :
              "from-primary via-blue-500 to-indigo-600"
            )} />

            <div className="flex items-start gap-3 pt-0.5">
              {/* Avatar / Icon */}
              <div className="relative shrink-0 mt-0.5">
                {currentPopup.avatar ? (
                  <Avatar className="h-10 w-10 border-2 border-emerald-500/20 shadow-sm">
                    <AvatarImage src={currentPopup.avatar} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">KF</AvatarFallback>
                  </Avatar>
                ) : (
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center shadow-md",
                    currentPopup.type === 'chat' ? "bg-emerald-500 text-white" :
                    currentPopup.type === 'traffic' ? "bg-amber-500 text-white" :
                    "bg-primary text-white"
                  )}>
                    {currentPopup.iconType === 'police' ? <Siren className="h-5 w-5" /> :
                     currentPopup.iconType === 'travaux' ? <Construction className="h-5 w-5" /> :
                     currentPopup.type === 'traffic' ? <Car className="h-5 w-5" /> :
                     <MessagesSquare className="h-5 w-5" />}
                  </div>
                )}
                
                {/* Status Ping Dot */}
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className={cn(
                    "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                    currentPopup.type === 'chat' ? "bg-emerald-400" : "bg-amber-400"
                  )}></span>
                  <span className={cn(
                    "relative inline-flex rounded-full h-3 w-3 border-2 border-white",
                    currentPopup.type === 'chat' ? "bg-emerald-500" : "bg-amber-500"
                  )}></span>
                </span>
              </div>

              {/* Message Details */}
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {currentPopup.title}
                    </p>
                    {currentPopup.type === 'chat' && (
                      <Badge className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[8px] px-1.5 py-0 border-none">
                        WhatsApp Live
                      </Badge>
                    )}
                  </div>
                  <span className="text-[9px] font-bold text-slate-400 shrink-0">
                    À l'instant
                  </span>
                </div>

                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 line-clamp-2 leading-snug">
                  {currentPopup.body}
                </p>

                {currentPopup.location && (
                  <div className="flex items-center gap-1 mt-1 text-[9px] font-bold text-primary dark:text-primary-foreground/80">
                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{currentPopup.location}</span>
                  </div>
                )}
              </div>

              {/* Action & Close Controls */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button
                  onClick={handleDismiss}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Fermer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:translate-x-0.5 transition-transform mt-1">
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>

            {/* Timed progress bar */}
            <motion.div 
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 6.5, ease: 'linear' }}
              className="absolute bottom-0 left-0 h-0.5 bg-primary/40"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
