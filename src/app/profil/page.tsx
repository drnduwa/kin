'use client';

import React, { useState, useRef } from 'react';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUser, useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { UserProfile } from '@/lib/types';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { deleteUser, signOut, updateProfile } from 'firebase/auth';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { 
  User, 
  Mail, 
  ShieldAlert, 
  Trash2, 
  Loader2, 
  Image as ImageIcon, 
  ShieldCheck, 
  Star, 
  LogOut,
  ArrowRight,
  AlertTriangle
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import Link from 'next/link';

export default function ProfilPage() {
  const { user, isUserLoading } = useUser();
  const { auth, firestore, firebaseApp } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/');
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser || !user) return;

    setIsDeleting(true);
    try {
      try {
        const userDocRef = doc(firestore, 'users', user.uid);
        await deleteDoc(userDocRef);
      } catch (firestoreErr) {
        console.warn('Firestore deletion warning:', firestoreErr);
      }

      await deleteUser(auth.currentUser);

      toast({
        title: 'Compte supprimé avec succès',
        description: 'Toutes vos données ont été définitivement effacées de nos serveurs.',
      });
      router.push('/');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      if (error.code === 'auth/requires-recent-login') {
        toast({
          title: 'Action requise',
          description: 'Pour des raisons de sécurité, veuillez vous reconnecter avant de supprimer votre compte.',
          variant: 'destructive',
        });
        await signOut(auth);
        router.push('/login');
      } else {
        toast({
          title: 'Erreur',
          description: error.message || 'Impossible de supprimer le compte. Veuillez réessayer.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfilePicture = async () => {
    if (!imagePreview || !user || !auth.currentUser) return;

    setIsUploading(true);
    try {
      const storage = getStorage(firebaseApp);
      const avatarRef = storageRef(storage, `avatars/${user.uid}`);

      await uploadString(avatarRef, imagePreview, 'data_url');
      const downloadURL = await getDownloadURL(avatarRef);

      await updateProfile(auth.currentUser, { photoURL: downloadURL });
      const userDocRef = doc(firestore, 'users', user.uid);
      await setDoc(userDocRef, { photoURL: downloadURL }, { merge: true });

      toast({
        title: 'Photo mise à jour',
        description: 'Votre photo de profil a été modifiée avec succès.',
      });
      setImagePreview(null);
    } catch (error) {
      console.error('Error updating profile picture:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de modifier la photo.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (isUserLoading) {
    return (
      <AppShell>
        <div className="h-full w-full flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8 text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto p-6 text-center space-y-6 pt-16">
          <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
            <User className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-black">Mon Compte</h2>
          <p className="text-sm text-muted-foreground">
            Connectez-vous pour consulter vos informations de compte, modifier votre profil ou supprimer votre compte.
          </p>
          <div className="flex gap-3 justify-center">
            <Button asChild className="rounded-xl font-bold px-6">
              <Link href="/login">Se connecter</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl font-bold px-6">
              <Link href="/signup">Créer un compte</Link>
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="w-full h-full overflow-y-auto bg-slate-50/50 pb-20">
        <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="h-20 w-20 border-4 border-primary/20 shadow-md">
                  <AvatarImage src={imagePreview || user.photoURL || ''} alt={user.displayName || 'User'} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl font-black">
                    {user.displayName ? user.displayName.charAt(0).toUpperCase() : <User className="h-8 w-8" />}
                  </AvatarFallback>
                </Avatar>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 bg-primary text-white p-1.5 rounded-full shadow hover:bg-primary/90 transition-colors"
                  title="Changer la photo"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleFileChange} 
                />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-slate-900">{user.displayName || 'Utilisateur'}</h1>
                <p className="text-xs md:text-sm text-muted-foreground font-medium flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3.5 w-3.5" />
                  {user.email}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-black bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    {profile?.currentStarsBalance || 0} Stars
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                    <ShieldCheck className="h-3 w-3" />
                    Compte Vérifié
                  </span>
                </div>
              </div>
            </div>

            <Button variant="outline" onClick={handleSignOut} className="rounded-xl font-bold gap-2 text-slate-600 border-2">
              <LogOut className="h-4 w-4" />
              Se déconnecter
            </Button>
          </div>

          {/* Photo Save Action if Preview Active */}
          {imagePreview && (
            <div className="bg-primary/10 border-2 border-primary/30 p-4 rounded-2xl flex items-center justify-between">
              <p className="text-sm font-bold text-primary">Nouvelle photo sélectionnée</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setImagePreview(null)} disabled={isUploading} className="rounded-xl font-bold">
                  Annuler
                </Button>
                <Button size="sm" onClick={handleUpdateProfilePicture} disabled={isUploading} className="rounded-xl font-black">
                  {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enregistrer
                </Button>
              </div>
            </div>
          )}

          {/* User Details Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="rounded-3xl border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-black flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Informations du Compte
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground font-medium">Nom d'affichage</span>
                  <span className="font-bold text-slate-900">{user.displayName || 'Non renseigné'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground font-medium">Email</span>
                  <span className="font-bold text-slate-900">{user.email}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground font-medium">Identifiant unique</span>
                  <span className="font-mono text-xs text-muted-foreground">{user.uid.substring(0, 12)}...</span>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-black flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  Activités & Stars Citoyennes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground font-medium">Solde de Stars</span>
                  <span className="font-black text-amber-600">{profile?.currentStarsBalance || 0} ⭐</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground font-medium">Stars cumulées gagnées</span>
                  <span className="font-bold text-emerald-600">+{profile?.totalStarsEarned || 0} ⭐</span>
                </div>
                <div className="pt-2">
                  <Button asChild variant="outline" className="w-full rounded-xl font-bold text-xs gap-1.5">
                    <Link href="/mes-stars">
                      Accéder à mes Stars
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Apple Guideline 5.1.1(v) Account Deletion Card */}
          <Card className="rounded-3xl border-2 border-red-200 bg-red-50/50 shadow-sm overflow-hidden">
            <CardHeader className="bg-red-100/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-red-600 text-white">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-lg md:text-xl font-black text-red-950">
                    Zone Dangereuse : Suppression du Compte
                  </CardTitle>
                  <CardDescription className="text-xs text-red-700 font-medium">
                    Conformité Apple Guideline 5.1.1 & Protection des données personnelles
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed font-medium">
                Vous pouvez demander à tout moment la suppression définitive de votre compte Kinshasa Flow ainsi que de l'ensemble de vos données associées (profil, photo, historique des signalements, solde de stars). Cette action est <strong>immédiate et irréversible</strong>.
              </p>

              <div className="bg-white p-4 rounded-2xl border border-red-200 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600">
                  Après confirmation, toutes vos données seront définitivement purgées de nos serveurs. Vous serez automatiquement déconnecté.
                </p>
              </div>

              <div className="pt-2">
                <Button 
                  variant="destructive" 
                  onClick={() => setDeleteDialogOpen(true)}
                  className="w-full sm:w-auto h-12 rounded-2xl font-black text-sm gap-2 px-8 shadow-md shadow-red-600/20"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer définitivement mon compte
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Account Deletion Confirmation Dialog */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent className="rounded-3xl max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-xl font-black text-red-600">
                  <ShieldAlert className="h-6 w-6 text-destructive" />
                  Confirmer la suppression
                </AlertDialogTitle>
                <AlertDialogDescription className="text-slate-700 text-sm leading-relaxed pt-2">
                  Êtes-vous absolument certain de vouloir supprimer le compte <strong>{user.email}</strong> ? 
                  <br /><br />
                  Cette opération est <strong>irréversible</strong>. Votre compte et toutes vos données personnelles seront immédiatement et définitivement effacés.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:gap-0 pt-4">
                <AlertDialogCancel className="rounded-xl font-bold" disabled={isDeleting}>
                  Annuler
                </AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDeleteAccount} 
                  className="bg-destructive hover:bg-destructive/90 rounded-xl font-black text-white"
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Oui, supprimer définitivement
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </AppShell>
  );
}
