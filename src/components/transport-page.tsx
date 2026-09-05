'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TransportSubscription, transportSubscriptionFormSchema, TransportSubscriptionFormValues, WithId } from '@/lib/types';
import { useFirebase, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, limit, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { differenceInDays, addDays } from 'date-fns';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Bus, Car, Users, Building, Loader2, Home, Briefcase, Clock, FilePlus, UserCheck, DollarSign, Timer, CarTaxiFront, Info, X, Mail, Phone, MapPin, User } from 'lucide-react';
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

const transportModes = [
  {
    name: "Covoiturage",
    icon: Users,
    description: "Partagez un véhicule avec d'autres travailleurs sur un trajet similaire. Économique et écologique.",
    advantages: ["Coût réduit (partage des frais)", "Réduction du nombre de voitures sur la route", "Convivialité et réseautage"]
  },
  {
    name: "Taxi Privé",
    icon: CarTaxiFront,
    description: "Un service de taxi dédié pour vos trajets, offrant confort et flexibilité.",
    advantages: ["Confort et confidentialité", "Flexibilité des horaires", "Service porte-à-porte"]
  },
  {
    name: "Mini-bus par itinéraire fixe",
    icon: Bus,
    description: "Des mini-bus suivant des itinéraires prédéfinis à des heures fixes.",
    advantages: ["Option la plus économique", "Itinéraires optimisés pour les zones de bureaux", "Moins d'attente que les transports publics traditionnels"]
  },
  {
    name: "Transport d’entreprise",
    icon: Building,
    description: "Une solution B2B où les entreprises contractent des véhicules pour leurs employés.",
    advantages: ["Ponctualité et fiabilité garanties", "Prise en charge directe par l'employeur", "Renforcement de la sécurité des employés"]
  }
];

const ModeInfoDialog = ({ mode, children }: { mode: typeof transportModes[0], children: React.ReactNode }) => (
  <Dialog>
    <DialogTrigger asChild>{children}</DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><mode.icon className="h-6 w-6 text-primary" />{mode.name}</DialogTitle>
        <DialogDescription>{mode.description}</DialogDescription>
      </DialogHeader>
      <div>
        <h4 className="font-semibold mb-2">Avantages :</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          {mode.advantages.map((adv, i) => <li key={i}>{adv}</li>)}
        </ul>
      </div>
    </DialogContent>
  </Dialog>
);

