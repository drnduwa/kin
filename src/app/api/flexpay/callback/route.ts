import { NextResponse } from 'next/server';
import { fulfillVerifiedFlexPayPayment, markPaymentFailed } from '@/lib/payments-server';
import { checkFlexPayTransactionStatus } from '@/lib/flexpay';

/**
 * Webhook FlexPay (Mobile Money & carte).
 * Le corps du webhook n'est pas signé : on ne s'y fie pas. Il sert seulement à savoir quelle
 * commande revérifier ; le crédit n'a lieu que si FlexPay confirme lui-même le paiement.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const orderNumber = payload.orderNumber || payload.order_number;

    if (!orderNumber || typeof orderNumber !== 'string') {
      return NextResponse.json({ error: 'Missing orderNumber' }, { status: 400 });
    }

    const check = await checkFlexPayTransactionStatus(orderNumber);
    if (check.success && check.status === '0') {
      const result = await fulfillVerifiedFlexPayPayment(orderNumber);
      if (!result.success) {
        console.error(`[FlexPay Webhook] Crédit impossible pour ${orderNumber}:`, result.error);
      }
    } else if (check.success && check.status === '1') {
      await markPaymentFailed(orderNumber);
    }

    return NextResponse.json({ received: true, orderNumber }, { status: 200 });
  } catch (error: any) {
    console.error('[FlexPay Webhook] Error processing callback:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
