'use server';
/**
 * Comprendre une note vocale de Radio Trottoir (Gemini, audio en entrée).
 * Le Kinois parle français, lingala ou les deux : on rend un texte en français, plus l'alerte
 * routière éventuelle (type + lieu) pour proposer « en faire une alerte vérifiée » en un geste.
 */
import { z } from 'genkit';
import { ai } from '@/ai/genkit';

const VoiceNoteOutput = z.object({
  transcript: z.string().describe("Ce que dit la personne, en français simple (traduire le lingala), 280 caractères max. Vide si inaudible."),
  language: z.enum(['fr', 'ln', 'mixte', 'autre', 'inaudible']),
  isTraffic: z.boolean().describe('La note parle de circulation, de route ou de transport à Kinshasa.'),
  alertType: z.enum(['embouteillage', 'travaux', 'police']).nullable()
    .describe("embouteillage = bouchon, accident, route bloquée ; travaux = chantier, trou, inondation, route abîmée ; police = contrôle, PCR, roulage, barrage. null sinon."),
  place: z.string().nullable().describe("Lieu précis cité à Kinshasa (avenue, rond-point, carrefour, commune), tel quel. null si aucun."),
});
export type VoiceNoteUnderstanding = z.infer<typeof VoiceNoteOutput>;

export function hasGeminiKey() {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY);
}

export async function understandVoiceNote(audio: { base64: string; contentType: string }): Promise<VoiceNoteUnderstanding> {
  const { output } = await ai.generate({
    prompt: [
      { media: { url: `data:${audio.contentType};base64,${audio.base64}`, contentType: audio.contentType } },
      {
        text: `Tu écoutes une note vocale envoyée dans le chat trafic « Radio Trottoir » de Kinshasa Flow (RD Congo).
La personne peut parler français, lingala, ou mélanger les deux, avec des mots de la rue kinoise.
1. Écris ce qu'elle dit, en français clair et fidèle (traduis le lingala). N'invente rien. Si c'est inaudible, transcript vide et language "inaudible".
2. Dis si elle signale un problème de route, et lequel (embouteillage, travaux, police), seulement si c'est explicite.
3. Recopie le lieu cité (avenue, rond-point, marché, commune) s'il y en a un.
Ne recopie jamais un numéro de téléphone ni un lien.`,
      },
    ],
    output: { schema: VoiceNoteOutput },
    config: { temperature: 0 },
  });
  if (!output) throw new Error('Réponse vide');
  return output;
}
