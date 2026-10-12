import { NextResponse } from 'next/server';
import { fulfillFlexPayPayment } from '@/app/actions';
import { initializeFirebase } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Webhook callback route for FlexPay (Mobile Money & Card notifications)
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('[FlexPay Webhook] Received callback payload:', payload);

    const orderNumber = payload.orderNumber || payload.order_number;
    const statusCode = String(payload.code ?? payload.status ?? '');

    if (!orderNumber) {
      console.warn('[FlexPay Webhook] Missing orderNumber in payload');
      return NextResponse.json({ error: 'Missing orderNumber' }, { status: 400 });
    }

    // Status "0" indicates successful transaction in FlexPay
    if (statusCode === '0') {
      console.log(`[FlexPay Webhook] Fulfilling order ${orderNumber}...`);
      const result = await fulfillFlexPayPayment(orderNumber);
      if (!result.success) {
        console.error(`[FlexPay Webhook] Fulfillment failed for ${orderNumber}:`, result.error);
      }
    } else if (statusCode === '1') {
      console.log(`[FlexPay Webhook] Order ${orderNumber} failed or declined`);
      const { firestore } = initializeFirebase();
      const paymentRef = doc(firestore, 'payments', orderNumber);
      await updateDoc(paymentRef, {
        status: 'failed',
        failedAt: serverTimestamp(),
      }).catch(() => {});
    }

    return NextResponse.json({ received: true, orderNumber }, { status: 200 });
  } catch (error: any) {
    console.error('[FlexPay Webhook] Error processing callback:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
