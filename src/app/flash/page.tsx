'use client';

/**
 * Page publique « Flash trafic » pour les radios et les groupes WhatsApp (sans connexion) :
 * le texte du moment en français et en lingala, à lire à l'antenne ou à copier.
 */
import { useCallback, useEffect, useState } from 'react';

type Flash = { fr: string; ln: string; lines: string[]; updatedAt: string | null; source: string };

export default function FlashPage() {
  const [flash, setFlash] = useState<Flash | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/flash', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setFlash(await res.json()); setError(false);
    } catch { setError(true); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 120_000); return () => clearInterval(t); }, [load]);

  const copy = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 1500); } catch { /* sélection manuelle */ }
  };
  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = 0.95;
    window.speechSynthesis.speak(u);
  };

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#0A1A29] text-[#EAF3FA] px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <header className="space-y-1">
          <div className="text-xs uppercase tracking-[0.2em] text-[#2EB6F0] font-bold">Kinshasa Flow · Flash trafic</div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#EAF3FA]">À lire à l'antenne</h1>
          <p className="text-sm text-[#8EA8BD]">Mis à jour toutes les 2 minutes depuis les mesures en direct. {flash?.updatedAt ? `Dernière mise à jour : ${flash.updatedAt}.` : ''}</p>
        </header>

        {error && <p className="rounded-xl bg-red-500/15 border border-red-500/30 p-3 text-sm">Flash indisponible pour le moment. Réessayez dans une minute.</p>}
        {!flash && !error && <p className="text-sm text-[#8EA8BD]">Chargement…</p>}

        {flash && (
          <>
            {([['Français', flash.fr], ['Lingala', flash.ln]] as const).map(([label, text]) => (
              <section key={label} className="rounded-2xl bg-[#11273A] border border-[#22425C] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs uppercase tracking-wider font-black text-[#FFD23F]">{label}</h2>
                  <div className="flex gap-2">
                    {label === 'Français' && <button type="button" onClick={() => speak(text)} className="rounded-lg bg-[#173248] px-3 py-1.5 text-xs font-bold">Écouter</button>}
                    <button type="button" onClick={() => copy(label, text)} className="rounded-lg bg-[#173248] px-3 py-1.5 text-xs font-bold">{copied === label ? 'Copié' : 'Copier'}</button>
                  </div>
                </div>
                <p className="text-lg leading-relaxed select-all break-words text-[#EAF3FA]">{text}</p>
              </section>
            ))}
            <section className="rounded-2xl bg-[#11273A] border border-[#22425C] p-4">
              <h2 className="text-xs uppercase tracking-wider font-black text-[#8EA8BD] mb-2">Tous les carrefours suivis</h2>
              <ul className="space-y-1 text-sm">{flash.lines.map(l => <li key={l}>{l}</li>)}</ul>
              <p className="mt-3 text-[11px] text-[#8EA8BD]">Source : {flash.source}. Texte brut pour automatiser : /api/flash?format=txt</p>
            </section>
            <p className="text-sm text-[#C9D8E4]">Pour votre propre trajet en direct : <b>kinshasaflow.online</b></p>
          </>
        )}
      </div>
    </main>
  );
}
