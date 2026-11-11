/**
 * Heure locale de Kinshasa (WAT, UTC+1, pas d'heure d'été).
 *
 * Les serveurs (Firebase App Hosting / Cloud Run) tournent en UTC : `new Date().getHours()`
 * y renvoie l'heure UTC, soit 1 h de retard sur Kinshasa. Toute donnée horaire liée au
 * trafic (historique, prévisions, heures de pointe) doit passer par ce module.
 */
const KINSHASA_UTC_OFFSET_HOURS = 1;

export function kinshasaNow(date: Date = new Date()) {
  const local = new Date(date.getTime() + KINSHASA_UTC_OFFSET_HOURS * 3600 * 1000);
  const hour = local.getUTCHours();
  return {
    hour,
    minute: local.getUTCMinutes(),
    /** 0 = dimanche … 6 = samedi, jour de Kinshasa (et non du serveur) */
    dayOfWeek: local.getUTCDay(),
    isPeakHour: (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 20),
    /** HH:MM:SS à Kinshasa, pour l'affichage */
    timeLabel: `${String(hour).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}:${String(local.getUTCSeconds()).padStart(2, '0')}`,
  };
}

/** Créneau de 30 min (clé de déduplication des votes : un vote par usager, par nœud, par créneau). */
export function voteSlot(date: Date = new Date()) {
  return Math.floor(date.getTime() / (30 * 60 * 1000));
}
