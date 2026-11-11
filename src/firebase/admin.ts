/**
 * Firebase Admin SDK — serveur uniquement. NE JAMAIS importer depuis un composant client.
 *
 * Tout ce qui touche à l'argent (E-Wallet, Stars achetées, Pass, paiements FlexPay, retraits)
 * passe par ce module : l'Admin SDK contourne les règles Firestore, ce qui permet de fermer
 * ces champs aux clients dans firestore.rules.
 *
 * Identifiants :
 *  - Firebase App Hosting / Cloud Run : identifiants par défaut du compte de service (rien à configurer,
 *    mais ce compte doit avoir le rôle « Cloud Datastore User »).
 *  - En local : définir GOOGLE_APPLICATION_CREDENTIALS (chemin d'un JSON de compte de service)
 *    ou FIREBASE_SERVICE_ACCOUNT_JSON (contenu du JSON).
 */
import { getApps, initializeApp, applicationDefault, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { firebaseConfig } from './config';

const APP_NAME = 'kflow-admin';

/** Mêmes comptes que isAdmin() dans firestore.rules. */
export const ADMIN_EMAILS = ['drnduwa@gmail.com', 'contact.congonamotema@gmail.com'];

function adminApp(): App {
  const existing = getApps().find(a => a.name === APP_NAME);
  if (existing) return existing;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return initializeApp(
    {
      credential: json ? cert(JSON.parse(json)) : applicationDefault(),
      projectId: firebaseConfig.projectId,
    },
    APP_NAME,
  );
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}

export class AuthError extends Error {}

/**
 * Vérifie le jeton Firebase envoyé par le client (user.getIdToken()) et renvoie l'uid.
 * Les Server Actions sont appelables par n'importe qui : on ne fait jamais confiance à un userId
 * passé en paramètre.
 */
export async function verifyCaller(idToken: string | undefined | null): Promise<{ uid: string; email: string | null; isAdmin: boolean }> {
  if (!idToken || typeof idToken !== 'string') throw new AuthError('Connexion requise.');
  try {
    const decoded = await getAuth(adminApp()).verifyIdToken(idToken);
    const email = decoded.email ?? null;
    return { uid: decoded.uid, email, isAdmin: !!email && ADMIN_EMAILS.includes(email) && decoded.email_verified !== false };
  } catch {
    throw new AuthError('Session expirée. Reconnectez-vous.');
  }
}

export async function verifyAdmin(idToken: string | undefined | null) {
  const caller = await verifyCaller(idToken);
  if (!caller.isAdmin) throw new AuthError('Réservé aux administrateurs.');
  return caller;
}
