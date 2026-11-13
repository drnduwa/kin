'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Bot, ArrowRight, ShieldCheck, Zap, Monitor, X, MessageCircle, Share2, Wallet } from 'lucide-react';
import { Button } from './ui/button';
import React, { useState, useEffect } from 'react';
import { TrafficHeroScene } from './kin/traffic-scene';
import { KinSkyline, YaFlowAvatar } from './kin/illustrations';
import { Bus207, Car } from './kin/vehicles';
import { EPISODES, LEXIQUE, RUNS } from '@/lib/kin-slang';
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
        className="group bg-[#121B26] p-6 rounded-3xl border border-white/10 hover:border-[#FFD23F]/50 transition-colors cursor-default"
    >
        <div className={`inline-flex p-3 rounded-xl mb-5 transition-transform group-hover:scale-110 group-hover:rotate-3 shadow-lg ${color}`}>
            {icon}
        </div>
        <h3 className="text-lg font-black mb-2 text-[#F3F0E8] group-hover:text-[#FFD23F] transition-colors">{title}</h3>
        <p className="text-white/65 leading-relaxed text-sm">{description}</p>
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
        <div className="relative min-h-screen w-full overflow-x-hidden flex flex-col bg-[#0B1118] text-[#F3F0E8]">
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
                                <button onClick={() => setShowInstallSuggestion(false)} className="text-white/40 hover:text-white p-1" aria-label="Fermer">
                                    <X size={16} />
                                </button>
                            </div>
                            <AppIconSmall className="w-12 h-12 shrink-0 ring-4 ring-primary/20" />
                            <div className="flex-1 space-y-1">
                                <p className="font-black text-sm tracking-tight">Installer Kinshasa Flow</p>
                                <p className="text-[10px] text-slate-400 font-medium leading-tight">Ya Flow dans ta poche, sans passer par le navigateur.</p>
                            </div>
                            <Button onClick={() => handleInstallClick('mobile')} size="sm" className="rounded-xl h-10 px-4 font-black text-xs uppercase bg-[#FFD23F] text-[#0B1118] hover:bg-[#FFD23F]/90">
                                Installer
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── En-tête façon tableau de bord de course ── */}
            <motion.header
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="sticky top-0 z-50 border-b border-white/10 bg-[#0B1118]/90 backdrop-blur"
            >
                <div className="container mx-auto px-4 py-3 flex justify-between items-center gap-3">
                    <Link href="/" className="flex items-center gap-2 min-w-0">
                        <span className="grid place-items-center h-9 w-9 shrink-0 rounded-lg bg-[#FFD23F] text-[#0B1118] font-display text-lg leading-none">KF</span>
                        <span className="font-display text-lg sm:text-xl tracking-wide uppercase truncate">Kinshasa Flow<span className="text-[#FFD23F]">.</span></span>
                    </Link>
                    <nav className="hidden md:flex items-center gap-6 text-xs font-bold uppercase tracking-widest text-white/60">
                        <a href="#histoire" className="hover:text-[#FFD23F]">L&apos;histoire</a>
                        <a href="#runs" className="hover:text-[#FFD23F]">Les runs</a>
                        <a href="#lexique" className="hover:text-[#FFD23F]">Lexique</a>
                    </nav>
                    <div className="flex items-center gap-2 shrink-0">
                        <Link href="/login">
                            <Button variant="ghost" className="hidden sm:inline-flex text-white hover:bg-white/10 hover:text-white font-bold">
                                Se connecter
                            </Button>
                        </Link>
                        <Link href="/signup">
                            <Button className="font-black uppercase bg-[#FFD23F] text-[#0B1118] hover:bg-[#FFE27A]">
                                Kota
                            </Button>
                        </Link>
                    </div>
                </div>
            </motion.header>

            <main className="flex-grow">
                {/* ── Héros : la rue de Kin, en mouvement ── */}
                <section className="relative">
                    <TrafficHeroScene className="h-[44vh] sm:h-[58vh] min-h-[300px] max-h-[640px] w-full" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0B1118] to-transparent" />
                </section>

                <section className="container mx-auto px-4 pt-6 relative z-10">
                    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-4xl">
                        <motion.p variants={itemVariants} className="inline-flex items-center gap-2 rounded-full bg-[#FFD23F]/15 border border-[#FFD23F]/40 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#FFD23F]">
                            <Zap className="w-3 h-3 fill-current" /> Mbote ndeko · Le trafic de Kin en direct
                        </motion.p>
                        <motion.h1 variants={itemVariants} className="mt-4 font-display uppercase text-6xl sm:text-7xl md:text-8xl leading-[0.9] tracking-wide text-[#F3F0E8]">
                            Kin bouge.<br />
                            <span className="text-[#FFD23F]">Toi, tu passes.</span>
                        </motion.h1>
                        <motion.p variants={itemVariants} className="mt-5 max-w-2xl text-base sm:text-lg text-white/70 font-medium leading-relaxed">
                            Ya Flow, le chauffeur qui connaît chaque libulu de Kinshasa, te dit où ça roule et où <i>nzela ekangami</i>.
                            Vote les carrefours, signale les bouchons, gagne tes FC et fais gagner ta commune.
                        </motion.p>

                        <motion.div variants={itemVariants} className="mt-8 flex flex-col sm:flex-row gap-3">
                            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                                <Link href="/verifier-trafic" className="relative overflow-hidden flex items-center justify-between gap-6 rounded-2xl bg-[#FFD23F] text-[#0B1118] px-6 py-4 shadow-[0_10px_40px_-10px_rgba(255,210,63,.7)]">
                                    <span className="absolute inset-0 kf-shine pointer-events-none" />
                                    <span className="relative">
                                        <span className="block font-display uppercase text-3xl leading-none tracking-wide">Tokende !</span>
                                        <span className="block text-[11px] font-black uppercase tracking-widest opacity-70">Voir le trafic maintenant</span>
                                    </span>
                                    <ArrowRight className="relative w-7 h-7" />
                                </Link>
                            </motion.div>
                            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                                <Link href="/e-wallet" className="flex h-full items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-5 py-4 text-emerald-200 hover:bg-emerald-500/20">
                                    <Wallet className="w-6 h-6" />
                                    <span>
                                        <span className="block font-black">Mbongo na tshombo</span>
                                        <span className="block text-[11px] opacity-80">Tes gains en FC · M-Pesa, Orange, Airtel</span>
                                    </span>
                                </Link>
                            </motion.div>
                            <a href={whatsappChannelUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-2xl border border-white/15 px-5 py-4 text-sm font-bold text-white/80 hover:bg-white/5">
                                <Share2 className="w-4 h-4" /> Canal WhatsApp
                            </a>
                        </motion.div>

                        <motion.dl variants={itemVariants} className="mt-10 grid grid-cols-3 max-w-xl divide-x divide-white/10 border-y border-white/10">
                            {[
                                { v: `${RUNS.length}`, l: 'runs suivis' },
                                { v: '24', l: 'communes en bataille' },
                                { v: '+FC', l: 'à chaque signalement' },
                            ].map(s => (
                                <div key={s.l} className="py-3 px-3 first:pl-0">
                                    <dt className="sr-only">{s.l}</dt>
                                    <dd className="font-display text-3xl text-[#FFD23F] leading-none">{s.v}</dd>
                                    <dd className="mt-1 text-[11px] uppercase tracking-wider text-white/50 font-bold">{s.l}</dd>
                                </div>
                            ))}
                        </motion.dl>
                    </motion.div>
                </section>

                {/* ── L'histoire de Ya Flow ── */}
                <section id="histoire" className="container mx-auto px-4 pt-20 scroll-mt-20">
                    <SectionTitle kicker="Lisolo · l'histoire" title="Comment Ya Flow a sauvé ses matinées" />
                    <div className="mt-8 grid gap-4 md:grid-cols-3">
                        {EPISODES.map((ep, i) => (
                            <motion.article
                                key={ep.num}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.3 }}
                                transition={{ delay: i * 0.12, duration: 0.5 }}
                                className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#121B26] p-5"
                            >
                                <div className="h-32 -mx-5 -mt-5 mb-4 relative overflow-hidden bg-gradient-to-b from-[#1A1240] to-[#B4436C]">
                                    {i === 0 && (
                                        <>
                                            <KinSkyline className="absolute inset-x-0 bottom-0 h-full w-full" />
                                            <div className="absolute inset-x-0 bottom-0 h-6 bg-[#2A2F36]" />
                                            <svg viewBox="0 0 640 200" preserveAspectRatio="xMidYMax meet" className="absolute inset-x-0 bottom-0 w-full h-full" aria-hidden="true">
                                                <Car kind="sedan" body="#FACC15" taxi x={-20} y={196} scale={0.62} lane="none" />
                                                <Car kind="hatch" body="#2EB6F0" x={150} y={196} scale={0.62} lane="none" />
                                                <Bus207 x={320} y={196} scale={0.6} lane="none" />
                                                <Car kind="suv" body="#E5E7EB" x={510} y={196} scale={0.62} lane="none" />
                                            </svg>
                                            <span className="absolute right-6 top-3 rounded-xl rounded-br-none bg-white px-2 py-1 text-[11px] font-black text-[#0B1622]">Nzela ekangami…</span>
                                        </>
                                    )}
                                    {i === 1 && (
                                        <div className="absolute inset-0 grid place-items-center">
                                            <div className="flex -space-x-3">
                                                {(['fluide', 'dense', 'neutre', 'bloque', 'fluide'] as const).map((m, k) => (
                                                    <span key={k} className="kf-bob-slow" style={{ animationDelay: `${k * 0.2}s` }}>
                                                        <YaFlowAvatar mood={m} className="h-14 w-14 ring-4 ring-[#7A2E5C] rounded-full" />
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {i === 2 && (
                                        <div className="absolute inset-0 overflow-hidden">
                                            <div className="absolute inset-x-0 bottom-0 h-8 bg-[#2A2F36]"><div className="absolute inset-x-0 top-3 h-1 kf-road-dash" /></div>
                                            <svg viewBox="0 0 300 130" className="absolute bottom-1 left-1/2 -translate-x-1/2 w-44" aria-hidden="true">
                                                <g className="kf-bob-slow"><Car kind="hatch" body="#2EB6F0" headlights x={10} y={124} scale={0.95} lane="none" /></g>
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                <div className="absolute right-3 top-32 font-display text-7xl text-white/5 select-none" aria-hidden="true">{ep.num}</div>
                                <p className="text-[11px] font-black uppercase tracking-widest text-[#FFD23F]">Épisode {ep.num}</p>
                                <h3 className="mt-1 font-display uppercase text-2xl tracking-wide text-[#F3F0E8]">{ep.titre}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-white/70">{ep.texte}</p>
                            </motion.article>
                        ))}
                    </div>
                </section>

                {/* ── Les runs ── */}
                <section id="runs" className="container mx-auto px-4 pt-20 scroll-mt-20">
                    <SectionTitle kicker="Le grand tour" title="Les runs que Ya Flow surveille" />
                    <ol className="mt-8 grid gap-2 sm:grid-cols-2">
                        {RUNS.map((r, i) => (
                            <motion.li
                                key={r.id}
                                initial={{ opacity: 0, x: -16 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 }}
                            >
                                <Link href="/verifier-trafic" className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-[#121B26] px-4 py-3 hover:border-[#FFD23F]/60 transition-colors">
                                    <span className="font-display text-2xl text-[#FFD23F] w-8 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center justify-between gap-2">
                                            <span className="font-black truncate">{r.nom}</span>
                                            <span className="flex gap-0.5 shrink-0" role="img" aria-label={`Difficulté ${r.danger} sur 3`}>
                                                {[1, 2, 3].map(d => (
                                                    <span key={d} className={`h-2 w-4 rounded-sm ${d <= r.danger ? (r.danger === 3 ? 'bg-red-500' : 'bg-[#FF7A45]') : 'bg-white/10'}`} />
                                                ))}
                                            </span>
                                        </span>
                                        <span className="block text-[11px] uppercase tracking-wider text-white/40 font-bold">{r.commune}</span>
                                        <span className="block text-xs text-white/65 mt-0.5">{r.reputation}</span>
                                    </span>
                                    <ArrowRight className="h-4 w-4 shrink-0 text-white/30 group-hover:text-[#FFD23F] group-hover:translate-x-1 transition-all" />
                                </Link>
                            </motion.li>
                        ))}
                    </ol>
                </section>

                {/* ── Ce que tu gagnes ── */}
                <motion.section
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.1 }}
                    variants={{ hidden: { opacity: 1 }, visible: { transition: { staggerChildren: 0.1 } } }}
                    className="container mx-auto px-4 pt-20"
                >
                    <SectionTitle kicker="Garage · tes outils" title="Ce que Ya Flow te donne" />
                    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <FeatureCard
                            icon={<Activity size={28} className="text-white" />}
                            title="Trafic en direct"
                            description="Les Kinois votent chaque carrefour : fluide, dense ou nzela ekangami."
                            color="bg-red-500"
                        />
                        <FeatureCard
                            icon={<ShieldCheck size={28} className="text-white" />}
                            title="Keba ! Alertes & voies bis"
                            description="Accident, roulage, libulu, mbula : on te prévient et on te donne le détour."
                            color="bg-[#2EB6F0]"
                        />
                        <FeatureCard
                            icon={<Wallet size={28} className="text-white" />}
                            title="Mbongo pour tes yeux"
                            description="Signale un bouchon, gagne des Francs Congolais, retire sur ton tshombo."
                            color="bg-emerald-600"
                        />
                        <FeatureCard
                            icon={<Bot size={28} className="text-[#0B1118]" />}
                            title="Assistant vocal"
                            description="Il te répond en français et en lingala, même quand tu as les mains sur le guidon."
                            color="bg-[#FFD23F]"
                        />
                    </div>
                </motion.section>

                {/* ── Lexique ── */}
                <section id="lexique" className="container mx-auto px-4 pt-20 pb-20 scroll-mt-20">
                    <SectionTitle kicker="Pale lokola mwana Kin" title="Parle comme un Kinois" />
                    <p className="mt-3 text-sm text-white/60 max-w-xl">Ya Flow parle la langue de la rue. Touche un mot pour voir ce qu&apos;il veut dire.</p>
                    <ul className="mt-6 flex flex-wrap gap-2">
                        {LEXIQUE.map(w => <LexiqueChip key={w.mot} mot={w.mot} sens={w.sens} />)}
                    </ul>
                </section>
            </main>

            <footer className="border-t border-white/10 bg-[#080C11] p-10 text-center">
                <div className="flex flex-col items-center gap-5">
                    <span className="font-display uppercase text-2xl tracking-wide">Kinshasa Flow<span className="text-[#FFD23F]">.</span></span>
                    <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm font-medium text-white/60">
                        <Link href="/privacy" className="hover:text-[#FFD23F] transition-colors flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4" />
                            Confidentialité & CGU
                        </Link>
                        <a href={whatsappBusinessUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#FFD23F] transition-colors flex items-center gap-2 text-emerald-400 font-bold">
                            <MessageCircle className="h-4 w-4" />
                            Support WhatsApp
                        </a>
                        <Link href="/contact" className="hover:text-[#FFD23F] transition-colors">Contact</Link>
                        <span className="inline-flex items-center gap-2"><Monitor className="h-4 w-4" />Aussi sur PC & Mac</span>
                    </div>
                    <p className="text-xs text-white/50 max-w-sm font-medium">
                        Simplifier la vie des Kinois, un kilomètre à la fois. Malembe, mais on arrive.
                    </p>
                    <a href="http://www.swaziapplilab.co.za" target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold text-white/40 hover:text-[#FFD23F] transition-colors uppercase tracking-widest">
                        &copy; {new Date().getFullYear()} Swazi Appli Lab sarl. Tous droits réservés.
                    </a>
                </div>
            </footer>
        </div>
    );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
    return (
        <div>
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#FFD23F]">{kicker}</p>
            <h2 className="mt-2 font-display uppercase text-4xl sm:text-5xl tracking-wide text-[#F3F0E8] leading-none">{title}</h2>
        </div>
    );
}

function LexiqueChip({ mot, sens }: { mot: string; sens: string }) {
    const [open, setOpen] = useState(false);
    return (
        <li>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${open ? 'bg-[#FFD23F] text-[#0B1118] border-[#FFD23F]' : 'border-white/15 bg-white/5 text-white hover:border-[#FFD23F]/60'}`}
            >
                <span className="font-black">{mot}</span>
                {open && <span className="ml-2 font-medium">= {sens}</span>}
            </button>
        </li>
    );
}
