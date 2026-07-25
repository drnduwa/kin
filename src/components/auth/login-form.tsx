'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Smartphone, Mail as MailIcon, Apple } from 'lucide-react';
import { useState, useEffect } from 'react';
import { LoginValues, loginSchema, STAR_COSTS, UserProfile } from '@/lib/types';
import { useFirebase, useUser } from '@/firebase';
import { GoogleAuthProvider, OAuthProvider, signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail, User as FirebaseUser } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { doc, setDoc, runTransaction, collection, serverTimestamp, getDoc } from 'firebase/firestore';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PhoneLogin } from './phone-login';

const GoogleIcon = () => (
    <svg className="h-4 w-4" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.223,0-9.658-3.356-11.303-7.962l-6.571,4.819C9.656,39.663,16.318,44,24,44z"></path>
      <path fill="#1976D2" d="M43.611,20.083H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C44.433,36.368,48,31,48,24C48,22.659,47.862,21.35,47.611,20.083z"></path>
    </svg>
)

function ResetPasswordDialog() {
    const { auth } = useFirebase();
    const { toast } = useToast();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;
        setIsLoading(true);
        try {
            await sendPasswordResetEmail(auth, email);
            toast({
                title: "E-mail envoyé",
                description: "Un lien de réinitialisation a été envoyé à votre adresse e-mail.",
            });
            setIsOpen(false);
        } catch (error: any) {
            console.error("Error sending reset email:", error);
            toast({
                title: "Erreur",
                description: "Impossible d'envoyer l'e-mail. Vérifiez l'adresse saisie.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="link" size="sm" className="px-0 font-bold h-auto" type="button">
                    Mot de passe oublié ?
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-2xl border-none">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black">Réinitialiser le mot de passe</DialogTitle>
                    <DialogDescription className="font-medium text-slate-500">
                        Entrez votre adresse e-mail pour recevoir un lien de réinitialisation sécurisé.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleReset} className="space-y-6 pt-4">
                    <div className="space-y-2">
                        <FormLabel className="font-bold text-slate-700">Votre adresse e-mail</FormLabel>
                        <Input 
                            type="email" 
                            placeholder="nom@exemple.com" 
                            className="h-12 rounded-xl border-2"
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                        />
                    </div>
                    <DialogFooter>
                        <Button type="submit" className="w-full h-12 rounded-xl font-black text-lg shadow-lg shadow-primary/20" disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                            Envoyer le lien
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function LoginForm() {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
    const [isAppleSubmitting, setIsAppleSubmitting] = useState(false);
    
    const { auth, firestore } = useFirebase();
    const { user, isUserLoading } = useUser();

    useEffect(() => {
        if (user) {
            router.push('/');
        }
    }, [user, router]);

    async function initializeUserProfile(user: FirebaseUser) {
        const userRef = doc(firestore, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
            const transRef = doc(collection(userRef, 'star_transactions'));
            await runTransaction(firestore, async (transaction) => {
                const userData: UserProfile = {
                    id: user.uid,
                    email: user.email || `${user.uid}@kinshasaflow.online`,
                    name: user.displayName || 'Utilisateur',
                    photoURL: user.photoURL || '',
                    currentStarsBalance: STAR_COSTS.SIGNUP_BONUS,
                    totalStarsEarned: STAR_COSTS.SIGNUP_BONUS,
                    totalStarsPurchased: 0,
                    totalStarsUsed: 0,
                    consecutiveLoginDays: 0,
                    isProfileComplete: true,
                    isBlocked: false,
                    isCashSubscribed: false,
                    hasUsedFreeTrial: false,
                    createdAt: serverTimestamp() as any,
                };

                transaction.set(userRef, userData, { merge: true });

                transaction.set(transRef, {
                    userId: user.uid,
                    type: 'earned',
                    starsChange: STAR_COSTS.SIGNUP_BONUS,
                    balanceAfterTransaction: STAR_COSTS.SIGNUP_BONUS,
                    description: "Bonus de bienvenue",
                    timestamp: serverTimestamp(),
                });
            });
        }
    }

    async function onSubmit(data: LoginValues) {
        setIsSubmitting(true);
        try {
            await signInWithEmailAndPassword(auth, data.email, data.password);
            toast({
                title: 'Connexion réussie!',
                description: "Vous êtes maintenant connecté.",
                variant: 'default',
            });
            router.push('/');
        } catch (error) {
            console.error("Error signing in:", error);
            toast({
                title: 'Erreur de connexion',
                description: "Veuillez vérifier votre e-mail et votre mot de passe.",
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    async function onGoogleSignIn() {
        setIsGoogleSubmitting(true);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            await initializeUserProfile(result.user);
            toast({ title: 'Connexion réussie!' });
            router.push('/');
        } catch (error) {
            toast({ title: 'Erreur Google', variant: 'destructive' });
        } finally {
            setIsGoogleSubmitting(false);
        }
    }

    async function onAppleSignIn() {
        setIsAppleSubmitting(true);
        try {
            const provider = new OAuthProvider('apple.com');
            const result = await signInWithPopup(auth, provider);
            await initializeUserProfile(result.user);
            toast({ title: 'Connexion réussie!' });
            router.push('/');
        } catch (error) {
            toast({ title: 'Erreur Apple', variant: 'destructive' });
        } finally {
            setIsAppleSubmitting(false);
        }
    }
    
    if (isUserLoading || user) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        )
    }

    return (
        <Card className="w-full shadow-xl border-none rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-primary p-6 md:p-8 text-white text-center md:text-left">
                <CardTitle className="text-2xl md:text-3xl font-black tracking-tight">Se connecter</CardTitle>
                <CardDescription className="text-primary-foreground/80 font-medium">Accédez à votre compte pour continuer.</CardDescription>
            </CardHeader>
            <CardContent className="p-5 md:p-8">
                <Tabs defaultValue="email" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6 md:mb-8 h-12 bg-slate-100 rounded-xl p-1">
                        <TabsTrigger value="email" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <MailIcon className="h-4 w-4 mr-2" />
                            Email
                        </TabsTrigger>
                        <TabsTrigger value="phone" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Smartphone className="h-4 w-4 mr-2" />
                            SMS
                        </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="email">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 md:space-y-6">
                                <div className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="font-bold text-slate-700">Email</FormLabel>
                                                <FormControl>
                                                    <Input type="email" placeholder="nom@exemple.com" className="rounded-xl h-12 border-2" {...field} disabled={isSubmitting} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <div className="flex items-center justify-between">
                                                    <FormLabel className="font-bold text-slate-700">Mot de passe</FormLabel>
                                                    <ResetPasswordDialog />
                                                </div>
                                                <FormControl>
                                                    <Input type="password" placeholder="********" className="rounded-xl h-12 border-2" {...field} disabled={isSubmitting} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <Button type="submit" className="w-full h-14 rounded-2xl text-lg font-black shadow-lg shadow-primary/20 transition-transform active:scale-95" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                                    Se connecter
                                </Button>
                            </form>
                        </Form>
                    </TabsContent>

                    <TabsContent value="phone">
                        <PhoneLogin />
                    </TabsContent>
                </Tabs>

                <div className="relative my-6 md:my-8">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase">
                        <span className="bg-white px-4 text-muted-foreground font-black tracking-[0.2em]">
                        Ou avec
                        </span>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  <Button variant="outline" className="w-full h-12 rounded-2xl font-black border-2 transition-all hover:bg-slate-50 active:scale-95" onClick={onGoogleSignIn} disabled={isGoogleSubmitting}>
                      {isGoogleSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
                      Google
                  </Button>
                  <Button variant="outline" className="w-full h-12 rounded-2xl font-black border-2 bg-black text-white hover:bg-black/90 active:scale-95" onClick={onAppleSignIn} disabled={isAppleSubmitting}>
                      {isAppleSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Apple className="mr-2 h-5 w-5" />}
                      Apple
                  </Button>
                </div>
            </CardContent>
            <CardFooter className="flex justify-center border-t bg-slate-50/50 p-6">
                <p className="text-sm text-muted-foreground font-medium">
                    Pas encore membre?{" "}
                    <Link href="/signup" className="text-primary font-bold hover:underline">
                        Créer un compte
                    </Link>
                </p>
            </CardFooter>
        </Card>
    );
}
