'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Bot, Megaphone, ArrowRight, ShieldCheck, Zap, Monitor, X, Smartphone as PhoneIcon, MessagesSquare, MessageCircle, Share2, Wallet, TrafficCone } from 'lucide-react';
import { Button } from './ui/button';
import { Logo } from './logo';
import React, { useState, useEffect } from 'react';
import { Badge } from './ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.15,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const FeatureCard = ({ icon, title, description, color }: { icon: React.ReactNode, title: string, description: string, color: string }) => (
    <motion.div
        variants={itemVariants}
        whileHover={{ 
            y: -12, 
            scale: 1.02,
            transition: { duration: 0.3, ease: "backOut" } 
        }}
        className="group bg-card/60 backdrop-blur-xl p-8 rounded-3xl border border-primary/10 shadow-xl hover:shadow-2xl hover:bg-card/80 transition-all cursor-default"
    >
        <div className={`inline-flex p-4 rounded-xl mb-6 transition-transform group-hover:scale-110 group-hover:rotate-3 shadow-lg ${color}`}>
            {icon}
        </div>
        <h3 className="text-xl font-bold mb-3 text-foreground group-hover:text-primary transition-colors">{title}</h3>
        <p className="text-muted-foreground leading-relaxed text-sm">{description}</p>
    </motion.div>
);

