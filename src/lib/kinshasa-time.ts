/**
 * Helper centralisé pour l'heure locale exacte de Kinshasa (Africa/Kinshasa, UTC+1).
 * Évite les décalages d'horloge lorsque le serveur Next.js s'exécute en UTC ou US Central.
 */

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
