'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Home, Activity, Siren, PlusCircle, Megaphone, Loader2, Route, 
  Landmark, Video, AreaChart, Bot, Map, Hotel, Bus, Shield, BedDouble, 
  Mail, Car, Star, Share2, Users, ShieldAlert, AlertCircle, 
  Palmtree, Compass, LayoutGrid, Utensils, Bell, Send, Navigation,
  BarChart3, Zap, Smartphone, Monitor, Radar, Construction, ShieldAlert as HazardIcon,
  MessagesSquare,
  MessageCircle,
  Headphones,
  TrafficCone,
  Clock
} from 'lucide-react';
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarHeader,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { UserNav } from './auth/user-nav';
import { useUser, useFirebase, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import React, { useEffect, useState, useCallback } from 'react';
import { Logo } from './logo';
import { NotificationPermission } from './notification-permission';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { doc, collection, query, orderBy, limit } from 'firebase/firestore';
import { UserProfile, AppNavigationSettings, AppSubscriptionSettings, AppNotification, EventReport } from '@/lib/types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

function ProtectedContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { firestore, auth } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isResending, setIsResending] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const profileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router, isMounted]);

  if (!isMounted || isUserLoading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const isSpecialUser = user.email === 'drnduwa@gmail.com' || user.email === 'contact.congonamotema@gmail.com';

  if (profile?.isBlocked) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="bg-destructive/10 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-12 w-12 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black tracking-tight">Compte Suspendu</h2>
            <p className="text-muted-foreground">Votre accès à Kinshasa Flow a été restreint par l'administration.</p>
          </div>
          <Link href="/contact" className="inline-block text-primary font-bold hover:underline">Nous contacter</Link>
        </div>
      </div>
    );
  }

  if (!user.emailVerified && !user.isAnonymous && user.providerData.some(p => p.providerId === 'password') && !isSpecialUser) {
    const handleResend = async () => {
        setIsResending(true);
        try {
            if (auth.currentUser) {
                await sendEmailVerification(auth.currentUser);
                toast({ title: "Email envoyé !", description: "Véfifiez votre boîte de réception." });
            }
        } catch (e) {
            toast({ title: "Erreur", description: "Veuillez patienter.", variant: "destructive" });
        } finally {
            setIsResending(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            router.push('/login');
        } catch (e) {
            toast({ title: "Erreur", description: "Impossible de se déconnecter.", variant: "destructive" });
        }
    };

    return (
        <div className="fixed inset-0 z-[9998] bg-background/90 backdrop-blur-xl flex items-center justify-center p-6 text-center">
            <div className="max-w-md space-y-8 bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
                <div className="bg-primary/10 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto">
                    <Mail className="h-12 w-12 text-primary animate-bounce" />
                </div>
                <div className="space-y-3">
                    <h2 className="text-3xl font-black tracking-tight text-slate-900">Activez votre compte</h2>
                    <p className="text-slate-500 font-medium leading-relaxed">
                        Un e-mail de confirmation a été envoyé à <span className="font-bold text-primary">{user.email}</span>.
                    </p>
                </div>
                <div className="flex flex-col gap-3">
                    <Button onClick={() => window.location.reload()} size="lg" className="h-14 rounded-2xl font-black shadow-xl">
                        J'ai vérifié mon email
                    </Button>
                    <Button variant="outline" onClick={handleResend} disabled={isResending} className="h-12 rounded-2xl font-bold">
                        {isResending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Renvoyer l'email"}
                    </Button>
                    <Button variant="ghost" onClick={handleSignOut} className="text-slate-400 font-bold hover:text-primary transition-colors">
                        Se déconnecter ou corriger l'email
                    </Button>
                </div>
            </div>
        </div>
    );
  }

  return <>{children}</>;
}


export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const subSettingsRef = useMemoFirebase(() => doc(firestore, 'app_settings', 'subscription'), [firestore]);
  const { data: subSettings } = useDoc<AppSubscriptionSettings>(subSettingsRef);

  const navSettingsRef = useMemoFirebase(() => doc(firestore, 'app_settings', 'navigation'), [firestore]);
  const { data: navSettings } = useDoc<AppNavigationSettings>(navSettingsRef);

  const notifsRef = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'notifications'), orderBy('timestamp', 'desc'), limit(20));
  }, [firestore, user]);
  const { data: notifs } = useCollection<AppNotification>(notifsRef);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const eventsRef = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'events'), orderBy('createdAt', 'desc'), limit(20));
  }, [firestore, user]);
  const { data: events } = useCollection<EventReport>(eventsRef);
  const [unreadReports, setUnreadReports] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const lastSeenReports = parseInt(localStorage.getItem('last_seen_reports') || '0');
    if (pathname === '/reports') {
      localStorage.setItem('last_seen_reports', Date.now().toString());
      setUnreadReports(0);
    } else if (events) {
      setUnreadReports(events.filter(e => (e.createdAt?.toMillis?.() || Date.now()) > lastSeenReports).length);
    }

    const lastSeenNotifs = parseInt(localStorage.getItem('last_seen_notifications') || '0');
    if (pathname === '/notifications') {
      localStorage.setItem('last_seen_notifications', Date.now().toString());
      setUnreadNotifications(0);
    } else if (notifs) {
      setUnreadNotifications(notifs.filter(n => (n.timestamp?.toMillis?.() || Date.now()) > lastSeenNotifs).length);
    }
  }, [events, notifs, pathname]);

  useEffect(() => {
    if (!profile || !subSettings) return;
    if (subSettings.mode === 'stars') {
      if (profile.currentStarsBalance < 5 && pathname !== '/mes-stars' && !['/', '/privacy'].includes(pathname)) {
        toast({
          title: 'Solde faible',
          variant: 'destructive',
          action: <ToastAction altText="Recharger" onClick={() => window.location.href = '/mes-stars'}>Recharger</ToastAction>,
        });
      }
    } else {
      const isExpired = profile.cashSubscriptionExpiry?.toDate?.() ? profile.cashSubscriptionExpiry.toDate() < new Date() : true;
      if (isExpired && pathname !== '/mes-stars' && !['/', '/privacy'].includes(pathname)) {
        toast({
          title: 'Abonnement expiré',
          variant: 'destructive',
          action: <ToastAction altText="S'abonner" onClick={() => window.location.href = '/mes-stars'}>S'abonner</ToastAction>,
        });
      }
    }
  }, [profile, subSettings, pathname, toast]);

  const isAdmin = user?.email === 'drnduwa@gmail.com';
  const isPartnerAdmin = user?.email === 'contact.congonamotema@gmail.com' || isAdmin;
  
  const whatsappChannelUrl = "https://whatsapp.com/channel/0029Vb7S97n7oQhlHe5k1k1f";
  const whatsappBusinessUrl = "https://wa.me/243892293178";
  
  const getPageTitle = () => {
    const titles: Record<string, string> = {
      '/reports': 'Rapports de trafic',
      '/live-traffic': 'Temps Réel',
      '/local-traffic': 'Trafic Local',
      '/verifier-trafic': 'Vérifier Trafic',
      '/k-flow-nav': 'K-Flow Nav',
      '/hazard-map': 'Carte des Dangers',
      '/insights': 'K-Flow Insights',
      '/flux-infrastructure': 'Flux & Infrastructure',
      '/routes': 'État des Routes',
      '/map': 'Carte',
      '/assistant': 'Assistant IA',
      '/notifications': 'Notifications',
      '/community-chat': 'K-Flow Chat',
      '/mes-stars': subSettings?.mode === 'cash' ? 'Mon Abonnement' : 'Mes Stars',
      '/privacy': 'Confidentialité',
    };
    return titles[pathname] || (pathname.startsWith('/admin') ? 'Administration' : 'Kinshasa Flow');
  }

  const isEnabled = useCallback((feature: keyof AppNavigationSettings) => {
    if (!navSettings) return true;
    return navSettings[feature] !== false;
  }, [navSettings]);

  const isProtectedPage = !['/', '/login', '/signup', '/privacy'].includes(pathname);

  return (
    <div className="flex h-screen bg-background">
      <SidebarProvider>
        <Sidebar className="border-r-0 shadow-2xl">
          <SidebarContent>
            <SidebarHeader className="border-b border-sidebar-border/50">
               <div className="p-4 flex items-center justify-center">
                <Logo className="h-9 w-auto text-sidebar-foreground" />
               </div>
            </SidebarHeader>
            <SidebarMenu className="p-3 gap-1">
              
              {/* Priorité au Chat Direct comme landing feature */}
              {isEnabled('communityChat') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/community-chat'} className={cn(pathname === '/community-chat' && "bg-white/10")}>
                    <Link href="/community-chat" className="font-bold flex items-center gap-3 h-11 px-4 rounded-xl">
                      <MessagesSquare className={cn("h-5 w-5", pathname === '/community-chat' ? "text-accent" : "text-primary")} />
                      <span>Chat Direct</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton asChild className="h-11 px-4 rounded-xl hover:bg-emerald-500/10 group">
                  <a href={whatsappChannelUrl} target="_blank" rel="noopener noreferrer" className="font-bold flex items-center gap-3">
                    <Share2 className="h-5 w-5 text-emerald-500 group-hover:scale-110 transition-transform" />
                    <span className="text-emerald-700">Canal WhatsApp</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild className="h-11 px-4 rounded-xl hover:bg-primary/10 group">
                  <a href={whatsappBusinessUrl} target="_blank" rel="noopener noreferrer" className="font-bold flex items-center gap-3">
                    <Headphones className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                    <span className="text-primary">Assistance WhatsApp</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/verifier-trafic'} className={cn(pathname === '/verifier-trafic' && "bg-white/10")}>
                  <Link href="/verifier-trafic" className="font-bold flex items-center gap-3 h-11 px-4 rounded-xl">
                    <TrafficCone className={cn("h-5 w-5", pathname === '/verifier-trafic' ? "text-accent" : "text-primary")} />
                    <span>Vérifier Trafic</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/previsions'} className={cn(pathname === '/previsions' && "bg-white/10")}>
                  <Link href="/previsions" className="font-bold flex items-center gap-3 h-11 px-4 rounded-xl">
                    <Clock className={cn("h-5 w-5", pathname === '/previsions' ? "text-accent" : "text-primary")} />
                    <span>Prévisions Trafic</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {isEnabled('reports') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/reports'} className={cn(pathname === '/reports' && "bg-white/10")}>
                    <Link href="/reports" className="font-bold flex items-center justify-between w-full h-11 px-4 rounded-xl">
                      <div className="flex items-center gap-3">
                        <Home className={cn("h-5 w-5", pathname === '/reports' ? "text-accent" : "text-primary")} />
                        <span>Rapports</span>
                      </div>
                      {unreadReports > 0 && <Badge variant="destructive" className="h-5 px-1.5 min-w-[20px] justify-center text-[10px] rounded-full font-black">{unreadReports}</Badge>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isEnabled('liveTraffic') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/live-traffic'} className={cn(pathname === '/live-traffic' && "bg-white/10")}>
                    <Link href="/live-traffic" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                      <Activity className={cn("h-5 w-5", pathname === '/live-traffic' ? "text-accent" : "text-primary")} />
                      <span>Temps Réel</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isEnabled('localTraffic') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/local-traffic'} className={cn(pathname === '/local-traffic' && "bg-white/10")}>
                    <Link href="/local-traffic" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                      <Radar className={cn("h-5 w-5", pathname === '/local-traffic' ? "text-accent" : "text-primary")} />
                      <span>Trafic Local</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isEnabled('kFlowNav') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/k-flow-nav'} className={cn("bg-primary/10 mb-1 h-11 rounded-xl px-4", pathname === '/k-flow-nav' && "bg-primary/20")}>
                    <Link href="/k-flow-nav" className="font-bold flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <Navigation className={cn("h-5 w-5", pathname === '/k-flow-nav' ? "text-accent" : "text-primary")} />
                        <span>K-Flow Nav</span>
                      </div>
                      <Badge className="bg-primary/20 text-primary text-[8px]">PREMIUM</Badge>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isEnabled('insights') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/insights'} className={cn("bg-primary/5 mb-2 h-11 rounded-xl px-4", pathname === '/insights' && "bg-primary/15")}>
                    <Link href="/insights" className="font-bold flex items-center justify-between w-full text-primary">
                      <div className="flex items-center gap-3">
                        <Zap className={cn("h-5 w-5", pathname === '/insights' ? "text-accent" : "text-primary")} />
                        <span>K-Flow Insights</span>
                      </div>
                      <Badge className="bg-primary/20 text-primary text-[8px]">AI</Badge>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isEnabled('fluxInfrastructure') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/flux-infrastructure'} className={cn(pathname === '/flux-infrastructure' && "bg-white/10")}>
                    <Link href="/flux-infrastructure" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                      <BarChart3 className={cn("h-5 w-5", pathname === '/flux-infrastructure' ? "text-accent" : "text-primary")} />
                      <span>Flux & Infrastructure</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isEnabled('routes') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/routes'} className={cn(pathname === '/routes' && "bg-white/10")}>
                    <Link href="/routes" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                      <Route className={cn("h-5 w-5", pathname === '/routes' ? "text-accent" : "text-primary")} />
                      <span>État des Routes</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isEnabled('hazardMap') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/hazard-map'} className={cn(pathname === '/hazard-map' && "bg-white/10")}>
                    <Link href="/hazard-map" className="font-bold flex items-center gap-3 h-11 px-4 rounded-xl">
                      <HazardIcon className={cn("h-5 w-5", pathname === '/hazard-map' ? "text-accent" : "text-primary")} />
                      <span>Carte des Dangers</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isEnabled('map') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/map'} className={cn(pathname === '/map' && "bg-white/10")}>
                    <Link href="/map" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                      <Map className={cn("h-5 w-5", pathname === '/map' ? "text-accent" : "text-primary")} />
                      <span>Carte</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isEnabled('assistant') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/assistant'} className={cn(pathname === '/assistant' && "bg-white/10")}>
                    <Link href="/assistant" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                      <Bot className={cn("h-5 w-5", pathname === '/assistant' ? "text-accent" : "text-primary")} />
                      <span>Assistant IA</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isEnabled('notifications') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/notifications'} className={cn(pathname === '/notifications' && "bg-white/10")}>
                    <Link href="/notifications" className="font-medium flex items-center justify-between w-full h-11 px-4 rounded-xl">
                      <div className="flex items-center gap-3">
                        <Bell className={cn("h-5 w-5", pathname === '/notifications' ? "text-accent" : "text-primary")} />
                        <span>Notifications</span>
                      </div>
                      {unreadNotifications > 0 && <Badge variant="destructive" className="h-5 px-1.5 min-w-[20px] justify-center text-[10px] rounded-full font-black">{unreadNotifications}</Badge>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isEnabled('myStars') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/mes-stars'} className={cn(pathname === '/mes-stars' && "bg-white/10")}>
                    <Link href="/mes-stars" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                      <Star className={cn("h-5 w-5", pathname === '/mes-stars' ? "text-accent" : "text-primary")} />
                      <span>{subSettings?.mode === 'cash' ? "Mon Accès" : "Mes Stars"}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <SidebarSeparator className="my-2 opacity-20" />

              {isPartnerAdmin && (
                <>
                  <div className="px-4 mb-2 text-[10px] font-black uppercase text-destructive/60 tracking-widest">Admin Global</div>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/admin/navigation'} className={cn(pathname === '/admin/navigation' && "bg-white/10")}>
                      <Link href="/admin/navigation" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                        <LayoutGrid className="text-destructive h-5 w-5" />
                        <span>Navigation</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/admin/stars'} className={cn(pathname === '/admin/stars' && "bg-white/10")}>
                      <Link href="/admin/stars" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                        <Users className="text-destructive h-5 w-5" />
                        <span>Stars & Utilisateurs</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/admin/adverts'} className={cn(pathname === '/admin/adverts' && "bg-white/10")}>
                      <Link href="/admin/adverts" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                        <Video className="text-destructive h-5 w-5" />
                        <span>Publicités</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/admin/notifications'} className={cn(pathname === '/admin/notifications' && "bg-white/10")}>
                      <Link href="/admin/notifications" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                        <Bell className="text-destructive h-5 w-5" />
                        <span>Diffusion Push</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <div className="px-4 mt-4 mb-2 text-[10px] font-black uppercase text-destructive/60 tracking-widest">Services</div>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/admin/car-rental'} className={cn(pathname === '/admin/car-rental' && "bg-white/10")}>
                      <Link href="/admin/car-rental" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                        <Car className="text-destructive h-5 w-5" />
                        <span>Location Voiture</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/admin/logement'} className={cn(pathname === '/admin/logement' && "bg-white/10")}>
                      <Link href="/admin/logement" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                        <BedDouble className="text-destructive h-5 w-5" />
                        <span>Logements</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/admin/tourism'} className={cn(pathname === '/admin/tourism' && "bg-white/10")}>
                      <Link href="/admin/tourism" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                        <Palmtree className="text-destructive h-5 w-5" />
                        <span>Tourisme</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/admin/transport'} className={cn(pathname === '/admin/transport' && "bg-white/10")}>
                      <Link href="/admin/transport" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                        <Bus className="text-destructive h-5 w-5" />
                        <span>Abonnements Bus</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/admin/messages'} className={cn(pathname === '/admin/messages' && "bg-white/10")}>
                      <Link href="/admin/messages" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                        <Mail className="text-destructive h-5 w-5" />
                        <span>Messages</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/admin/test-push'} className={cn(pathname === '/admin/test-push' && "bg-white/10")}>
                      <Link href="/admin/test-push" className="font-medium flex items-center gap-3 h-11 px-4 rounded-xl">
                        <Smartphone className="text-destructive h-5 w-5" />
                        <span>Push Engine</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
            <div className="flex flex-col h-full relative">
                <header className="bg-card border-b p-4 flex items-center justify-between gap-4 shadow-sm z-20">
                    <div className="flex items-center gap-4">
                      <SidebarTrigger className="md:hidden" />
                      <h1 className="text-2xl font-black text-foreground tracking-tight">{getPageTitle()}</h1>
                    </div>
                    <UserNav />
                </header>
                <main className="flex-1 p-4 flex flex-col gap-4 overflow-hidden bg-background">
                    <NotificationPermission />
                    <div className="flex-1 h-full w-full flex">
                        {isProtectedPage ? <ProtectedContent>{children}</ProtectedContent> : children}
                    </div>
                </main>
            </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
