import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { answerTrafficQuestion } from '@/lib/flash-server';

/**
 * Bot WhatsApp (API WhatsApp Cloud de Meta) : « écrivez LIMETE » → état du carrefour en direct.
 *
 * Variables d'environnement :
 *  - WHATSAPP_VERIFY_TOKEN     jeton choisi par vous, saisi dans la console Meta (vérification du webhook)
 *  - WHATSAPP_APP_SECRET       secret de l'app Meta (vérifie la signature X-Hub-Signature-256)
 *  - WHATSAPP_TOKEN            jeton d'accès permanent du compte WhatsApp Business
 *  - WHATSAPP_PHONE_NUMBER_ID  identifiant du numéro d'envoi
 * Sans ces variables, la route répond 503 et n'envoie rien.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verify) return new NextResponse('WhatsApp non configuré', { status: 503 });
  if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === verify) {
    return new NextResponse(url.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

function validSignature(raw: string, header: string | null, secret: string) {
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!secret || !token || !phoneId) return NextResponse.json({ error: 'WhatsApp non configuré' }, { status: 503 });

  const raw = await request.text();
  if (!validSignature(raw, request.headers.get('x-hub-signature-256'), secret)) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
  }

  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  const messages: any[] = body?.entry?.flatMap((e: any) => e?.changes?.flatMap((c: any) => c?.value?.messages ?? []) ?? []) ?? [];

  for (const m of messages.slice(0, 5)) {
    if (m?.type !== 'text' || !m?.from) continue;
    try {
      const reply = await answerTrafficQuestion(String(m.text?.body ?? ''));
      await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: m.from, type: 'text', text: { body: reply.slice(0, 4000) } }),
      });
    } catch (err) {
      console.error('[WhatsApp] réponse impossible:', err);
    }
  }
  // Toujours 200 : sinon Meta renvoie le même message en boucle.
  return NextResponse.json({ ok: true });
}
