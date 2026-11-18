'use client';

import dynamic from 'next/dynamic';

/** La carte MapLibre ne tourne que dans le navigateur : pas de rendu serveur. */
const DriveMode = dynamic(() => import('./drive-mode'), { ssr: false });

export default function DriveModeLoader() {
  return <DriveMode />;
}
