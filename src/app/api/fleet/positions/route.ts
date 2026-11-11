import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { nearestNode } from '@/lib/places';
import { anonId, inKinshasa, recordNodeSpeed } from '@/lib/probes-server';

/**
 * API flotte « Kin Flow Pro » : les partenaires envoient les positions de leurs véhicules.
 *
 *   POST /api/fleet/positions
 *   Authorization: Bearer kfp_…            (clé créée dans Admin › Croissance)
 *   { "vehicles": [ { "id": "moto-12", "lat": -4.35, "lng": 15.34, "speedKmh": 6.5, "ts": 1731400000000 } ] }
 *
 * En échange, le partenaire voit sa flotte sur /pro avec les alertes de bouchons.
 * Les vitesses près des nœuds alimentent la carte (agrégées, anonymes).
 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization') || '';
  const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!key.startsWith('kfp_')) return NextResponse.json({ error: 'Clé API manquante.' }, { status: 401 });

  const db = adminDb();
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  let partnerSnap;
  try {
    partnerSnap = await db.collection('fleet_partners').where('apiKeyHash', '==', hash).limit(1).get();
  } catch (err) {
    console.error('[Fleet API] base indisponible:', err);
    return NextResponse.json({ error: 'Service momentanément indisponible.' }, { status: 503 });
  }
  if (partnerSnap.empty || partnerSnap.docs[0].data().active === false) {
    return NextResponse.json({ error: 'Clé API invalide ou désactivée.' }, { status: 401 });
  }
  const partnerRef = partnerSnap.docs[0].ref;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 }); }
  const vehicles: any[] = Array.isArray(body?.vehicles) ? body.vehicles.slice(0, 200) : [];
  const now = Date.now();
  let stored = 0, probes = 0;

  const batch = db.batch();
  const probeWrites: Promise<unknown>[] = [];
  for (const v of vehicles) {
    const id = String(v?.id ?? '').replace(/[^\w.-]/g, '').slice(0, 64);
    const lat = Number(v?.lat), lng = Number(v?.lng);
    const ts = Number(v?.ts ?? now);
    const speed = v?.speedKmh === undefined || v?.speedKmh === null ? null : Number(v.speedKmh);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng) || !inKinshasa({ lat, lng })) continue;
    if (!Number.isFinite(ts) || ts > now + 60_000 || ts < now - 30 * 60_000) continue;

    batch.set(partnerRef.collection('vehicles').doc(id), {
      lat, lng, speedKmh: Number.isFinite(speed as number) ? speed : null, tsMs: ts, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    stored++;

    // Vitesse mesurée par le boîtier : utile seulement si le véhicule roule (≥ 0,5 km/h)
    // et qu'elle est récente (< 5 min). Un véhicule garé n'est pas un bouchon.
    if (speed !== null && Number.isFinite(speed) && speed >= 0.5 && speed <= 100 && now - ts < 5 * 60_000) {
      const near = nearestNode({ lat, lng });
      if (near) {
        probeWrites.push(recordNodeSpeed(near.node.id, Math.round(speed * 10) / 10, anonId(`fleet:${partnerRef.id}:${id}`), ts));
        probes++;
      }
    }
  }
  await Promise.all([batch.commit(), ...probeWrites]);
  return NextResponse.json({ received: vehicles.length, stored, usedForTraffic: probes });
}
