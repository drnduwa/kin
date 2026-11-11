import { AppShell } from "@/components/app-shell";
import EWalletComponent from "@/components/e-wallet";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: 'K-Flow E-Wallet — Gagner de l\'Argent en Informant le Trafic',
  description: 'Portefeuille numérique citoyen K-Flow : Gagnez des Francs Congolais en signalant les embouteillages à Kinshasa et retirez instantanément via Mobile Money.',
};

export default function EWalletPage() {
  return (
    <AppShell>
      <EWalletComponent />
    </AppShell>
  );
}
