'use client';

/**
 * Page « Profil » : qui je suis sur Kinshasa Flow, en un écran.
 * 1. Carte d'identité (photo, nom, rang, commune, impact).
 * 2. Trois raccourcis vers ce qui compte : accès, E-Wallet, série.
 * 3. Réglages utiles (nom, téléphone, commune, sons), puis déconnexion et suppression du compte.
 */

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUser, useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { UserProfile, isUserSubscribedOrHasPass } from '@/lib/types';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { deleteUser, signOut, updateProfile } from 'firebase/auth';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { levelProgress, rankFor, kinshasaDayKey, COMMUNES } from '@/lib/game';
import { RANK_TAGLINES } from '@/lib/kin-slang';
import { KinoisFace } from '@/components/kin/kinois-face';
import { isMuted, setMuted, onMutedChange } from '@/lib/sfx';
import {
  User, Trash2, Loader2, Camera, Star, LogOut, ChevronRight, Crown, Wallet, Flame,
  Pencil, MapPin, Volume2, Phone, Target, ShieldCheck,
} from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

function toDate(v: any): Date | null {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Jours restants sur le pass ou l'abonnement le plus long encore valide. */
function passDaysLeft(p?: UserProfile | null) {
  if (!p) return 0;
  const ends = [p.hasActivePass ? toDate(p.passExpiresAt) : null, p.isCashSubscribed ? toDate(p.cashSubscriptionExpiry) : null]
    .filter((d): d is Date => !!d && d > new Date())
    .map(d => d.getTime());
  if (!ends.length) return 0;
  return Math.max(1, Math.ceil((Math.max(...ends) - Date.now()) / 86400000));
}

/** Réduit la photo à 320 px de côté (JPEG) : upload rapide, même en 3G. */
function shrinkImage(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfilPage() {
  const { user, isUserLoading } = useUser();
  const { auth, firestore, firebaseApp } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingCommune, setSavingCommune] = useState(false);
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
    return onMutedChange(setMutedState);
  }, []);

  const userProfileRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);
  const p = profile as any;

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/');
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser || !user) return;
    setIsDeleting(true);
    try {
      try {
        await deleteDoc(doc(firestore, 'users', user.uid));
      } catch (firestoreErr) {
        console.warn('Firestore deletion warning:', firestoreErr);
      }
      await deleteUser(auth.currentUser);
      toast({ title: 'Compte supprimé', description: 'Toutes vos données ont été effacées de nos serveurs.' });
      router.push('/');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      if (error.code === 'auth/requires-recent-login') {
        toast({
          title: 'Reconnexion nécessaire',
          description: 'Par sécurité, reconnectez-vous puis recommencez la suppression.',
          variant: 'destructive',
        });
        await signOut(auth);
        router.push('/login');
      } else {
        toast({ title: 'Erreur', description: error.message || 'Impossible de supprimer le compte.', variant: 'destructive' });
      }
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Fichier refusé', description: 'Choisissez une image (JPG, PNG…).', variant: 'destructive' });
      return;
    }
    try {
      setImagePreview(await shrinkImage(file));
    } catch {
      toast({ title: 'Image illisible', description: 'Essayez une autre photo.', variant: 'destructive' });
    }
  };

  const handleUpdateProfilePicture = async () => {
    if (!imagePreview || !user || !auth.currentUser) return;
    setIsUploading(true);
    try {
      const avatarRef = storageRef(getStorage(firebaseApp), `avatars/${user.uid}`);
      await uploadString(avatarRef, imagePreview, 'data_url');
      const downloadURL = await getDownloadURL(avatarRef);
      await updateProfile(auth.currentUser, { photoURL: downloadURL });
      await setDoc(doc(firestore, 'users', user.uid), { photoURL: downloadURL }, { merge: true });
      toast({ title: 'Photo mise à jour', description: 'Les autres membres la verront dans Radio Trottoir.' });
      setImagePreview(null);
    } catch (error) {
      console.error('Error updating profile picture:', error);
      toast({ title: 'Erreur', description: 'Impossible de modifier la photo.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const openEdit = () => {
    setEditName(user?.displayName || p?.name || '');
    setEditPhone(p?.phone || '');
    setEditOpen(true);
  };

  const saveInfo = async () => {
    if (!user || !auth.currentUser) return;
    const name = editName.trim().replace(/\s+/g, ' ');
    const phone = editPhone.replace(/[^\d+]/g, '');
    if (name.length < 2 || name.length > 40) {
      toast({ title: 'Nom invalide', description: 'Entre 2 et 40 caractères.', variant: 'destructive' });
      return;
    }
    if (phone && (phone.replace(/\D/g, '').length < 9 || phone.length > 16)) {
      toast({ title: 'Numéro invalide', description: 'Exemple : 0812345678 ou +243812345678.', variant: 'destructive' });
      return;
    }
    setSavingInfo(true);
    try {
      if (name !== user.displayName) await updateProfile(auth.currentUser, { displayName: name });
      await setDoc(doc(firestore, 'users', user.uid), { name, phone }, { merge: true });
      toast({ title: 'Profil enregistré' });
      setEditOpen(false);
    } catch (e) {
      console.error(e);
      toast({ title: 'Erreur', description: "Impossible d'enregistrer.", variant: 'destructive' });
    } finally {
      setSavingInfo(false);
    }
  };

  const saveCommune = async (commune: string) => {
    if (!user) return;
    setSavingCommune(true);
    try {
      await setDoc(doc(firestore, 'users', user.uid), { commune }, { merge: true });
      toast({ title: `Vous jouez pour ${commune}`, description: 'Vos points de la semaine comptent pour votre commune.' });
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'enregistrer la commune.", variant: 'destructive' });
    } finally {
      setSavingCommune(false);
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
          <KinoisFace seed="visiteur" className="h-20 w-20 mx-auto" />
          <h2 className="text-2xl font-black">Mon Profil</h2>
          <p className="text-sm text-muted-foreground">
            Connectez-vous pour retrouver votre rang, vos gains et vos réglages.
          </p>
          <div className="flex gap-3 justify-center">
            <Button asChild className="rounded-xl font-bold px-6"><Link href="/login">Se connecter</Link></Button>
            <Button asChild variant="outline" className="rounded-xl font-bold px-6"><Link href="/signup">Créer un compte</Link></Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // --- Données affichées ---
  const name = user.displayName || p?.name || 'Ndeko';
  const contact = user.email || p?.phone || user.phoneNumber || '';
  const xp = Number(p?.xp || 0);
  const { level, current, needed, pct } = levelProgress(xp);
  const rank = rankFor(level);
  const today = kinshasaDayKey();
  const yesterday = kinshasaDayKey(new Date(Date.now() - 86400000));
  const streak = p?.lastActiveDay === today || p?.lastActiveDay === yesterday ? Number(p?.streakDays || 0) : 0;
  const playedToday = p?.lastActiveDay === today;
  const votes = Number(p?.gameVotes || 0);
  const reports = Number(p?.gameReports || 0);
  const trust = Math.max(0, Math.min(100, Math.round(Number(p?.trustScore ?? 95))));
  const hasPass = isUserSubscribedOrHasPass(profile);
  const daysLeft = passDaysLeft(profile);
  const stars = Number(p?.currentStarsBalance || 0);
  const wallet = Number(p?.walletBalanceCDF || 0);
  const since = toDate(p?.createdAt) || (user.metadata?.creationTime ? new Date(user.metadata.creationTime) : null);
  const photo = imagePreview || user.photoURL || p?.photoURL || '';

  return (
    <AppShell>
      <div className="w-full h-full overflow-y-auto bg-slate-50/50 dark:bg-transparent pb-24">
        <div className="max-w-xl mx-auto p-4 md:p-6 space-y-4">
          {/* 1. Carte d'identité */}
          <section className="relative overflow-hidden rounded-3xl bg-[#0A1A29] text-[#EAF3FA] border border-[#22425C] p-5 shadow-lg">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#2EB6F0]/15 blur-2xl" />
            <div className="relative flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="h-20 w-20 rounded-full ring-4 ring-[#2EB6F0]/40 overflow-hidden bg-[#173248]">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt={name} className="h-full w-full object-cover" />
                  ) : (
                    <KinoisFace seed={user.uid} className="h-full w-full" />
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 grid place-items-center h-8 w-8 rounded-full bg-[#FFD23F] text-[#0A1A29] ring-4 ring-[#0A1A29] hover:scale-105 transition-transform"
                  aria-label="Changer la photo"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
              </div>
              <div className="min-w-0 flex-1">
                <button onClick={openEdit} className="group flex items-center gap-1.5 max-w-full text-left" aria-label="Modifier mon nom">
                  <h1 className="text-xl font-black text-white truncate">{name}</h1>
                  <Pencil className="h-3.5 w-3.5 text-[#8EA8BD] group-hover:text-white shrink-0" />
                </button>
                {contact && <p className="text-xs text-[#8EA8BD] truncate">{contact}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FFD23F] text-[#0A1A29] px-2.5 py-0.5 text-[11px] font-black">
                    Niv. {level} · {rank}
                  </span>
                  {p?.commune && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#173248] px-2.5 py-0.5 text-[11px] font-bold">
                      <MapPin className="h-3 w-3 text-[#2EB6F0]" />{p.commune}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className="relative mt-3 text-[11px] italic text-[#8EA8BD]">{RANK_TAGLINES[rank]}</p>
            <Link href="/quetes" className="relative mt-1.5 block" aria-label="Voir mes quêtes">
              <div className="h-2 rounded-full bg-[#173248] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#2EB6F0] to-[#FFD23F] transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[#8EA8BD] tabular-nums">
                <span>{current} / {needed} XP</span>
                <span>Niveau {level + 1} →</span>
              </div>
            </Link>

            <div className="relative mt-3 grid grid-cols-3 gap-2 text-center">
              <Impact icon={<Target className="h-4 w-4 text-[#2EB6F0]" />} value={fmt(votes)} label="votes" />
              <Impact icon={<MapPin className="h-4 w-4 text-[#FFD23F]" />} value={fmt(reports)} label="signalements" />
              <Impact icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />} value={`${trust} %`} label="fiabilité" />
            </div>
            {since && (
              <p className="relative mt-3 text-[10px] text-[#8EA8BD] text-center">
                Membre depuis {since.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </p>
            )}
          </section>

          {/* Photo choisie : confirmer */}
          {imagePreview && (
            <div className="bg-primary/10 border-2 border-primary/30 p-3 rounded-2xl flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-primary">Nouvelle photo prête</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setImagePreview(null)} disabled={isUploading} className="rounded-xl font-bold">Annuler</Button>
                <Button size="sm" onClick={handleUpdateProfilePicture} disabled={isUploading} className="rounded-xl font-black">
                  {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enregistrer
                </Button>
              </div>
            </div>
          )}

          {/* 2. Raccourcis */}
          <section className="grid grid-cols-3 gap-2">
            <Shortcut
              href="/mes-stars"
              icon={hasPass ? <Crown className="h-5 w-5 text-emerald-600" /> : <Star className="h-5 w-5 text-amber-500 fill-amber-400" />}
              value={hasPass ? `${daysLeft} j` : fmt(stars)}
              label={hasPass ? 'de pass' : 'Stars'}
              alert={!hasPass && stars < 10}
            />
            <Shortcut href="/e-wallet" icon={<Wallet className="h-5 w-5 text-primary" />} value={`${fmt(wallet)}`} label="FC gagnés" />
            <Shortcut
              href="/quetes"
              icon={<Flame className={cn('h-5 w-5', streak > 0 ? 'text-[#FF7A45]' : 'text-slate-400')} />}
              value={`${streak}`}
              label={streak > 1 ? 'jours de suite' : 'jour de suite'}
              alert={streak > 0 && !playedToday}
            />
          </section>
          {streak > 0 && !playedToday && (
            <p className="-mt-2 text-center text-[11px] font-bold text-amber-600">Lelo, joue un coup pour garder ta série !</p>
          )}

          {/* 3. Réglages */}
          <section className="rounded-3xl bg-white dark:bg-slate-900 border shadow-sm divide-y">
            <Row icon={<User className="h-4 w-4" />} label="Nom et téléphone" value={p?.phone || 'Téléphone non renseigné'} onClick={openEdit} />
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="grid place-items-center h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"><MapPin className="h-4 w-4" /></span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">Ma commune</div>
                <div className="text-[11px] text-muted-foreground">Vos XP font gagner votre commune.</div>
              </div>
              <Select value={p?.commune || ''} onValueChange={saveCommune} disabled={savingCommune}>
                <SelectTrigger className="h-9 w-36 rounded-xl text-xs" aria-label="Choisir ma commune">
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {COMMUNES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
              <span className="grid place-items-center h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"><Volume2 className="h-4 w-4" /></span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">Sons de l&apos;app</div>
                <div className="text-[11px] text-muted-foreground">Klaxons, sirènes et « ding » de Radio Trottoir.</div>
              </div>
              <Switch checked={!muted} onCheckedChange={on => setMuted(!on)} aria-label="Activer les sons" />
            </label>
          </section>

          <Button variant="outline" onClick={handleSignOut} className="w-full h-12 rounded-2xl font-bold gap-2 border-2">
            <LogOut className="h-4 w-4" />Se déconnecter
          </Button>

          <button
            onClick={() => setDeleteOpen(true)}
            className="mx-auto flex items-center gap-1.5 text-xs font-bold text-red-600 hover:underline py-2"
          >
            <Trash2 className="h-3.5 w-3.5" />Supprimer mon compte
          </button>
        </div>
      </div>

      {/* Modifier nom et téléphone */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-black">Mon nom et mon téléphone</DialogTitle>
            <DialogDescription>Votre nom apparaît dans Radio Trottoir et le classement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-bold text-muted-foreground">Nom affiché</span>
              <Input value={editName} onChange={e => setEditName(e.target.value)} maxLength={40} className="h-11 rounded-xl" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />Téléphone (retraits Mobile Money)</span>
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} inputMode="tel" placeholder="0812345678" maxLength={16} className="h-11 rounded-xl" />
            </label>
          </div>
          <DialogFooter>
            <Button onClick={saveInfo} disabled={savingInfo} className="w-full h-11 rounded-xl font-black">
              {savingInfo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suppression du compte */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-3xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-xl font-black text-red-600">
              <Trash2 className="h-5 w-5" />Supprimer mon compte ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed pt-2">
              Le compte <strong>{contact || name}</strong> et ses données (profil, photo, Stars, gains non retirés, niveau) seront
              effacés <strong>immédiatement et pour toujours</strong>. Vous serez déconnecté.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 pt-2">
            <AlertDialogCancel className="rounded-xl font-bold" disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-destructive hover:bg-destructive/90 rounded-xl font-black text-white"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Oui, supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Impact({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-[#173248]/70 py-2">
      <div className="flex items-center justify-center gap-1 text-base font-black text-white tabular-nums">{icon}{value}</div>
      <div className="text-[10px] text-[#8EA8BD]">{label}</div>
    </div>
  );
}

function Shortcut({ href, icon, value, label, alert }: { href: string; icon: React.ReactNode; value: string; label: string; alert?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'relative rounded-2xl bg-white dark:bg-slate-900 border shadow-sm p-3 text-center hover:border-primary transition-colors',
        alert && 'border-amber-300',
      )}
    >
      {alert && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
      <div className="flex justify-center">{icon}</div>
      <div className="mt-1 text-lg font-black tabular-nums leading-tight">{value}</div>
      <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
    </Link>
  );
}

function Row({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 first:rounded-t-3xl">
      <span className="grid place-items-center h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold">{label}</div>
        <div className="text-[11px] text-muted-foreground truncate">{value}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
