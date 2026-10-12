import { FlexPayPaymentRequest, FlexPayResponse, FlexPayCheckResponse } from './types';

const FLEXPAY_MERCHANT = process.env.FLEXPAY_MERCHANT || 'ZOLAMO';
const FLEXPAY_TOKEN = process.env.FLEXPAY_TOKEN?.startsWith('Bearer ') 
  ? process.env.FLEXPAY_TOKEN 
  : `Bearer ${process.env.FLEXPAY_TOKEN || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiIvbG9naW4iLCJyb2xlcyI6WyJNRVJDSEFOVCJdLCJleHAiOjE4NTQ4Njg4NDgsInN1YiI6Ijg2NDE5ZjcwYjhmZWZmNzFjNGZjMzE1MDU4NzZlMDA5In0.etG43iiE6XfOBN8YOhCzbl4SCUb_EGE7NXDtodPayhA'}`;
const FLEXPAY_API_URL = process.env.FLEXPAY_API_URL || 'https://corporateapi.flexpay.cd/api/rest/v1';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kinshasaflow.online';

/**
 * Format phone to standard DRC format: 243XXXXXXXXX (12 digits)
 */
export function formatDRCPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '243' + cleaned.substring(1);
  } else if (!cleaned.startsWith('243') && cleaned.length === 9) {
    cleaned = '243' + cleaned;
  }
  return cleaned;
}

/**
 * Detect network / operator from DRC phone number
 */
export function detectDRCOperator(phone: string): 'VODACOM' | 'ORANGE' | 'AIRTEL' | 'AFRIMONEY' | 'AUTRE' {
  const formatted = formatDRCPhone(phone);
  const prefix2 = formatted.substring(3, 5); // Digits after 243
  
  // Vodacom: 81, 82, 83
  if (['81', '82', '83'].includes(prefix2)) return 'VODACOM';
  // Orange: 80, 84, 85, 89
  if (['80', '84', '85', '89'].includes(prefix2)) return 'ORANGE';
  // Airtel: 97, 98, 99
  if (['97', '98', '99'].includes(prefix2)) return 'AIRTEL';
  // Africell (Afrimoney): 90, 91
  if (['90', '91'].includes(prefix2)) return 'AFRIMONEY';

  return 'AUTRE';
}

/**
 * Initiate Mobile Money Payment via FlexPay (Type "1")
 * Supports Vodacom M-Pesa, Orange Money, Airtel Money, Afrimoney
 */
