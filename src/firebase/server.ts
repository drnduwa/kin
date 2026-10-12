import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { firebaseConfig } from './config';

let serverApp: FirebaseApp | undefined;

export function getServerFirestore(): Firestore {
  if (!serverApp) {
    if (!getApps().length) {
      try {
        serverApp = initializeApp();
      } catch {
        serverApp = initializeApp(firebaseConfig);
      }
    } else {
      serverApp = getApp();
    }
  }
  return getFirestore(serverApp);
}
