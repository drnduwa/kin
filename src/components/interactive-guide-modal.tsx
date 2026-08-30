'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  HelpCircle, 
  Compass, 
  Navigation, 
  MessagesSquare, 
  Camera, 
  Star, 
  TrafficCone, 
  Radar,
  Bot, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight,
  ShieldCheck,
  Play,
  Lightbulb,
  PhoneCall,
  Radio
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const GUIDE_STEPS = [
  {
    step: 1,
    title: '1. Radar Sentinelle 1 km (Alerte Proactive)',
    icon: Radar,
    color: 'bg-red-500 text-white',
    desc: 'Laissez l\'application ouverte ou en arrière-plan pendant que vous roulez. Dès que vous approchez à 1 km d\'un bouchon ou d\'un incident majeur, un bip sonore et une notification vous alertent immédiatement avec le raccourci conseillé.',
    badge: 'Alerte Proactive',
    actionText: 'Voir Déviations',
    actionLink: '/insights'
  },
  {
    step: 2,
    title: '2. Vérifier le Trafic avant de partir',
    icon: TrafficCone,
    color: 'bg-amber-500 text-white',
    desc: 'Avant de quitter la maison ou le bureau, ouvrez "Vérifier Trafic" ou le "Baromètre". L\'application détecte automatiquement si votre axe habituel est saturé.',
    badge: 'Gain de 30 min',
    actionText: 'Tester Vérifier Trafic',
    actionLink: '/verifier-trafic'
  },
  {
    step: 3,
    title: '3. K-Flow Nav & Déviations Intelligentes',
    icon: Navigation,
    color: 'bg-primary text-white',
    desc: 'Entrez votre destination dans K-Flow Nav. Si un goulot d\'étranglement (Échangeur, Magasin, UPN) est saturé, notre algorithme vous guide par les itinéraires bis testés par les chauffeurs kinois.',
    badge: 'Guidage Vocal',
    actionText: 'Ouvrir K-Flow Nav GPS',
    actionLink: '/k-flow-nav'
  },
  {
    step: 4,
    title: '4. Poser vos questions dans le Chat Live',
    icon: MessagesSquare,
    color: 'bg-blue-600 text-white',
    desc: 'Besoin d\'une confirmation en temps réel ? Écrivez dans le Chat Direct (ex: "Trafic eza ndenge nini na Mandela ?"). Les conducteurs sur place vous répondent en quelques secondes.',
    badge: 'Communauté Active',
    actionText: 'Rejoindre le Chat Live',
    actionLink: '/community-chat'
  },
  {
    step: 5,
    title: '5. Signaler les Incidents & Gagner des Stars',
    icon: Camera,
    color: 'bg-emerald-500 text-white',
    desc: 'Vous voyez un accident, un nid-de-poule ou un bouchon ? En 1 seul clic, prenez une photo et partagez-la. Vous recevez immédiatement +10 Stars pour vous remercier.',
    badge: '+10 ⭐ par Alerte',
    actionText: 'Signaler un Incident',
    actionLink: '/signaler-embouteillage'
  }
];

const FAQS = [
  {
    q: 'Comment fonctionne l\'alerte automatique à 1 km (Radar Sentinelle) ?',
    a: 'Grâce au GPS de votre smartphone, Kinshasa Flow mesure en continu la distance entre votre position et les 12 grands goulots d\'étranglement de Kinshasa ainsi que les signalements récents. Dès que vous vous trouvez à environ 1 km d\'un bouchon, vous recevez un double bip sonore et une bannière d\'évitement avec le temps de retard estimé.'
  },
  {
    q: 'Est-ce que Kinshasa Flow est gratuit ?',
    a: 'Oui ! La consultation du trafic, le baromètre, le radar sentinelle, le chat et le signalement des incidents sont entièrement gratuits pour tous les résidents de Kinshasa.'
  },
  {
    q: 'Comment fonctionne le GPS si ma connexion est faible ?',
    a: 'Kinshasa Flow a été optimisé pour fonctionner avec un minimum de données mobiles (3G/4G légères) afin de garantir une navigation fluide partout dans la ville.'
  },
  {
    q: 'À quoi servent les Stars ⭐ accumulées ?',
    a: 'Les Stars récompensent votre contribution citoyenne. Elles débloquent des fonctionnalités avancées, des analyses exclusives et des badges de confiance sur votre profil.'
  },
  {
    q: 'Comment contacter l\'équipe ou signaler un problème ?',
    a: 'Vous pouvez joindre notre assistance 24/7 directement via le bouton WhatsApp dans le menu latéral ou via la page Contact.'
  }
];

