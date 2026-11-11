'use server';
/**
 * @fileOverview Un assistant IA stratégique pour Kinshasa.
 * 
 * Capable d'étudier des itinéraires alternatifs en comparant les données réelles de trafic.
 */

import {ai} from '@/ai/genkit';
import { AssistantInput, AssistantInputSchema, AssistantOutput, AssistantOutputSchema } from '@/lib/types';
import { z } from 'genkit';
import { CONFIG } from '@/lib/config';

const GOOGLE_API_KEY = process.env.GOOGLE_ROUTES_API_KEY || CONFIG.GOOGLE_MAPS_API_KEY;

/**
 * Outil permettant à l'IA d'analyser en profondeur un trajet entre deux points.
 */
const getDetailedRoute = ai.defineTool(
  {
    name: 'getDetailedRoute',
    description: 'Analyse et compare les itinéraires entre deux lieux de Kinshasa pour trouver le plus rapide.',
    inputSchema: z.object({
      origin: z.string().describe('Lieu de départ (ex: Victoire, Lemba, UPN).'),
      destination: z.string().describe('Lieu d\'arrivée (ex: Gombe, Aéroport, Pompage).'),
    }),
    outputSchema: z.object({
        bestRoute: z.object({
            summary: z.string(),
            durationText: z.string(),
            durationValue: z.number(),
            delayMinutes: z.number(),
            distance: z.string(),
            status: z.string(),
        }),
        alternative: z.object({
            summary: z.string(),
            durationText: z.string(),
            durationValue: z.number(),
            differenceText: z.string(),
        }).optional(),
        message: z.string(),
    }),
  },
  async (input) => {
    try {
        const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
        const body = {
          origin: { address: `${input.origin}, Kinshasa, RDC` },
          destination: { address: `${input.destination}, Kinshasa, RDC` },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE_OPTIMAL",
          computeAlternativeRoutes: true,
          languageCode: "fr-FR"
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.description'
          },
          body: JSON.stringify(body)
        });

        const data = await res.json();
        if (!data?.routes || data.routes.length === 0) {
            return { 
                bestRoute: { summary: "Inconnu", durationText: "N/A", durationValue: 0, delayMinutes: 0, distance: "N/A", status: "ERREUR" },
                message: "Je n'ai pas pu calculer cet itinéraire. Vérifiez les noms des lieux."
            };
        }

        const main = data.routes[0];
        const dur = parseInt((main.duration ?? "0s").replace('s', '')) || 1;
        const statDur = parseInt((main.staticDuration ?? main.duration ?? "0s").replace('s', '')) || 1;
        const delay = Math.round(Math.max(0, dur - statDur) / 60);
        const dist = (main.distanceMeters / 1000).toFixed(1) + " km";

        let status = "FLUIDE";
        if (delay > 10) status = "TRÈS BOUCHÉ";
        else if (delay > 4) status = "DENSE";

        const result: any = {
            bestRoute: {
                summary: main.description || "Itinéraire principal",
                durationText: Math.round(dur/60) + " min",
                durationValue: dur,
                delayMinutes: delay,
                distance: dist,
                status
            },
            message: `Analyse terminée pour le trajet ${input.origin} vers ${input.destination}.`
        };

        if (data.routes.length > 1) {
            const alt = data.routes[1];
            const altDur = parseInt((alt.duration ?? "0s").replace('s', '')) || 1;
            const diff = Math.round((altDur - dur) / 60);
            result.alternative = {
                summary: alt.description || "Option alternative",
                durationText: Math.round(altDur/60) + " min",
                durationValue: altDur,
                differenceText: diff > 0 ? `+${diff} min` : `${diff} min`
            };
        }

        return result;
    } catch (e) {
        return { 
            bestRoute: { summary: "Erreur", durationText: "N/A", durationValue: 0, delayMinutes: 0, distance: "N/A", status: "ERREUR" },
            message: "Erreur technique de calcul."
        };
    }
  }
);

/**
 * Outil pour vérifier le trafic local sur un point précis.
 */
const getTrafficAtLocation = ai.defineTool(
  {
    name: 'getTrafficAtLocation',
    description: 'Récupère l\'état du trafic pour un lieu précis de Kinshasa.',
    inputSchema: z.object({
      locationName: z.string().describe('Nom du lieu.'),
    }),
    outputSchema: z.object({
        placeName: z.string(),
        status: z.string(),
        message: z.string(),
    }),
  },
  async (input) => {
    const query = `${input.locationName}, Kinshasa, RDC`;
    try {
        const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`;
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();
        if (!geoData.results?.length) return { placeName: input.locationName, status: "INCONNU", message: "Lieu introuvable." };

        const loc = geoData.results[0].geometry.location;
        const routesUrl = "https://routes.googleapis.com/directions/v2:computeRoutes";
        const body = {
          origin: { location: { latLng: { latitude: loc.lat, longitude: loc.lng } } },
          destination: { location: { latLng: { latitude: loc.lat + 0.003, longitude: loc.lng + 0.003 } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE_OPTIMAL",
          languageCode: "fr-FR"
        };

        const res = await fetch(routesUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'routes.duration,routes.staticDuration'
          },
          body: JSON.stringify(body)
        });

        const data = await res.json();
        const route = data?.routes?.[0];
        if (!route) return { placeName: input.locationName, status: "FLUIDE", message: "Pas de trafic détecté." };

        const dur = parseInt((route.duration ?? "0s").replace('s', '')) || 1;
        const stat = parseInt((route.staticDuration ?? route.duration ?? "0s").replace('s', '')) || 1;
        const delay = Math.round((dur - stat) / 60);

        let status = "FLUIDE";
        if (delay > 5) status = "EMBOUTEILLAGE";
        else if (delay >= 2) status = "DENSE";

        return {
            placeName: geoData.results[0].formatted_address,
            status,
            message: `Trafic ${status} détecté à ${input.locationName}.`
        };
    } catch (e) {
        return { placeName: input.locationName, status: "ERREUR", message: "Erreur de connexion." };
    }
  }
);

const prompt = ai.definePrompt({
  name: 'routeAssistantPrompt',
  input: {schema: AssistantInputSchema},
  output: {schema: AssistantOutputSchema},
  tools: [getTrafficAtLocation, getDetailedRoute],
  prompt: `Vous êtes 'K-Flow Assistant', l'expert vocal en mobilité de Kinshasa. 
Votre but : Faire gagner du temps aux Kinois en étudiant les données réelles.

VOTRE MISSION STRATÉGIQUE :
1. Si l'utilisateur demande un trajet (ex: "Comment aller de A vers B?"), UTILISEZ 'getDetailedRoute'.
2. ANALYSEZ les alternatives : Si l'itinéraire principal est bouché (DENSE ou TRÈS BOUCHÉ), proposez activement l'alternative si elle est plus rapide.
3. CONSEILS PRATIQUES : Ne donnez pas juste des chiffres. Dites par exemple : "Le Boulevard est saturé, passez plutôt par les petites rues de Bandal, c'est plus dégagé."
4. TON : Amical, expert, parlant en Frangala (Français + Lingala).
5. FORMAT : Soyez concis mais précis sur les minutes de retard.

Question de l'utilisateur : {{{question}}}`,
});

export async function askAssistant(input: AssistantInput): Promise<AssistantOutput> {
  return routeAssistantFlow(input);
}

const routeAssistantFlow = ai.defineFlow(
  {
    name: 'routeAssistantFlow',
    inputSchema: AssistantInputSchema,
    outputSchema: AssistantOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
