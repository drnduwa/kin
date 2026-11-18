import { AppShell } from "@/components/app-shell";
import DriveModeLoader from "@/components/drive/drive-mode-loader";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Mode Conduite - Kinshasa Flow',
  description: 'Guidage en plein écran dans Kinshasa, sur une carte en mode jeu.',
};

// AppShell garde la connexion obligatoire ; le Mode Conduite s'affiche par-dessus, en plein écran.
export default function ConduitePage() {
  return (
    <AppShell>
      <DriveModeLoader />
    </AppShell>
  );
}
