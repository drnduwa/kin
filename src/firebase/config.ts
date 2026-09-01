
const decodeKey = (b64: string) => {
  try {
    return typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
};

export const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "studio-874039458-d0447",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:196367644911:web:74bd118b2cb442b1dc031a",
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || decodeKey('QUl6YVN5RF93RWY4dEVrOVpmZkpmVW5MSTduZElUU3Q1cDA1Rm9V'),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "studio-874039458-d0447.firebaseapp.com",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-XVQQZYDFKN",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "196367644911",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "studio-874039458-d0447.firebasestorage.app"
};
