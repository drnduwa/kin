
'use client';

import React, { useState, useEffect } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult, User as FirebaseUser } from 'firebase/auth';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Phone, CheckCircle2 } from 'lucide-react';
import { doc, getDoc, runTransaction, collection, serverTimestamp, addDoc } from 'firebase/firestore';
import { STAR_COSTS, UserProfile } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { sendWelcomeEmailAction } from '@/app/actions';

export function PhoneLogin() {
  const { auth, firestore } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (!auth) return;
    
    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
    });
    setRecaptchaVerifier(verifier);
    
    return () => {
      verifier.clear();
    };
  }, [auth]);

  async function initializeUserProfile(user: FirebaseUser) {
    const userRef = doc(firestore, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    const isNewUser = !userSnap.exists();
    
    if (isNewUser) {
      await runTransaction(firestore, async (transaction) => {
        const freeTrialExpiry = new Date();
        freeTrialExpiry.setMonth(freeTrialExpiry.getMonth() + 1);

        const userData: UserProfile = {
          id: user.uid,
          email: user.email || `${user.phoneNumber}@kinshasaflow.online`,
          name: user.displayName || `Kinois ${user.phoneNumber?.slice(-4)}`,
          photoURL: user.photoURL || '',
          phone: user.phoneNumber || '',
          currentStarsBalance: STAR_COSTS.SIGNUP_BONUS,
          totalStarsEarned: STAR_COSTS.SIGNUP_BONUS,
          totalStarsPurchased: 0,
          totalStarsUsed: 0,
          consecutiveLoginDays: 0,
          isProfileComplete: true,
          isBlocked: false,
          isCashSubscribed: true,
          hasUsedFreeTrial: true,
          cashSubscriptionExpiry: freeTrialExpiry,
          createdAt: serverTimestamp() as any,
        };

        const transRef = doc(collection(userRef, 'star_transactions'));

        transaction.set(userRef, userData, { merge: true });

        transaction.set(transRef, {
          userId: user.uid,
          type: 'earned',
          starsChange: STAR_COSTS.SIGNUP_BONUS,
          balanceAfterTransaction: STAR_COSTS.SIGNUP_BONUS,
          description: "Bonus de bienvenue - Connexion Téléphone",
          timestamp: serverTimestamp(),
        });

        // Global Notif
        const notifRef = collection(firestore, 'notifications');
        addDoc(notifRef, {
            type: 'user_joined',
            title: 'Nouveau Kinois !',
            message: `${userData.name} vient de rejoindre la communauté via SMS.`,
            timestamp: serverTimestamp(),
            userId: user.uid
        });
      });

      // Email welcome if it's a real email or fallback
      sendWelcomeEmailAction({
          email: user.email || `${user.phoneNumber}@kinshasaflow.online`,
          userName: user.displayName || `Kinois ${user.phoneNumber?.slice(-4)}`
      });
    }
  }

  const handleSendCode = async () => {
    if (!phoneNumber || !recaptchaVerifier) return;
    
    setIsLoading(true);
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    
    // Format RDC logic
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+243' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('243')) {
      formattedPhone = '+243' + formattedPhone;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    try {
      const result = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
      setConfirmationResult(result);
      toast({ title: "Code envoyé !", description: "Veuillez saisir le code reçu par SMS." });
    } catch (error: any) {
      console.error("SMS Error:", error);
      toast({ 
        title: "Erreur d'envoi", 
        description: "Impossible d'envoyer le SMS. Vérifiez le numéro.", 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!confirmationResult || !verificationCode) return;
    
    setIsVerifying(true);
    try {
      const result = await confirmationResult.confirm(verificationCode);
      await initializeUserProfile(result.user);
      
      toast({ title: "Connexion réussie !", description: "Bienvenue sur Kinshasa Flow." });
      router.push('/');
    } catch (error) {
      console.error("Verification Error:", error);
      toast({ 
        title: "Code invalide", 
        description: "Le code de vérification est incorrect.", 
        variant: "destructive" 
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div id="recaptcha-container"></div>
      
      {!confirmationResult ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="font-bold text-slate-700">Numéro de téléphone</Label>
            <div className="flex gap-2">
              <div className="bg-slate-100 px-3 py-3 rounded-xl font-bold text-slate-500 border-2 border-transparent">
                +243
              </div>
              <Input 
                placeholder="85 776 7040" 
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                className="h-12 rounded-xl border-2 font-bold"
                type="tel"
                disabled={isLoading}
              />
            </div>
            <p className="text-[10px] text-muted-foreground font-medium">
              Nous vous enverrons un code de confirmation par SMS.
            </p>
          </div>
          <Button 
            onClick={handleSendCode} 
            disabled={isLoading || phoneNumber.length < 8}
            className="w-full h-14 rounded-2xl text-lg font-black shadow-lg shadow-primary/20"
          >
            {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Phone className="mr-2 h-5 w-5" />}
            Recevoir le code
          </Button>
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
          <div className="space-y-2">
            <Label className="font-bold text-slate-700">Code de vérification (6 chiffres)</Label>
            <Input 
              placeholder="123456" 
              value={verificationCode}
              onChange={e => setVerificationCode(e.target.value)}
              className="h-12 rounded-xl border-2 text-center text-2xl tracking-[0.5em] font-black"
              maxLength={6}
              disabled={isVerifying}
            />
          </div>
          <Button 
            onClick={handleVerifyCode} 
            disabled={isVerifying || verificationCode.length !== 6}
            className="w-full h-14 rounded-2xl text-lg font-black bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200"
          >
            {isVerifying ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
            Confirmer & Entrer
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => setConfirmationResult(null)} 
            className="w-full text-slate-400 font-bold"
          >
            Changer de numéro
          </Button>
        </div>
      )}
    </div>
  );
}
