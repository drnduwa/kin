import { AppShell } from "@/components/app-shell";
import FleetProPage from "@/components/game/fleet-pro-page";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Kin Flow Pro - Votre flotte dans le trafic de Kinshasa',
  description: 'Tableau de bord des flottes partenaires : véhicules, carrefours bloqués et alertes en direct.',
};

export default function ProPage() {
  return (
    <AppShell>
      <FleetProPage />
    </AppShell>
  );
}
