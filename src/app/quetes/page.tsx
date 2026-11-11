import { AppShell } from "@/components/app-shell";
import QuestsPage from "@/components/game/quests-page";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Quêtes - Niveaux, missions et badges',
  description: 'Gagnez de l’XP en aidant Kinshasa à sortir des bouchons : missions du jour, séries, badges et rangs.',
};

export default function QuetesPage() {
  return (
    <AppShell>
      <QuestsPage />
    </AppShell>
  );
}
