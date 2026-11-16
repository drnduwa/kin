/**
 * Contrôle des messages du Chat Direct, partagé entre le navigateur et le serveur :
 * nettoyage, refus des liens / numéros (arnaques), insultes masquées, et détection des
 * messages qui parlent de trafic pour proposer d'en faire une alerte vérifiée.
 */
export type ChatAlertType = 'embouteillage' | 'travaux' | 'police';

export const CHAT_MAX_LEN = 280;

const INSULTS = ['connard', 'connasse', 'salope', 'pute', 'putain', 'encule', 'enculé', 'merde', 'fdp', 'ndoki', 'zoba', 'mbwa'];
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|cd|io|xyz|info|link|ly)\b)/i;
const PHONE = /(\+?243|\b0)[\s.-]?[89]\d(?:[\s.-]?\d){7}\b/;

export function cleanText(raw: string): string {
  return String(raw || '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX_LEN);
}

/** Remplace les insultes par des étoiles (on garde la première lettre). */
export function softenInsults(text: string): string {
  let out = text;
  for (const w of INSULTS) {
    const re = new RegExp(`\\b${w.normalize('NFD').replace(/[̀-ͯ]/g, '')}\\b`, 'gi');
    out = out.normalize('NFC').replace(re, m => m[0] + '*'.repeat(Math.max(2, m.length - 1)));
  }
  return out;
}

export type ChatCheck =
  | { ok: true; text: string; suggest: ChatAlertType | null }
  | { ok: false; reason: string };

/** Vérifie un message libre avant envoi. */
/** Pour un texte produit automatiquement (transcription) : on masque liens et numéros au lieu de refuser. */
export function maskForChat(raw: string): string {
  const LINK_G = new RegExp(LINK.source, 'gi');
  const PHONE_G = new RegExp(PHONE.source, 'g');
  return softenInsults(cleanText(raw).replace(LINK_G, '[lien retiré]').replace(PHONE_G, '[numéro retiré]')).slice(0, CHAT_MAX_LEN);
}

export function checkChatText(raw: string): ChatCheck {
  const text = cleanText(raw);
  if (text.length < 2) return { ok: false, reason: 'Message trop court.' };
  if (LINK.test(text)) return { ok: false, reason: "Les liens ne sont pas autorisés dans le chat (trop d'arnaques)." };
  if (PHONE.test(text)) return { ok: false, reason: 'Pas de numéro de téléphone dans le chat : protégez-vous des arnaques.' };
  if (/(.)\1{7,}/.test(text)) return { ok: false, reason: 'Message illisible.' };
  if (text.length > 12 && text.replace(/[^A-Z]/g, '').length / text.replace(/[^A-Za-z]/g, '').length > 0.8) {
    return { ok: true, text: softenInsults(text.toLowerCase()), suggest: detectAlert(text) };
  }
  return { ok: true, text: softenInsults(text), suggest: detectAlert(text) };
}

const KEYWORDS: Record<ChatAlertType, string[]> = {
  embouteillage: ['bouchon', 'embouteillage', 'ekangami', 'ekangi', 'bloque', 'bloqué', 'ça bouge pas', 'ca bouge pas', 'jam', 'trafic dense', 'ezali kotambola te', 'accident'],
  travaux: ['travaux', 'chantier', 'route coupée', 'route coupee', 'trou', 'nid de poule', 'inondé', 'inonde', 'eau partout', 'erosion', 'érosion'],
  police: ['police', 'pcr', 'roulage', 'contrôle', 'controle', 'barrage', 'agents'],
};

export function detectAlert(text: string): ChatAlertType | null {
  const t = text.toLowerCase();
  for (const type of ['police', 'travaux', 'embouteillage'] as ChatAlertType[]) {
    if (KEYWORDS[type].some(k => t.includes(k))) return type;
  }
  return null;
}

/** Type de signalement routier correspondant (collection road_condition_reports). */
export const ALERT_TO_REPORT: Record<ChatAlertType, 'blockage' | 'damaged_road' | 'police'> = {
  embouteillage: 'blockage',
  travaux: 'damaged_road',
  police: 'police',
};
