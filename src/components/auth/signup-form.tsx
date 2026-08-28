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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Phone, MapPin, Globe, User, Mail, Lock, CheckCircle2, Apple, MailIcon, Smartphone } from 'lucide-react';
import { PhoneLogin } from './phone-login';
import { useState, useEffect } from 'react';
import { SignupValues, signupSchema, STAR_COSTS } from '@/lib/types';
import { useFirebase, useUser } from '@/firebase';
import { GoogleAuthProvider, OAuthProvider, createUserWithEmailAndPassword, signInWithPopup, updateProfile, User as FirebaseUser, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, runTransaction, collection, serverTimestamp, addDoc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { sendWelcomeEmailAction } from '@/app/actions';

const GoogleIcon = () => (
    <svg className="h-4 w-4" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.223,0-9.658-3.356-11.303-7.962l-6.571,4.819C9.656,39.663,16.318,44,24,44z"></path>
      <path fill="#1976D2" d="M43.611,20.083H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C44.433,36.368,48,31,48,24C48,22.659,47.862,21.35,47.611,20.083z"></path>
    </svg>
)

export function SignupForm() {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
    const [isAppleSubmitting, setIsAppleSubmitting] = useState(false);
    
    const { auth, firestore } = useFirebase();
    const { user, isUserLoading } = useUser();

    useEffect(() => {
        if (user && user.emailVerified) {
            router.push('/');
        }
    }, [user, router]);

    const form = useForm<SignupValues>({
        resolver: zodResolver(signupSchema),
        defaultValues: {
            name: '',
            email: '',
            password: '',
            phone: '',
            city: 'Kinshasa',
            country: 'RDC',
        },
    });

    async function initializeUserProfile(user: FirebaseUser, extraInfo: Partial<SignupValues>) {
        const userRef = doc(firestore, 'users', user.uid);
        const transRef = doc(collection(userRef, 'star_transactions'));

        await runTransaction(firestore, async (transaction) => {
            const userSnap = await transaction.get(userRef);
            
            if (!userSnap.exists()) {
                const userData = {
                    id: user.uid,
                    email: user.email,
                    name: extraInfo.name || user.displayName,
                    photoURL: user.photoURL || '',
                    phone: extraInfo.phone || '',
                    city: extraInfo.city || 'Kinshasa',
                    country: extraInfo.country || 'RDC',
                    currentStarsBalance: STAR_COSTS.SIGNUP_BONUS,
                    totalStarsEarned: STAR_COSTS.SIGNUP_BONUS,
                    isProfileComplete: true,
                    createdAt: serverTimestamp(),
                };

                transaction.set(userRef, userData, { merge: true });

                transaction.set(transRef, {
                    userId: user.uid,
                    type: 'earned',
                    starsChange: STAR_COSTS.SIGNUP_BONUS,
                    balanceAfterTransaction: STAR_COSTS.SIGNUP_BONUS,
                    description: "Bonus de bienvenue - Inscription",
                    timestamp: serverTimestamp(),
                });

                // Trigger Global Notification
                const notifRef = collection(firestore, 'notifications');
                addDoc(notifRef, {
                    type: 'user_joined',
                    title: 'Nouveau Kinois !',
                    message: `${userData.name} vient de rejoindre la communauté Kinshasa Flow. Bienvenue !`,
                    timestamp: serverTimestamp(),
                    userId: user.uid
                });
            }
        });
    }

    async function onSubmit(data: SignupValues) {
        setIsSubmitting(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
            const firebaseUser = userCredential.user;

            await updateProfile(firebaseUser, { displayName: data.name });
            await sendEmailVerification(firebaseUser);
            await initializeUserProfile(firebaseUser, data);

            sendWelcomeEmailAction({ 
                email: data.email, 
                userName: data.name 
            });

            toast({
                title: 'Compte créé !',
                description: "Veuillez vérifier votre e-mail pour activer votre compte. 25 stars offertes !",
                variant: 'default',
            });
            
            router.push('/');
        } catch (error: any) {
            toast({ title: "Erreur d'inscription", variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    }

    async function onGoogleSignIn() {
        setIsGoogleSubmitting(true);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            await initializeUserProfile(result.user, {});
            toast({ title: 'Bienvenue!' });
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
            await initializeUserProfile(result.user, {});
            toast({ title: 'Bienvenue!' });
            router.push('/');
        } catch (error) {
            toast({ title: 'Erreur Apple', variant: 'destructive' });
        } finally {
            setIsAppleSubmitting(false);
        }
    }
    
    if (isUserLoading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }

    return (
        <Card className="w-full shadow-2xl border-none rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-primary p-6 md:p-8 text-white">
                <CardTitle className="text-2xl md:text-3xl font-black tracking-tight">Rejoignez la communauté</CardTitle>
                <CardDescription className="text-primary-foreground/80 font-medium">Créez votre compte et recevez 25 stars gratuites.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 md:p-8">
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
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 md:space-y-5">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                                            <User className="h-3 w-3" /> Nom complet
                                        </FormLabel>
                                        <FormControl>
                                            <Input placeholder="John Doe" className="rounded-xl h-12 border-2" {...field} disabled={isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                                            <Phone className="h-3 w-3" /> Téléphone
                                        </FormLabel>
                                        <FormControl>
                                            <Input placeholder="08..." className="rounded-xl h-12 border-2" {...field} disabled={isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                                        <Mail className="h-3 w-3" /> Email
                                    </FormLabel>
                                    <FormControl>
                                        <Input type="email" placeholder="nom@exemple.com" className="rounded-xl h-12 border-2" {...field} disabled={isSubmitting} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="city"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                                            <MapPin className="h-3 w-3" /> Ville
                                        </FormLabel>
                                        <FormControl>
                                            <Input placeholder="Kinshasa" className="rounded-xl h-12 border-2" {...field} disabled={isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="country"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                                            <Globe className="h-3 w-3" /> Pays
                                        </FormLabel>
                                        <FormControl>
                                            <Input placeholder="RDC" className="rounded-xl h-12 border-2" {...field} disabled={isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                                        <Lock className="h-3 w-3" /> Mot de passe
                                    </FormLabel>
                                    <FormControl>
                                        <Input type="password" placeholder="********" className="rounded-xl h-12 border-2" {...field} disabled={isSubmitting} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button type="submit" className="w-full h-14 rounded-2xl text-lg font-black shadow-lg shadow-primary/20" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Créer mon compte"}
                        </Button>
                    </form>
                </Form>
                </TabsContent>
                <TabsContent value="phone">
                    <PhoneLogin />
                </TabsContent>
                </Tabs>
                
                 <div className="relative my-6 md:my-8">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-white px-4 text-muted-foreground font-black tracking-[0.2em]">Ou s'inscrire avec</span></div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button variant="outline" className="w-full h-12 rounded-2xl font-bold border-2" onClick={onGoogleSignIn} disabled={isGoogleSubmitting}>
                      {isGoogleSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
                      Google
                  </Button>
                  <Button variant="outline" className="w-full h-12 rounded-2xl font-bold border-2 bg-black text-white hover:bg-black/90" onClick={onAppleSignIn} disabled={isAppleSubmitting}>
                      {isAppleSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Apple className="mr-2 h-5 w-5" />}
                      Apple
                  </Button>
                </div>
            </CardContent>
             <CardFooter className="flex justify-center border-t bg-slate-50 p-6">
                <p className="text-sm text-muted-foreground font-medium">
                    Déjà inscrit ?{" "}
                    <Link href="/login" className="text-primary font-bold hover:underline">Se connecter</Link>
                </p>
            </CardFooter>
        </Card>
    );
}
