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
import { Loader2, Smartphone, Mail as MailIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { LoginValues, loginSchema } from '@/lib/types';
import { useFirebase, useUser } from '@/firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { useRouter } from 'next/navigation';
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
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
    const { auth } = useFirebase();
    const { user, isUserLoading } = useUser();

    useEffect(() => {
        if (user) {
            router.push('/');
        }
    }, [user, router]);

    const form = useForm<LoginValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    });

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