export async function initiateFlexPayMobileMoney(params: {
  phone: string;
  amount: number;
  currency: 'CDF' | 'USD';
  reference: string;
}): Promise<{
  success: boolean;
  orderNumber?: string;
  message?: string;
  error?: string;
}> {
  try {
    const formattedPhone = formatDRCPhone(params.phone);
    if (formattedPhone.length !== 12 || !formattedPhone.startsWith('243')) {
      return { success: false, error: 'Numéro de téléphone invalide (format attendu : 08X..., 09X... ou +243...)' };
    }

    const payload: FlexPayPaymentRequest = {
      merchant: FLEXPAY_MERCHANT,
      type: "1",
      phone: formattedPhone,
      reference: params.reference,
      amount: params.amount,
      currency: params.currency,
      callback_url: `${APP_URL}/api/flexpay/callback`,
    };

    console.log('[FlexPay] Initiating Mobile Money payment:', {
      reference: params.reference,
      phone: formattedPhone,
      amount: params.amount,
      currency: params.currency
    });

    const response = await fetch(`${FLEXPAY_API_URL}/paymentService`, {
      method: 'POST',
      headers: {
        'Authorization': FLEXPAY_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: FlexPayResponse = await response.json();
    console.log('[FlexPay] Response Mobile Money:', data);

    if (String(data.code) === '0' && data.orderNumber) {
      return {
        success: true,
        orderNumber: data.orderNumber,
        message: data.message || 'Demande de paiement envoyée sur votre téléphone. Veuillez valider avec votre code PIN.',
      };
    }

    return {
      success: false,
      error: data.message || `Erreur FlexPay (${data.code})`,
    };
  } catch (err: any) {
    console.error('[FlexPay] Exception in initiateFlexPayMobileMoney:', err);
    return {
      success: false,
      error: err.message || 'Impossible de joindre le serveur FlexPay.',
    };
  }
}

/**
 * Initiate Card Payment via FlexPay (Type "2")
 * Supports Visa & Mastercard
 */
export async function initiateFlexPayCard(params: {
  amount: number;
  currency: 'CDF' | 'USD';
  reference: string;
  description?: string;
}): Promise<{
  success: boolean;
  orderNumber?: string;
  url?: string;
  message?: string;
  error?: string;
}> {
  try {
    const payload: FlexPayPaymentRequest = {
      merchant: FLEXPAY_MERCHANT,
      type: "2",
      reference: params.reference,
      amount: params.amount,
      currency: params.currency,
      description: params.description || 'Recharge Kinshasa Flow',
      callback_url: `${APP_URL}/api/flexpay/callback`,
      approve_url: `${APP_URL}/mes-stars?payment=approved&ref=${params.reference}`,
      cancel_url: `${APP_URL}/mes-stars?payment=cancelled&ref=${params.reference}`,
      decline_url: `${APP_URL}/mes-stars?payment=declined&ref=${params.reference}`,
    };

    console.log('[FlexPay] Initiating Card payment:', {
      reference: params.reference,
      amount: params.amount,
      currency: params.currency
    });

    const response = await fetch(`${FLEXPAY_API_URL}/paymentService`, {
      method: 'POST',
      headers: {
        'Authorization': FLEXPAY_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: FlexPayResponse = await response.json();
    console.log('[FlexPay] Response Card:', data);

    if (String(data.code) === '0' && data.url) {
      return {
        success: true,
        orderNumber: data.orderNumber,
        url: data.url,
        message: 'Redirection vers la page sécurisée de paiement par carte.',
      };
    }

    return {
      success: false,
      error: data.message || `Erreur FlexPay (${data.code})`,
    };
  } catch (err: any) {
    console.error('[FlexPay] Exception in initiateFlexPayCard:', err);
    return {
      success: false,
      error: err.message || 'Impossible de joindre le serveur FlexPay.',
    };
  }
}

/**
 * Check transaction status on FlexPay
 * Status codes:
 * - '0': Transaction successful
 * - '1': Transaction failed / cancelled
 * - '2': Transaction pending
 */
export async function checkFlexPayTransactionStatus(orderNumber: string): Promise<{
  success: boolean;
  status: '0' | '1' | '2' | 'unknown';
  orderNumber: string;
  reference?: string;
  amount?: string | number;
  currency?: string;
  channel?: string;
  message?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${FLEXPAY_API_URL}/check/${orderNumber}`, {
      method: 'GET',
      headers: {
        'Authorization': FLEXPAY_TOKEN,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        success: false,
        status: 'unknown',
        orderNumber,
        error: `Erreur HTTP FlexPay : ${response.status}`,
      };
    }

    const data: FlexPayCheckResponse = await response.json();
    const statusCode = String(data.transaction?.status ?? '');

    let normalizedStatus: '0' | '1' | '2' | 'unknown' = 'unknown';
    if (statusCode === '0') normalizedStatus = '0';
    else if (statusCode === '1') normalizedStatus = '1';
    else if (statusCode === '2') normalizedStatus = '2';

    return {
      success: true,
      status: normalizedStatus,
      orderNumber,
      reference: data.transaction?.reference,
      amount: data.transaction?.amount,
      currency: data.transaction?.currency,
      channel: data.transaction?.channel,
      message: data.message,
    };
  } catch (err: any) {
    console.error('[FlexPay] Exception in checkFlexPayTransactionStatus:', err);
    return {
      success: false,
      status: 'unknown',
      orderNumber,
      error: err.message || 'Erreur lors de la vérification de la transaction.',
    };
  }
}
