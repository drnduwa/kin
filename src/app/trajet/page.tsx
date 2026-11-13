import { AppShell } from "@/components/app-shell";
import DepartureCoach from "@/components/game/departure-coach";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Mon trajet - Quand partir à Kinshasa ?',
  description: 'Partir maintenant ou attendre ? Temps de trajet prévu, minutes de bouchons et heure d’arrivée pour votre trajet à Kinshasa.',
};

export default function TrajetPage() {
  return (
    <AppShell>
      <DepartureCoach />
    </AppShell>
  );
}
