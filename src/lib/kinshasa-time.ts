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

// ── Variante Intl (Africa/Kinshasa), venue de main ──

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getKinshasaTimeParts(date: Date = new Date()): {
  hourOfDay: number;
  minute: number;
  dayOfWeek: number;
  formattedTime: string;
} {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Kinshasa',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    const hourRaw = parseInt(get('hour'), 10);
    const hourOfDay = Number.isNaN(hourRaw) ? (date.getUTCHours() + 1) % 24 : hourRaw % 24;
    const minute = parseInt(get('minute'), 10) || 0;
    const second = get('second') || '00';
    const dayOfWeek = DAY_INDEX[get('weekday')] ?? new Date(date.getTime() + 3600_000).getUTCDay();

    return {
      hourOfDay,
      minute,
      dayOfWeek,
      formattedTime: `${hourOfDay.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second}`,
    };
  } catch {
    const kinMs = date.getTime() + 3600_000;
    const kinDate = new Date(kinMs);
    const hourOfDay = kinDate.getUTCHours();
    const minute = kinDate.getUTCMinutes();
    const second = kinDate.getUTCSeconds();
    return {
      hourOfDay,
      minute,
      dayOfWeek: kinDate.getUTCDay(),
      formattedTime: `${hourOfDay.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`,
    };
  }
}
