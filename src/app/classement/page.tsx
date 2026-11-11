import { AppShell } from "@/components/app-shell";
import LeaderboardPage from "@/components/game/leaderboard-page";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Classement - Bataille des communes de Kinshasa',
  description: 'Quelle commune aide le plus Kinshasa à circuler cette semaine ? Classement des communes et des joueurs.',
};

export default function ClassementPage() {
  return (
    <AppShell>
      <LeaderboardPage />
    </AppShell>
  );
}
