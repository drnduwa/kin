'use client';

import React, { useState, useMemo } from 'react';
import { AppShell } from "@/components/app-shell";
import { useUser, useFirebase, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { UserProfile, WithId } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Star, ShieldAlert, UserX, UserCheck, Plus, ShieldCheck, Calendar, XCircle, CreditCard, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format, addMonths, addYears } from 'date-fns';
import { fr } from 'date-fns/locale';
import { sendRelanceGiftEmailAction } from "@/app/actions";

export default function AdminStarsPage() {
  const { user } = useUser();
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const isAdmin = user?.email === 'drnduwa@gmail.com';

  const usersQuery = useMemoFirebase(() => {
    if (!firestore || !isAdmin) return null;
    return collection(firestore, 'users');
  }, [firestore, isAdmin]);

  const { data: users, isLoading } = useCollection<UserProfile>(usersQuery);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(u => 
      u.email.toLowerCase().includes(search.toLowerCase()) || 
      (u.name && u.name.toLowerCase().includes(search.toLowerCase()))
    );
  }, [users, search]);

  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ updated: number, total: number } | null>(null);

  const handleCreditAllUsersAndSendEmail = async () => {
    if (!isAdmin || !users || users.length === 0) return;
    setIsBatchRunning(true);
    let updatedCount = 0;
    const recipientEmails: string[] = [];

    try {
      for (let i = 0; i < users.length; i++) {
        const u = users[i];
        if (u.email && u.email.includes('@')) {
          recipientEmails.push(u.email);
        }

        const currentBalance = u.currentStarsBalance || 0;
        // Option A: Offrir 25 Stars aux utilisateurs existants ayant moins de 25 Stars
        if (currentBalance < 25 || !u.hasReceivedRelanceGift) {
          const userRef = doc(firestore, 'users', u.id);
          const transRef = doc(collection(userRef, 'star_transactions'));
          const starsToAdd = Math.max(25, 25 - currentBalance);

          await runTransaction(firestore, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) return;
            const currentData = userDoc.data() as UserProfile;
            const newBal = (currentData.currentStarsBalance || 0) + 25;

            transaction.update(userRef, {
              currentStarsBalance: newBal,
              totalStarsEarned: (currentData.totalStarsEarned || 0) + 25,
              hasReceivedRelanceGift: true,
            });

            transaction.set(transRef, {
              userId: u.id,
              type: 'admin_adjustment',
              starsChange: 25,
              balanceAfterTransaction: newBal,
              description: "Cadeau de Relance : +25 Stars Offertes",
              timestamp: serverTimestamp(),
            });
          }).catch(e => console.warn(`Erreur crédit utilisateur ${u.id}:`, e));

          updatedCount++;
          setBatchProgress({ updated: updatedCount, total: users.length });
        }
      }

      toast({
        title: "Crédit terminé !",
        description: `${updatedCount} utilisateurs ont été crédités de +25 Stars. Envoi de l'email de relance en cours...`,
      });

      // Envoi de l'email de notification groupé
      const emailResult = await sendRelanceGiftEmailAction(recipientEmails);
      if (emailResult.success) {
        toast({
          title: "Emails de notification diffusés ! 🚀",
          description: `L'email de cadeau a été envoyé à ${emailResult.count} utilisateurs.`,
          className: "bg-emerald-600 text-white",
        });
      } else {
        toast({
          title: "Notification email",
          description: emailResult.error || "Une erreur est survenue lors de l'envoi SMTP.",
          variant: "destructive",
        });
      }

    } catch (err: any) {
      toast({
        title: "Erreur lors du traitement groupé",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsBatchRunning(false);
      setBatchProgress(null);
    }
  };

  const handleAdjustStars = async (targetUser: WithId<UserProfile>, amount: number, reason: string) => {
    if (!isAdmin) return;
    setIsUpdating(targetUser.id);
    
    try {
      const userRef = doc(firestore, 'users', targetUser.id);
      const transRef = doc(collection(userRef, 'star_transactions'));

      await runTransaction(firestore, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("Utilisateur introuvable");
        
        const currentData = userDoc.data() as UserProfile;
        const newBalance = Math.max(0, (currentData.currentStarsBalance || 0) + amount);

        transaction.update(userRef, {
          currentStarsBalance: newBalance
        });

        transaction.set(transRef, {
          userId: targetUser.id,
          type: 'admin_adjustment',
          starsChange: amount,
          balanceAfterTransaction: newBalance,
          description: `Ajustement Admin : ${reason}`,
          timestamp: serverTimestamp(),
        });
      });

      toast({ title: "Succès", description: `Le solde de ${targetUser.email} a été mis à jour.` });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleToggleBlock = async (targetUser: WithId<UserProfile>) => {
    if (!isAdmin) return;
    const newStatus = !targetUser.isBlocked;
    setIsUpdating(targetUser.id);

    try {
      await runTransaction(firestore, async (transaction) => {
        const userRef = doc(firestore, 'users', targetUser.id);
        transaction.update(userRef, { isBlocked: newStatus });
      });
      toast({ 
        title: newStatus ? "Utilisateur Bloqué" : "Utilisateur Débloqué", 
        description: `Le compte ${targetUser.email} a été mis à jour.` 
      });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdateSubscription = async (targetUser: WithId<UserProfile>, action: 'grant_month' | 'grant_year' | 'cancel') => {
    if (!isAdmin) return;
    setIsUpdating(targetUser.id);

    try {
      const userRef = doc(firestore, 'users', targetUser.id);
      
      await runTransaction(firestore, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("Utilisateur introuvable");
        
        let newExpiry: Date | null = null;
        let isSubscribed = false;

        if (action === 'grant_month') {
          const baseDate = targetUser.cashSubscriptionExpiry?.toDate() || new Date();
          newExpiry = addMonths(baseDate > new Date() ? baseDate : new Date(), 1);
          isSubscribed = true;
        } else if (action === 'grant_year') {
          const baseDate = targetUser.cashSubscriptionExpiry?.toDate() || new Date();
          newExpiry = addYears(baseDate > new Date() ? baseDate : new Date(), 1);
          isSubscribed = true;
        }

        transaction.update(userRef, {
          isCashSubscribed: isSubscribed,
          cashSubscriptionExpiry: newExpiry ? Timestamp.fromDate(newExpiry) : null
        });

        // Log the transaction
        const transRef = doc(collection(userRef, 'star_transactions'));
        transaction.set(transRef, {
          userId: targetUser.id,
          type: 'admin_adjustment',
          starsChange: 0,
          balanceAfterTransaction: targetUser.currentStarsBalance || 0,
          description: `Ajustement Abonnement : ${action === 'cancel' ? 'Révocation' : 'Octroi d\'accès'}`,
          timestamp: serverTimestamp(),
        });
      });

      toast({ title: "Abonnement mis à jour", description: `Les droits d'accès de ${targetUser.email} ont été modifiés.` });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  if (!isAdmin) return (
    <AppShell>
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-black">Accès Interdit</h1>
        <p className="text-muted-foreground">Espace réservé à l'administrateur système.</p>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="w-full h-full overflow-y-auto p-4 md:p-8 space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
              <Star className="text-amber-500 fill-amber-500" />
              Pilotage Communauté
            </h1>
            <p className="text-muted-foreground">Gérez les comptes, les stars et les abonnements premium.</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Rechercher email ou nom..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              className="pl-10 h-12 rounded-xl"
            />
          </div>
        </div>

        {/* Bannière d'Action Collective de Relance */}
        <Card className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white border-none shadow-xl rounded-3xl overflow-hidden p-6 sm:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <Badge className="bg-white/20 text-white font-black text-xs uppercase tracking-wider border-none">
                Action de Relance Communautaire
              </Badge>
              <h2 className="text-xl sm:text-2xl font-black">Offrir +25 Stars & Diffuser l'E-mail aux Utilisateurs Inscrits</h2>
              <p className="text-amber-100 text-xs sm:text-sm max-w-xl font-medium">
                Crédite +25 Stars à tous les utilisateurs déjà inscrits ayant moins de 25 Stars, et envoie automatiquement l'e-mail de notification pour leur présenter le nouveau système FlexPay.
              </p>
            </div>
            <Button
              onClick={handleCreditAllUsersAndSendEmail}
              disabled={isBatchRunning || isLoading || !users || users.length === 0}
              className="bg-slate-900 hover:bg-slate-800 text-white font-black h-14 px-8 rounded-2xl shrink-0 shadow-lg text-xs uppercase tracking-wider"
            >
              {isBatchRunning ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {batchProgress ? `${batchProgress.updated} crédités...` : 'Envoi en cours...'}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 fill-amber-400 text-amber-400" />
                  Lancer le Crédit & E-mails ({users?.length || 0} membres)
                </span>
              )}
            </Button>
          </div>
        </Card>

        <Card className="border-none shadow-sm overflow-hidden rounded-3xl">
          <CardHeader className="bg-slate-50/50">
            <CardTitle>Utilisateurs Inscrits ({filteredUsers.length})</CardTitle>
            <CardDescription>Actions directes sur les profils et privilèges.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Solde Stars</TableHead>
                  <TableHead>Abonnement Cash</TableHead>
                  <TableHead>Statut Compte</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map(u => {
                    const isPremium = u.isCashSubscribed && u.cashSubscriptionExpiry?.toDate() > new Date();
                    const expiryDate = u.cashSubscriptionExpiry?.toDate();

                    return (
                      <TableRow key={u.id} className={u.isBlocked ? "bg-red-50/30" : ""}>
                        <TableCell>
                          <div className="font-bold">{u.name || "Sans nom"}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 font-black">
                            {u.currentStarsBalance || 0} ⭐
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isPremium ? (
                            <div className="space-y-1">
                              <Badge className="bg-emerald-500 text-white font-bold flex items-center gap-1 w-fit">
                                <ShieldCheck className="h-3 w-3" /> PREMIUM
                              </Badge>
                              {expiryDate && <p className="text-[10px] text-muted-foreground font-medium">Expire le {format(expiryDate, 'dd/MM/yyyy')}</p>}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-slate-400 border-slate-200">Standard</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.isBlocked ? (
                            <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                              <XCircle className="h-3 w-3" /> Suspendu
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 flex items-center gap-1 w-fit">
                              <UserCheck className="h-3 w-3" /> Actif
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="rounded-lg h-8 border-primary/20 text-primary hover:bg-primary/5">
                                Gérer Stars
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="rounded-3xl">
                              <DialogHeader>
                                <DialogTitle>Ajuster Stars pour {u.email}</DialogTitle>
                              </DialogHeader>
                              <StarAdjustmentForm 
                                user={u} 
                                onAdjust={(amt, reason) => handleAdjustStars(u, amt, reason)} 
                                isLoading={isUpdating === u.id} 
                              />
                            </DialogContent>
                          </Dialog>

                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="rounded-lg h-8 border-emerald-200 text-emerald-600 hover:bg-emerald-50">
                                Accès Cash
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="rounded-3xl">
                              <DialogHeader>
                                <DialogTitle>Gestion de l'accès Premium</DialogTitle>
                                <DialogDescription>Modifiez les droits d'accès direct de {u.email}.</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="p-4 bg-muted/50 rounded-2xl border flex items-center justify-between">
                                  <div>
                                    <p className="text-xs font-black uppercase text-slate-400">Statut actuel</p>
                                    <p className="font-bold">{isPremium ? "Abonné Premium" : "Utilisateur Gratuit"}</p>
                                  </div>
                                  {isPremium && expiryDate && (
                                    <div className="text-right">
                                      <p className="text-xs font-black uppercase text-slate-400">Fin d'accès</p>
                                      <p className="font-bold text-primary">{format(expiryDate, 'dd MMMM yyyy', { locale: fr })}</p>
                                    </div>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 gap-2">
                                  <Button 
                                    className="h-12 rounded-xl justify-start font-bold" 
                                    onClick={() => handleUpdateSubscription(u, 'grant_month')}
                                    disabled={isUpdating === u.id}
                                  >
                                    <Calendar className="mr-2 h-4 w-4" /> Offrir 1 mois d'accès
                                  </Button>
                                  <Button 
                                    className="h-12 rounded-xl justify-start font-bold bg-emerald-600 hover:bg-emerald-700" 
                                    onClick={() => handleUpdateSubscription(u, 'grant_year')}
                                    disabled={isUpdating === u.id}
                                  >
                                    <CreditCard className="mr-2 h-4 w-4" /> Offrir 1 an d'accès
                                  </Button>
                                  <Button 
                                    variant="destructive" 
                                    className="h-12 rounded-xl justify-start font-bold" 
                                    onClick={() => handleUpdateSubscription(u, 'cancel')}
                                    disabled={isUpdating === u.id || !u.isCashSubscribed}
                                  >
                                    <XCircle className="mr-2 h-4 w-4" /> Révoquer/Annuler l'accès
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <Button 
                            size="icon" 
                            variant={u.isBlocked ? "success" : "destructive"} 
                            className="h-8 w-8 rounded-lg"
                            onClick={() => handleToggleBlock(u)}
                            disabled={isUpdating === u.id}
                            title={u.isBlocked ? "Débloquer" : "Bloquer l'utilisateur"}
                          >
                            {isUpdating === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : (u.isBlocked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />)}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">Aucun utilisateur trouvé.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StarAdjustmentForm({ user, onAdjust, isLoading }: { user: UserProfile, onAdjust: (amt: number, reason: string) => void, isLoading: boolean }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label className="font-bold">Montant (ex: 50 ou -20)</Label>
        <Input 
          type="number" 
          placeholder="Ex: 50" 
          value={amount} 
          onChange={e => setAmount(e.target.value)} 
          className="h-12 rounded-xl border-2"
        />
      </div>
      <div className="space-y-2">
        <Label className="font-bold">Motif de l'ajustement</Label>
        <Input 
          placeholder="Ex: Bonus fidélité" 
          value={reason} 
          onChange={e => setReason(e.target.value)} 
          className="h-12 rounded-xl border-2"
        />
      </div>
      <DialogFooter>
        <Button 
          disabled={isLoading || !amount || !reason} 
          onClick={() => {
            onAdjust(parseInt(amount), reason);
            setAmount("");
            setReason("");
          }}
          className="w-full h-12 rounded-2xl font-bold"
        >
          {isLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          Appliquer
        </Button>
      </DialogFooter>
    </div>
  );
}