const SubscriptionForm = ({ setDialogOpen }: { setDialogOpen: (open: boolean) => void }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const { firestore, user } = useFirebase();

    const form = useForm<TransportSubscriptionFormValues>({
        resolver: zodResolver(transportSubscriptionFormSchema),
        defaultValues: {
            fullName: user?.displayName || '',
            email: user?.email || '',
            phone: '',
            address: '',
            district: '',
            city: '',
            workplace: '',
            departureTime: '',
            returnTime: '',
        },
    });
    
    useEffect(() => {
        if (user) {
            form.reset({
                fullName: user.displayName || '',
                email: user.email || '',
                phone: user.phoneNumber || '',
                address: '',
                district: '',
                city: '',
                workplace: '',
                departureTime: '',
                returnTime: '',
            });
        }
    }, [user, form]);


    async function onSubmit(data: TransportSubscriptionFormValues) {
        if (!user) {
            toast({ title: 'Veuillez vous connecter', description: "Vous devez être connecté pour vous inscrire.", variant: 'destructive' });
            return router.push('/login');
        }
        setIsSubmitting(true);
        try {
            const subscriptionData = {
                ...data,
                userId: user.uid,
                transportType: 'entreprise', // Defaulting to 'entreprise' as per model
                status: 'pending',
                price: 150, // Default price
                createdAt: serverTimestamp(),
            };
            const subscriptionsCollection = collection(firestore, 'users', user.uid, 'transport_subscriptions');
            await addDocumentNonBlocking(subscriptionsCollection, subscriptionData);
            toast({ title: 'Demande envoyée !', description: "Votre demande a été enregistrée. Nous vous contacterons bientôt.", variant: 'default' });
            form.reset();
            setDialogOpen(false);
        } catch (error) {
            console.error("Error submitting subscription:", error);
            toast({ title: 'Erreur', description: "Impossible de soumettre votre demande. Veuillez réessayer.", variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                    <h4 className="text-lg font-medium">Informations Personnelles</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="fullName" render={({ field }) => (
                          <FormItem>
                              <FormLabel className="flex items-center gap-1"><User className="h-4 w-4"/>Nom Complet</FormLabel>
                              <FormControl><Input placeholder="Ex: John Doe" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={form.control} name="phone" render={({ field }) => (
                          <FormItem>
                              <FormLabel className="flex items-center gap-1"><Phone className="h-4 w-4"/>Téléphone</FormLabel>
                              <FormControl><Input placeholder="Ex: 0812345678" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-1"><Mail className="h-4 w-4"/>Email</FormLabel>
                            <FormControl><Input type="email" placeholder="Ex: john.doe@example.com" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>

                <div className="space-y-4">
                    <h4 className="text-lg font-medium">Adresse de Résidence</h4>
                    <FormField control={form.control} name="address" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-1"><MapPin className="h-4 w-4"/>Adresse</FormLabel>
                            <FormControl><Input placeholder="Ex: 123, Av. de la Justice" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <div className="grid md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="district" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Quartier</FormLabel>
                                <FormControl><Input placeholder="Ex: Royal" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="city" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Commune</FormLabel>
                                <FormControl><Input placeholder="Ex: Gombe" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                </div>

                 <div className="space-y-4">
                    <h4 className="text-lg font-medium">Informations sur le Trajet</h4>
                    <FormField control={form.control} name="workplace" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-1"><Briefcase className="h-4 w-4"/>Lieu de travail</FormLabel>
                            <FormControl><Input placeholder="Ex: Immeuble ABC, Gombe" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <div className="grid md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="departureTime" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-1"><Clock className="h-4 w-4"/>Heure de départ</FormLabel>
                                <FormControl><Input type="time" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="returnTime" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-1"><Clock className="h-4 w-4"/>Heure de retour</FormLabel>
                                <FormControl><Input type="time" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                </div>

                <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Envoyer ma demande
                </Button>
            </form>
        </Form>
    );
};

const SubscriptionDialog = () => {
    const [open, setOpen] = useState(false);
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button><FilePlus className="mr-2 h-4 w-4" />S'abonner</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[625px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Demande d'abonnement</DialogTitle>
                    <DialogDescription>Remplissez ce formulaire pour être ajouté à notre liste d'attente. Nous vous regrouperons avec d'autres personnes ayant des trajets similaires.</DialogDescription>
                </DialogHeader>
                <SubscriptionForm setDialogOpen={setOpen} />
            </DialogContent>
        </Dialog>
    );
};

const SubscriptionStatus = ({ subscription }: { subscription: WithId<TransportSubscription> | undefined }) => {
    const { user, firestore } = useFirebase();
    const { toast } = useToast();
    const [isPaying, setIsPaying] = useState(false);
    const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

    useEffect(() => {
        if (subscription?.status === 'active' && subscription.subscriptionDate) {
            const startDate = subscription.subscriptionDate.toDate();
            const endDate = addDays(startDate, 30);
            const remaining = differenceInDays(endDate, new Date());
            setDaysRemaining(remaining > 0 ? remaining : 0);
        }
    }, [subscription]);

    const handlePayment = async () => {
        if (!subscription || !user) return;
        
        setIsPaying(true);
        const subDocRef = doc(firestore, 'users', user.uid, 'transport_subscriptions', subscription.id);
        
        try {
            await updateDoc(subDocRef, {
                status: 'active',
                subscriptionDate: serverTimestamp()
            });
            toast({
                title: "Paiement réussi !",
                description: "Votre abonnement est maintenant actif.",
            });
        } catch (error) {
            console.error("Error activating subscription:", error);
            toast({
                title: "Erreur de paiement",
                description: "Impossible d'activer votre abonnement. Veuillez réessayer.",
                variant: 'destructive',
            });
        } finally {
            setIsPaying(false);
        }
    };
    
    const StatusBadge = () => {
        if (!subscription) return null;
    
        const statusConfigMap = {
            pending: { variant: "secondary", label: "En attente", icon: Timer },
            approved: { variant: "default", label: "Approuvé", icon: UserCheck },
            active: { variant: "success", label: "Actif", icon: UserCheck },
            rejected: { variant: "destructive", label: "Rejeté", icon: X },
            cancelled: { variant: "destructive", label: "Annulé", icon: X },
        } as const;
    
        // The status from the subscription is guaranteed to be one of the keys by our Zod schema
        const statusConfig = statusConfigMap[subscription.status];
        
        // Destructure for cleaner access in JSX
        const { variant, label, icon: Icon } = statusConfig;
    
        return (
            <Badge variant={variant} className="flex items-center gap-1.5">
                <Icon className="h-3 w-3" />
                {label}
            </Badge>
        );
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Statut de votre abonnement</CardTitle>
                    <StatusBadge />
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {subscription?.status === 'pending' && <Alert><Timer className="h-4 w-4" /><AlertTitle>Demande en cours d'examen</AlertTitle><AlertDescription>Votre demande est en cours de traitement. Nous vous notifierons dès qu'elle sera approuvée.</AlertDescription></Alert>}
                
                {subscription?.status === 'approved' && (
                  <Alert variant="default">
                      <DollarSign className="h-4 w-4" />
                      <AlertTitle>Demande de Navette Approuvée !</AlertTitle>
                      <AlertDescription>
                        Votre réservation de transport physique a été validée par notre service d'exploitation.
                      </AlertDescription>
                      <div className="mt-3 p-3 bg-muted/50 rounded-xl text-xs space-y-1">
                        <p><strong>Tarif convenu:</strong> ${subscription.price} / mois</p>
                        <p className="text-muted-foreground">Le règlement s'effectue directement auprès de votre chauffeur lors de la remise de votre pass physique.</p>
                      </div>
                  </Alert>
                )}
                
                {subscription?.status === 'active' && (
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-2">
                            <p><strong>Trajet:</strong> {subscription.city} ↔ {subscription.workplace}</p>
                            <p><strong>Heures:</strong> {subscription.departureTime} → {subscription.returnTime}</p>
                            <p><strong>Chauffeur:</strong> {subscription.driverName || 'Non assigné'}</p>
                            <p><strong>Tel. Chauffeur:</strong> {subscription.driverPhone || 'N/A'}</p>
                        </div>
                         <div className="space-y-2">
                            <p><strong>Voiture:</strong> {subscription.carType || 'Non assigné'}</p>
                            <p><strong>Couleur:</strong> {subscription.carColor || 'N/A'}</p>
                            <p><strong>Plaque:</strong> {subscription.licensePlate || 'N/A'}</p>
                            {daysRemaining !== null && <p><strong>Jours restants:</strong> <span className="font-bold text-lg text-primary">{daysRemaining}</span> / 30</p>}
                        </div>
                    </div>
                )}
                 {subscription?.status === 'rejected' && subscription.rejectionReason && 
                    <Alert variant="destructive" className="text-left">
                        <AlertTitle>Raison du rejet</AlertTitle>
                        <AlertDescription>{subscription.rejectionReason}</AlertDescription>
                    </Alert>
                 }
            </CardContent>
        </Card>
    );
}

const SubscriptionAction = ({ subscription, isLoading }: { subscription: WithId<TransportSubscription> | undefined, isLoading: boolean}) => {
    const { user } = useUser();

    if (isLoading) {
        return <Skeleton className="h-24 w-full" />;
    }

    if (!user) {
        return (
            <Card className="text-center">
                <CardHeader>
                    <CardTitle>Connectez-vous pour vous abonner</CardTitle>
                    <CardDescription>Pour gérer votre abonnement, veuillez d'abord vous connecter ou créer un compte.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild><Link href="/login">Se connecter</Link></Button>
                </CardContent>
            </Card>
        );
    }
    
    if (!subscription || ['rejected', 'cancelled'].includes(subscription.status)) {
        return (
            <Card className="text-center">
                <CardHeader>
                    <CardTitle>Prêt à commencer ?</CardTitle>
                    <CardDescription>
                        {!subscription
                            ? "Vous n'avez pas d'abonnement en cours. Faites une demande pour commencer."
                            : "Votre abonnement précédent n'est plus actif. Faites une nouvelle demande."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <SubscriptionDialog />
                </CardContent>
            </Card>
        );
    }

    // If there's a subscription in any other state (pending, approved, active), show its status.
    return <SubscriptionStatus subscription={subscription} />;
}


export default function TransportPage() {
    const { user, isUserLoading } = useUser();
    const { firestore } = useFirebase();

    const subscriptionsCollection = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'transport_subscriptions') : null, [firestore, user]);
    const subscriptionsQuery = useMemoFirebase(() => subscriptionsCollection ? query(subscriptionsCollection, orderBy('createdAt', 'desc'), limit(1)) : null, [subscriptionsCollection]);
    const { data: subscriptions, isLoading: isSubscriptionLoading } = useCollection<TransportSubscription>(subscriptionsQuery);
    const subscription = subscriptions?.[0] as WithId<TransportSubscription> | undefined;

    const isLoading = isUserLoading || isSubscriptionLoading;

    return (
        <div className="w-full h-full overflow-y-auto pr-2">
            <motion.div className="max-w-6xl mx-auto space-y-12 py-4" variants={containerVariants} initial="hidden" animate="visible">
                
                <motion.section variants={itemVariants} className="text-center">
                    <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">Transport Organisé pour Travailleurs</h1>
                    <p className="text-lg text-muted-foreground">Une solution d'abonnement mensuel pour vos trajets domicile-travail.</p>
                </motion.section>

                <motion.section variants={itemVariants} className="p-6 rounded-lg bg-card border">
                     <h3 className="font-semibold text-lg mb-1">Modèle d'abonnement</h3>
                     <p className="text-muted-foreground">Un paiement mensuel unique  via Mobile Money pour des trajets quotidiens (aller-retour) assurés.</p>
                </motion.section>

                <motion.section variants={itemVariants}>
                    <div className="text-center mb-6">
                        <h2 className="text-2xl font-bold">Modes de Transport</h2>
                         <p className="text-muted-foreground">Cliquez sur un mode pour en savoir plus.</p>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {transportModes.map(mode => (
                           <ModeInfoDialog key={mode.name} mode={mode}>
                             <Button variant="outline" className="h-24 flex-col gap-2">
                                <mode.icon className="h-6 w-6" />
                                <span>{mode.name}</span>
                             </Button>
                           </ModeInfoDialog>
                        ))}
                    </div>
                </motion.section>

                <motion.section variants={itemVariants}>
                    <h2 className="text-2xl font-bold text-center mb-6">Mon Abonnement</h2>
                    <SubscriptionAction subscription={subscription} isLoading={isLoading} />
                </motion.section>
            </motion.div>
        </div>
    );
}

    