export function InteractiveGuideModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'piliers' | 'faq'>('piliers');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="rounded-2xl h-10 border-2 font-bold px-3 text-xs bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-300 hover:bg-amber-100 gap-1.5 shadow-sm"
        >
          <Lightbulb className="h-4 w-4 text-amber-600 fill-amber-500 animate-pulse" />
          <span className="hidden sm:inline">Comment ça marche ?</span>
          <span className="sm:hidden">Guide</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl rounded-3xl p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-slate-900 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 relative shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <Badge className="bg-amber-500 text-slate-950 font-black text-[9px] uppercase tracking-wider border-none">
              GUIDE DÉCOUVERTE K-FLOW
            </Badge>
            <span className="text-xs text-slate-300 font-bold">Simple • Rapide • Gratuit</span>
          </div>

          <DialogTitle className="text-2xl font-black tracking-tight leading-tight">
            Maîtrisez Kinshasa Flow en 2 Minutes
          </DialogTitle>
          <DialogDescription className="text-slate-300 text-xs mt-1">
            Découvrez comment le Radar Sentinelle 1 km et le GPS vous évitent les bouchons monstres de la capitale.
          </DialogDescription>

          {/* Tab selector */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveTab('piliers')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all",
                activeTab === 'piliers' 
                  ? "bg-white text-slate-900 shadow-md" 
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              )}
            >
              5 Fonctionnalités Clés
            </button>
            <button
              onClick={() => setActiveTab('faq')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all",
                activeTab === 'faq' 
                  ? "bg-white text-slate-900 shadow-md" 
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              )}
            >
              Questions Fréquentes (FAQ)
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-5">
          
          {activeTab === 'piliers' && (
            <div className="space-y-4">
              {GUIDE_STEPS.map((stepItem, idx) => {
                const Icon = stepItem.icon;
                return (
                  <div 
                    key={idx}
                    className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-700/60 space-y-3 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-md", stepItem.color)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-black text-sm sm:text-base text-slate-900 dark:text-white leading-snug">
                            {stepItem.title}
                          </h4>
                          <span className="text-[10px] font-black uppercase text-primary tracking-wider">
                            {stepItem.badge}
                          </span>
                        </div>
                      </div>

                      <Button asChild size="sm" variant="outline" className="rounded-xl h-8 text-xs font-black shrink-0 border-slate-300">
                        <Link href={stepItem.actionLink} onClick={() => setOpen(false)}>
                          {stepItem.actionText}
                        </Link>
                      </Button>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                      {stepItem.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'faq' && (
            <div className="space-y-3">
              {FAQS.map((faq, idx) => (
                <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700/60 space-y-1.5">
                  <h4 className="font-black text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-primary shrink-0" />
                    {faq.q}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed pl-6">
                    {faq.a}
                  </p>
                </div>
              ))}

              <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3 mt-4">
                <div>
                  <p className="text-xs font-black text-emerald-900 dark:text-emerald-300">Une autre question ?</p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">Notre équipe WhatsApp est disponible 7j/7.</p>
                </div>
                <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl h-9 px-4 text-xs shrink-0">
                  <a href="https://wa.me/243892293178" target="_blank" rel="noopener noreferrer">
                    WhatsApp Direct
                  </a>
                </Button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-100 dark:bg-slate-800/80 p-4 border-t flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 font-bold">Kinshasa Flow 2026</span>
          <Button onClick={() => setOpen(false)} className="rounded-xl h-10 px-6 font-black text-xs bg-slate-900 text-white">
            C'est compris !
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