const AppIconSmall = ({ className }: { className?: string }) => (
    <div className={`bg-primary p-2 rounded-xl shadow-lg flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 24 24" className="w-full h-full text-white" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z" />
          <circle cx="12" cy="9" r="3" fill="rgba(255,255,255,0.8)" />
        </svg>
    </div>
);

export default function WelcomePage() {
    const isMobile = useIsMobile();
    const [installPrompt, setInstallPrompt] = useState<any>(null);
    const [showInstallSuggestion, setShowInstallSuggestion] = useState(false);
    
    const echangeurBgUrl = "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&q=80&w=1200";
    const heroImageUrl = "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&q=80&w=1600";
    const whatsappChannelUrl = "https://whatsapp.com/channel/0029Vb7S97n7oQhlHe5k1k1f";
    const whatsappBusinessUrl = "https://wa.me/243892293178";

    useEffect(() => {
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setInstallPrompt(e);
            if (isMobile) {
                setTimeout(() => setShowInstallSuggestion(true), 3000);
            }
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        const isStandalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
        if (isMobile && !isStandalone && !installPrompt) {
            setTimeout(() => setShowInstallSuggestion(true), 5000);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, [isMobile, installPrompt]);

    const handleInstallClick = async (platform: 'desktop' | 'mobile') => {
        if (!installPrompt) {
            if (platform === 'desktop') {
                alert("Installation Desktop :\n1. Utilisez Chrome ou Edge.\n2. Cliquez sur l'icône d'installation dans la barre d'adresse (le marqueur bleu).");
            } else {
                alert("Installation Mobile :\n1. Appuyez sur 'Partager' (iOS) ou les 3 points (Android).\n2. Sélectionnez 'Sur l'écran d'accueil'.");
            }
            return;
        }
        await installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        console.log(`[PWA] Install outcome: ${outcome}`);
        setInstallPrompt(null);
        setShowInstallSuggestion(false);
    };

    return (
        <div className="relative min-h-screen w-full text-foreground overflow-x-hidden flex flex-col">
            <AnimatePresence>
                {showInstallSuggestion && (
                    <motion.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-6 left-4 right-4 z-[100] md:hidden"
                    >
                        <div className="bg-slate-900 text-white p-5 rounded-[2rem] shadow-2xl border border-white/10 flex items-center gap-4 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2">
                                <button onClick={() => setShowInstallSuggestion(false)} className="text-white/40 hover:text-white p-1">
                                    <X size={16} />
                                </button>
                            </div>
                            <AppIconSmall className="w-12 h-12 shrink-0 ring-4 ring-primary/20" />
                            <div className="flex-1 space-y-1">
                                <p className="font-black text-sm tracking-tight">Installer Kinshasa Flow</p>
                                <p className="text-[10px] text-slate-400 font-medium leading-tight">Accédez au trafic plus vite sans passer par le navigateur.</p>
                            </div>
                            <Button onClick={() => handleInstallClick('mobile')} size="sm" className="rounded-xl h-10 px-4 font-black text-xs uppercase bg-primary hover:bg-primary/90">
                                Installer
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="fixed inset-0 -z-50 bg-background"></div>
            <div className="fixed inset-0 -z-40 bg-[radial-gradient(hsl(var(--primary))_0.5px,transparent_0.5px)] [background-size:24px_24px] opacity-[0.12]"></div>
            
            <div className="fixed top-[-5%] left-[-5%] -z-30 h-[600px] w-[600px] rounded-full bg-primary/15 blur-[120px] pointer-events-none"></div>
            <div className="fixed top-[30%] right-[-10%] -z-30 h-[500px] w-[500px] rounded-full bg-accent/10 blur-[130px] pointer-events-none"></div>

            <div className="fixed inset-0 -z-20 pointer-events-none overflow-hidden">
                <Image
                    src={echangeurBgUrl}
                    alt=""
                    fill
                    className="object-cover object-center"
                    style={{ opacity: 0.15 }}
                    priority
                />
            </div>

            <motion.header
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="container mx-auto p-6 flex justify-between items-center z-50"
            >
                <Logo className="h-10 w-auto text-primary" />
                <div className="flex items-center gap-4">
                    <Link href="/login">
                        <Button variant="ghost" className="hidden sm:inline-flex hover:bg-primary/10 font-bold">
                            Se connecter
                        </Button>
                    </Link>
                    <Link href="/signup">
                        <Button className="shadow-lg shadow-primary/20 font-bold px-6">
                            Commencer
                        </Button>
                    </Link>
                </div>
            </motion.header>

            <main className="container mx-auto px-4 py-8 md:py-16 text-center flex-grow flex flex-col items-center justify-center gap-12 relative z-10">
                 <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="max-w-4xl"
                >
                    <motion.div variants={itemVariants} className="flex justify-center mb-6">
                        <Badge variant="outline" className="px-4 py-1.5 border-primary/30 bg-primary/10 text-primary text-sm font-semibold rounded-full animate-bounce shadow-sm">
                            <Zap className="w-3 h-3 mr-2 fill-current" />
                            Votre copilote intelligent sur les routes de Kinshasa
                        </Badge>
                    </motion.div>

                    <motion.h1 variants={itemVariants} className="text-5xl md:text-8xl font-black tracking-tighter text-foreground mb-8 leading-[1.1]">
                        Naviguez <span className="text-primary bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600">Kinshasa</span><br /> 
                        <span className="relative inline-block">
                            sans stress.
                            <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 338 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 10C56.3333 3.66667 188.6 -5.2 337 10" stroke="hsl(var(--accent))" strokeWidth="6" strokeLinecap="round"/>
                            </svg>
                        </span>
                    </motion.h1>

                    <motion.p variants={itemVariants} className="max-w-2xl mx-auto text-xl md:text-2xl text-muted-foreground mb-12 font-medium leading-relaxed">
                        Évitez les bouchons et échangez en direct avec la communauté. Le futur de la mobilité urbaine est ici.
                    </motion.p>

                    <motion.div variants={itemVariants} className="flex flex-col sm:flex-row justify-center gap-4">
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Link href="/verifier-trafic">
                                <Button size="lg" className="w-full text-lg py-7 px-8 rounded-2xl shadow-2xl shadow-primary/30 group font-black gap-3 bg-primary hover:bg-primary/90 text-white">
                                    <TrafficCone className="w-6 h-6" />
                                    Vérifier le Trafic
                                    <ArrowRight className="ml-1 w-5 h-5 transition-transform group-hover:translate-x-1" />
                                </Button>
                            </Link>
                        </motion.div>

                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Link href="/e-wallet">
                                <Button size="lg" className="w-full text-lg py-7 px-8 rounded-2xl shadow-2xl shadow-emerald-500/20 group font-black gap-3 bg-emerald-600 hover:bg-emerald-500 text-white">
                                    <Wallet className="w-6 h-6" />
                                    E-Wallet & Gains (+CASH)
                                </Button>
                            </Link>
                        </motion.div>
                        
                        <div className="flex flex-col gap-2">
                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                <Button asChild size="lg" variant="outline" className="w-full text-sm py-5 px-6 rounded-2xl border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 font-bold gap-2">
                                    <a href={whatsappChannelUrl} target="_blank" rel="noopener noreferrer">
                                        <Share2 className="w-4 h-4 text-emerald-600" />
                                        Canal WhatsApp
                                    </a>
                                </Button>
                            </motion.div>
                        </div>
                    </motion.div>
                </motion.div>

                <div className="w-full max-w-7xl px-4 flex flex-col items-center gap-12 group">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 40 }}
                        whileInView={{ opacity: 1, scale: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.3 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ 
                            type: "spring", 
                            stiffness: 260, 
                            damping: 20,
                            opacity: { duration: 0.8 },
                            y: { duration: 0.8 }
                        }}
                        className="relative w-full cursor-pointer"
                    >
                        <div className="absolute -inset-4 bg-gradient-to-r from-primary via-accent to-blue-400 rounded-[2.5rem] blur-2xl opacity-15 group-hover:opacity-30 transition duration-1000"></div>
                        <div className="relative aspect-[4/3] md:aspect-video lg:aspect-[21/9] rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-white/50 ring-1 ring-white/20 bg-white">
                            <Image 
                                src={heroImageUrl} 
                                alt="Kinshasa Flow Dashboard" 
                                fill 
                                className="object-cover transition-transform duration-700 group-hover:scale-105"
                                priority
                            />
                        </div>
                    </motion.div>
                    
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.5, duration: 0.6 }}
                        className="text-center md:text-left md:self-start bg-white/60 backdrop-blur-xl p-6 md:p-8 rounded-2xl border border-white/50 shadow-sm md:ml-10 z-20 relative"
                    >
                        <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-primary mb-1">Ville de Kinshasa</p>
                        <h4 className="text-lg md:text-2xl font-bold flex items-center justify-center md:justify-start gap-2">
                            <Monitor className="w-4 h-4 md:w-6 md:h-6 text-primary animate-pulse"/> 
                            Logiciel disponible sur PC & Mac
                        </h4>
                    </motion.div>
                </div>
            </main>

            <motion.section 
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.1 }}
                variants={{ 
                    hidden: { opacity: 1 }, 
                    visible: { transition: { staggerChildren: 0.1 } } 
                }}
                className="container mx-auto px-4 py-24 z-10"
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <FeatureCard
                        icon={<Activity size={32} className="text-white" />}
                        title="Trafic en Temps Réel"
                        description="Vivez l'info trafic en direct grâce aux rapports communautaires vérifiés."
                        color="bg-red-500 shadow-red-200"
                    />
                    <FeatureCard
                        icon={<ShieldCheck size={32} className="text-white" />}
                        title="Alertes Sécurité & Voies Bis"
                        description="Soyez prévenu des blocages, pannes et des avenues de délestage sécurisées."
                        color="bg-primary shadow-blue-200"
                    />
                    <FeatureCard
                        icon={<Wallet size={32} className="text-white" />}
                        title="E-Wallet & Gains Cash"
                        description="Signalez un bouchon, gagnez des Francs Congolais et retirez via M-Pesa, Orange ou Airtel."
                        color="bg-emerald-600 shadow-emerald-200"
                    />
                    <FeatureCard
                        icon={<Bot size={32} className="text-white" />}
                        title="Assistant IA Vocal"
                        description="L'IA qui vous répond et vous guide oralement en Français et en Lingala."
                        color="bg-accent shadow-yellow-200"
                    />
                </div>
            </motion.section>
            
            <motion.footer 
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="text-center p-12 border-t border-primary/10 bg-white/80 backdrop-blur-md z-20 mt-auto"
            >
                <div className="flex flex-col items-center gap-6">
                    <Logo className="h-8 w-auto text-muted-foreground opacity-60" />
                    <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm font-medium text-muted-foreground">
                        <Link href="/privacy" className="hover:text-primary transition-colors flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4" />
                            Confidentialité & CGU
                        </Link>
                        <a href={whatsappBusinessUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors flex items-center gap-2 text-emerald-600 font-bold">
                            <MessageCircle className="h-4 w-4" />
                            Support WhatsApp
                        </a>
                        <Link href="/contact" className="hover:text-primary transition-colors">Contact</Link>
                    </div>
                    <p className="text-xs text-muted-foreground max-w-sm font-medium">
                        Simplifier la vie des Kinois, un kilomètre à la fois.
                    </p>
                    <a href="http://www.swaziapplilab.co.za" target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold hover:text-primary transition-colors uppercase tracking-widest opacity-50">
                        &copy; {new Date().getFullYear()} Swazi Appli Lab sarl. Tous droits réservés.
                    </a>
                </div>
            </motion.footer>
        </div>
    );
}
