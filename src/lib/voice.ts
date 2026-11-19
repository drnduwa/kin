/**
 * Notes vocales : choix du format et diagnostic du micro (navigateur uniquement).
 *
 * Format : AAC dans MP4 quand le navigateur sait l'enregistrer (Safari iPhone, Chrome récent) —
 * c'est le seul format que TOUS les téléphones savent relire. Sinon Opus (WebM / Ogg).
 * Avant, le fichier était étiqueté « audio/wav » alors que c'était du WebM : beaucoup de
 * téléphones (iPhone surtout) refusaient de le lire.
 */

const PREFERRED = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/webm',
];

export function pickVoiceMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return PREFERRED.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

/** Type « propre » (sans codecs) et extension de fichier pour un type MIME enregistré. */
export function voiceFileInfo(mime: string): { contentType: string; ext: string } {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  if (base === 'audio/mp4' || base === 'audio/aac' || base === 'audio/x-m4a') return { contentType: 'audio/mp4', ext: 'm4a' };
  if (base === 'audio/ogg') return { contentType: 'audio/ogg', ext: 'ogg' };
  if (base === 'audio/mpeg') return { contentType: 'audio/mpeg', ext: 'mp3' };
  return { contentType: 'audio/webm', ext: 'webm' };
}

/** Notre propre application (Capacitor Android / iOS), pas un navigateur. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** Navigateurs intégrés (WhatsApp, Facebook, Instagram, TikTok…) : souvent sans accès au micro. */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isNativeApp()) return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|TikTok|Snapchat|; wv\)/i.test(ua);
}

export type MicProblem = { title: string; description: string };

/** Pourquoi on ne peut pas enregistrer ici (null = ça devrait marcher). */
export function voiceSupportProblem(): MicProblem | null {
  if (typeof window === 'undefined') return null;
  if (!window.isSecureContext) {
    return { title: 'Connexion non sécurisée', description: 'Ouvrez Kinshasa Flow en https pour utiliser le micro.' };
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return isInAppBrowser()
      ? { title: 'Micro indisponible dans WhatsApp / Facebook', description: 'Touchez ⋮ puis « Ouvrir dans Chrome » (ou Safari), et réessayez la note vocale.' }
      : { title: 'Navigateur trop ancien', description: 'Mettez à jour Chrome ou Safari pour envoyer des notes vocales.' };
  }
  return null;
}

/** Message clair selon l'erreur renvoyée par getUserMedia. */
export function micErrorMessage(err: unknown): MicProblem {
  const name = (err as { name?: string })?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    if (isNativeApp()) {
      return { title: 'Micro non autorisé', description: 'Ouvrez Paramètres › Applications › Kinshasa Flow › Autorisations, activez « Micro », puis réessayez. Si l’option n’apparaît pas, mettez l’application à jour.' };
    }
    return isInAppBrowser()
      ? { title: 'Micro refusé par WhatsApp / Facebook', description: 'Touchez ⋮ puis « Ouvrir dans Chrome » (ou Safari) pour parler.' }
      : { title: 'Micro bloqué', description: 'Touchez le cadenas à côté de l’adresse du site, autorisez « Micro », puis réessayez.' };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { title: 'Aucun micro trouvé', description: 'Branchez ou activez un micro, puis réessayez.' };
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return { title: 'Micro occupé', description: 'Une autre application (appel, WhatsApp…) utilise le micro. Fermez-la et réessayez.' };
  }
  return { title: 'Enregistrement impossible', description: 'Réessayez dans un instant.' };
}

export function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
