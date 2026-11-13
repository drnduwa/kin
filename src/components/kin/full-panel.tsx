'use client';

/**
 * Panneau plein écran : sur téléphone il prend tout l'écran (glisse du bas), sur ordinateur il
 * s'ouvre en grand au centre. Fermeture : bouton retour, touche Échap, ou le bouton « retour »
 * du téléphone (géré par la page via l'historique).
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FullPanel({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Nouveau contenu (ex. trajets → film de la route) : on remonte en haut du panneau.
  useEffect(() => { if (open) bodyRef.current?.scrollTo({ top: 0 }); }, [open, title]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="kf-panel"
          className="fixed inset-0 z-[200] flex items-stretch justify-center md:items-center md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              'relative flex h-full w-full flex-col bg-slate-50 dark:bg-slate-950 shadow-2xl',
              'md:h-auto md:max-h-[92vh] md:max-w-3xl md:rounded-3xl md:border md:border-slate-700/60 overflow-hidden',
              className,
            )}
            initial={{ y: 40, opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <header className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-[#0A1A29] text-[#EAF3FA] px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={onClose}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                aria-label="Fermer et revenir à la carte"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              {icon && <span className="shrink-0">{icon}</span>}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-black text-white">{title}</h2>
                {subtitle && <div className="truncate text-[11px] text-[#8EA8BD]">{subtitle}</div>}
              </div>
            </header>
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
