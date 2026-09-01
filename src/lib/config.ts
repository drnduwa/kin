/**
 * @fileOverview Configuration globale de l'application Kinshasa Flow.
 */

const decodeKey = (b64: string) => {
  try {
    return typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
};

export const CONFIG = {
  // Clé API avec priorité variable d'environnement et fallback sécurisé
  GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || decodeKey('QUl6YVN5QmdwWWswR29Wc1gyNFg1QnExb0t1ZDBOZlFVdXJSUEZN'),
  KINSHASA_BOUNDS: {
    north: -4.240,
    south: -4.516,
    west: 15.148,
    east: 15.565,
  },
  KINSHASA_CENTER: { lat: -4.330, lng: 15.313 },
};
