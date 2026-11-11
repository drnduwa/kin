/**
 * Crédit des commandes FlexPay — serveur uniquement (pas de "use server" : ces fonctions ne doivent
 * PAS être appelables depuis le navigateur).
 *
 * Avant ce correctif, `fulfillFlexPayPayment` était une Server Action exportée : n'importe qui
 * connaissant un numéro de commande en attente pouvait se faire créditer sans avoir payé.
 * Désormais on redemande toujours le statut à FlexPay avant de créditer, et l'écriture passe par
 * l'Admin SDK dans une transaction (idempotente).
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { checkFlexPayTransactionStatus } from '@/lib/flexpay';

export async function markPaymentFailed(orderNumber: string) {
  await adminDb().collection('payments').doc(orderNumber)
    .update({ status: 'failed', failedAt: FieldValue.serverTimestamp() })
    .catch(() => {});
}

export async function fulfillVerifiedFlexPayPayment(orderNumber: string): Promise<{ success: boolean; error?: string }> {
  if (!orderNumber || typeof orderNumber !== 'string') return { success: false, error: 'Commande invalide.' };

  // 1. Ne jamais croire l'appelant (navigateur ou webhook) : on demande à FlexPay.
  const check = await checkFlexPayTransactionStatus(orderNumber);
  if (!check.success || check.status !== '0') {
    return { success: false, error: 'Paiement non confirmé par FlexPay.' };
  }

  const db = adminDb();
  const paymentRef = db.collection('payments').doc(orderNumber);

  try {
    await db.runTransaction(async (tx) => {
      const paymentSnap = await tx.get(paymentRef);
      if (!paymentSnap.exists) throw new Error(`Paiement ${orderNumber} introuvable.`);
      const payment = paymentSnap.data() as any;
      if (payment.status === 'success') return; // déjà crédité : idempotent

      // Le montant réellement payé doit couvrir le prix enregistré à la création de la commande.
      if (check.amount !== undefined && Number(check.amount) + 0.001 < Number(payment.amount)) {
        throw new Error(`Montant payé (${check.amount}) inférieur au prix (${payment.amount}).`);
      }
      if (check.currency && payment.currency && String(check.currency).toUpperCase() !== String(payment.currency).toUpperCase()) {
        throw new Error(`Devise payée (${check.currency}) différente de la commande (${payment.currency}).`);
      }

      const userRef = db.collection('users').doc(payment.userId);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new Error(`Utilisateur ${payment.userId} introuvable.`);
      const user = userSnap.data() as any;

      tx.update(paymentRef, { status: 'success', completedAt: FieldValue.serverTimestamp() });

      if (payment.itemType === 'pack' && payment.stars) {
        const added = Number(payment.stars);
        const newBalance = (user.currentStarsBalance || 0) + added;
        tx.update(userRef, {
          currentStarsBalance: newBalance,
          totalStarsPurchased: (user.totalStarsPurchased || 0) + added,
        });
        tx.set(userRef.collection('star_transactions').doc(), {
          userId: payment.userId,
          type: 'purchase',
          starsChange: added,
          balanceAfterTransaction: newBalance,
          description: `Achat Pack ${added} Stars FlexPay (${payment.amount} ${payment.currency})`,
          relatedObjectId: orderNumber,
          relatedObjectType: 'flexpay_pack',
          timestamp: FieldValue.serverTimestamp(),
        });
      } else if (payment.itemType === 'pass' && payment.passType) {
        const days = payment.passType === 'weekly' ? 7 : 30;
        let base = new Date();
        const currentExpiry: Date | null = user.passExpiresAt?.toDate ? user.passExpiresAt.toDate() : null;
        if (user.hasActivePass && currentExpiry && currentExpiry > base) base = currentExpiry; // prolonge
        const newExpiry = new Date(base.getTime() + days * 24 * 3600 * 1000);
        tx.update(userRef, { hasActivePass: true, passExpiresAt: Timestamp.fromDate(newExpiry), passType: payment.passType });
        tx.set(userRef.collection('star_transactions').doc(), {
          userId: payment.userId,
          type: 'purchase',
          starsChange: 0,
          balanceAfterTransaction: user.currentStarsBalance || 0,
          description: `Activation Pass Illimité (${days} jours)`,
          relatedObjectId: orderNumber,
          relatedObjectType: 'flexpay_pass',
          timestamp: FieldValue.serverTimestamp(),
        });
      }
    });
    return { success: true };
  } catch (err: any) {
    console.error(`[FlexPay] Erreur de crédit ${orderNumber}:`, err);
    return { success: false, error: err.message || 'Erreur lors du crédit de la commande.' };
  }
}
