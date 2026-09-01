/**
 * @fileOverview Configuration globale de l'application Kinshasa Flow.
 */

export const CONFIG = {
  // Clé API injectée depuis l'environnement
  GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  KINSHASA_BOUNDS: {
    north: -4.240,
    south: -4.516,
    west: 15.148,
    east: 15.565,
  },
  KINSHASA_CENTER: { lat: -4.330, lng: 15.313 },
};
