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
import { Loader2, Phone, MapPin, Globe, User, Mail, Lock, CheckCircle2, MailIcon, Smartphone } from 'lucide-react';
import { PhoneLogin } from './phone-login';
import { useState, useEffect } from 'react';
import { SignupValues, signupSchema, STAR_COSTS } from '@/lib/types';
import { useFirebase, useUser } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile, User as FirebaseUser, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, runTransaction, collection, serverTimestamp, addDoc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { sendWelcomeEmailAction } from '@/app/actions';



export function SignupForm() {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
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
                const freeTrialExpiry = new Date();
                freeTrialExpiry.setMonth(freeTrialExpiry.getMonth() + 1);

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
                    totalStarsPurchased: 0,
                    totalStarsUsed: 0,
                    consecutiveLoginDays: 0,
                    isProfileComplete: true,
                    isBlocked: false,
                    isCashSubscribed: true,
                    hasUsedFreeTrial: true,
                    cashSubscriptionExpiry: freeTrialExpiry,
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
