import { NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getGoogleTrafficStatusAction } from '@/app/actions';
import { MAJOR_AXES } from '@/lib/constants';
import { kinshasaNow } from '@/lib/kinshasa-time';

export async function GET(request: Request) {
  // Pas de secret par défaut : sans CRON_SECRET configuré, la route reste fermée.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await getGoogleTrafficStatusAction(MAJOR_AXES);
    
    // Écriture serveur (Admin SDK) : traffic_history n'est plus modifiable par les clients.
    const historyCol = adminDb().collection('traffic_history');

    // Heure de Kinshasa, pas celle du serveur (UTC)
    const { dayOfWeek, hour: hourOfDay, minute: minuteOfHour } = kinshasaNow();

    const saves = data.map(async (res) => {
      await historyCol.add({
        road: res.road,
        status: res.status,
        speed: res.speed,
        delay: res.delay,
        timestamp: FieldValue.serverTimestamp(),
        dayOfWeek,
        hourOfDay,
        minuteOfHour,
        tz: 'Africa/Kinshasa'
      });
    });

    await Promise.all(saves);

    return NextResponse.json({ success: true, logged: data.length });
  } catch (error: any) {
    console.error('Traffic Logger Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
