import { NextResponse } from 'next/server';
import { getRealtimeCommandDashboardAction } from '@/app/actions';

/**
 * Relevé régulier pour les prévisions (à appeler toutes les 15 à 30 min par Cloud Scheduler).
 *
 * Rafraîchit le centre de contrôle : les 8 carrefours et les axes mesurés (~22 appels Google Routes)
 * sont mesurés en direct et mémorisés dans traffic_profiles (une valeur par quart d'heure).
 * Sans ce relevé, l'historique ne se remplit que quand quelqu'un ouvre le centre de contrôle.
 */
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
    const data = await getRealtimeCommandDashboardAction(true);
    const nodes = (data?.bottlenecks || []) as Array<{ source?: string }>;
    const corridors = Object.values(data?.corridors || {}) as Array<{ isLive?: boolean }>;
    return NextResponse.json({
      success: true,
      nodesLive: nodes.filter(n => n.source === 'google').length,
      corridorsLive: corridors.filter(c => c.isLive).length,
    });
  } catch (error: any) {
    console.error('Traffic Logger Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
