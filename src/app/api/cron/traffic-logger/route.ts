import { NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getGoogleTrafficStatusAction } from '@/app/actions';
import { MAJOR_AXES } from '@/lib/constants';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET || 'kinshasa-flow-secret'}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await getGoogleTrafficStatusAction(MAJOR_AXES);
    
    const { firestore } = initializeFirebase();
    const historyCol = collection(firestore, 'traffic_history');

    const now = new Date();
    const dayOfWeek = now.getDay();
    const hourOfDay = now.getHours();

    const saves = data.map(async (res) => {
      await addDoc(historyCol, {
        road: res.road,
        status: res.status,
        speed: res.speed,
        delay: res.delay,
        timestamp: serverTimestamp(),
        dayOfWeek,
        hourOfDay
      });
    });

    await Promise.all(saves);

    return NextResponse.json({ success: true, logged: data.length });
  } catch (error: any) {
    console.error('Traffic Logger Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
