'use client';

import dynamic from 'next/dynamic';
import { awardWalletContributionAction } from '@/app/actions';
import { getDriveIntelAction, logDriveTripAction } from '@/app/drive-actions';

/** La carte MapLibre ne tourne que dans le navigateur : pas de rendu serveur. */
const DriveMode = dynamic(() => import('./drive-mode'), { ssr: false });

/**
 * Les actions serveur sont importées ici et passées à l'écran : Next.js ne les retrouve pas
 * quand elles ne sont importées que par un composant chargé avec `ssr: false`
 * (« Failed to find Server Action »).
 */
const ACTIONS = { getDriveIntel: getDriveIntelAction, logDriveTrip: logDriveTripAction, awardContribution: awardWalletContributionAction };
export type DriveActions = typeof ACTIONS;

export default function DriveModeLoader() {
  return <DriveMode actions={ACTIONS} />;
}
