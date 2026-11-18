import { AppShell } from "@/components/app-shell";
import TrafficCheck from "@/components/traffic-check";
import { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "lucide-react";

export const metadata: Metadata = {
  title: 'Vérifier le Trafic - État des rues à Kinshasa',
  description: 'Vérifiez instantanément si une avenue est bouchée ou fluide. Analyse intelligente combinant données GPS et rapports communautaires Kinois.',
};

export default function VerifierTraficPage() {
  return (
    <AppShell>
      {/* Une seule entrée vers le Mode Conduite, en haut de la page trafic */}
      <Link
        href="/conduite"
        className="mb-2 flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-yellow-300 text-sm font-black text-slate-900 shadow-lg shadow-yellow-300/20 active:scale-[0.99]"
      >
        <Navigation className="h-5 w-5" />
        Lancer la conduite
        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] uppercase tracking-wider text-yellow-300">Bêta</span>
      </Link>
      <TrafficCheck />
    </AppShell>
  );
}
