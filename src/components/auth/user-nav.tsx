'use client';

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useUser, useFirebase } from "@/firebase";
import { Skeleton } from "../ui/skeleton";
import { LogOut, User, Loader2, Image as ImageIcon, Trash2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import React, { useState, useRef } from "react";
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { updateProfile, signOut, deleteUser } from "firebase/auth";
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { Input } from "../ui/input";
import { useRouter } from "next/navigation";
  
export function UserNav() {
    const { user, isUserLoading } = useUser();
    const { auth, firebaseApp, firestore } = useFirebase();
    const { toast } = useToast();
    const router = useRouter();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/');
    };

    const handleDeleteAccount = async () => {
        if (!auth.currentUser || !user) return;
        
        setIsDeleting(true);
        try {
            // 1. Supprimer les données Firestore
            try {
                const userDocRef = doc(firestore, "users", user.uid);
                await deleteDoc(userDocRef);
            } catch (firestoreErr) {
                console.warn("Firestore user deletion warning:", firestoreErr);
            }

            // 2. Supprimer l'utilisateur de Firebase Auth
            await deleteUser(auth.currentUser);

            toast({
                title: "Compte supprimé",
                description: "Toutes vos données ont été définitivement effacées.",
            });
            router.push('/');
        } catch (error: any) {
            console.error("Error deleting account:", error);
            if (error.code === 'auth/requires-recent-login') {
                toast({
                    title: "Action requise",
                    description: "Pour des raisons de sécurité, veuillez vous reconnecter avant de supprimer votre compte.",
                    variant: "destructive"
                });
                await signOut(auth);
                router.push('/login');
            } else {
                toast({
                    title: "Erreur de suppression",
                    description: error.message || "Impossible de supprimer le compte.",
                    variant: "destructive"
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

            const userDocRef = doc(firestore, "users", user.uid);
            await setDoc(userDocRef, { photoURL: downloadURL }, { merge: true });

            toast({
                title: "Profil mis à jour",
                description: "Votre photo de profil a été modifiée avec succès.",
            });
            setDialogOpen(false);
            setImagePreview(null);
        } catch (error) {
            console.error("Error updating profile picture:", error);
            toast({
                title: "Erreur",
                description: "Impossible de modifier la photo. Veuillez réessayer.",
                variant: "destructive",
            });
        } finally {
            setIsUploading(false);
        }
    };


    if (isUserLoading) {
        return <Skeleton className="h-10 w-10 rounded-full" />;
    }

    if (user) {
        return (
            <>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={user.photoURL ?? ""} alt={user.displayName ?? "User"} />
                                <AvatarFallback>
                                    <User className="h-5 w-5" />
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64" align="end" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-bold leading-none">{user.displayName || "Utilisateur"}</p>
                                <p className="text-[10px] leading-none text-muted-foreground truncate">
                                    {user.email}
                                </p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem onSelect={() => router.push('/profil')} className="cursor-pointer font-bold">
                                <User className="mr-2 h-4 w-4" />
                                <span>Mon Profil & Compte</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setDialogOpen(true)} className="cursor-pointer">
                                <ImageIcon className="mr-2 h-4 w-4" />
                                <span>Ma Photo de Profil</span>
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleSignOut} className="text-slate-600 cursor-pointer">
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Se déconnecter</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setDeleteDialogOpen(true)} className="text-destructive focus:bg-destructive/10 cursor-pointer font-bold">
                            <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                            <span>Supprimer mon compte</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <AlertDialogContent className="rounded-3xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <ShieldAlert className="text-destructive h-5 w-5" />
                        Action Irréversible
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Êtes-vous sûr de vouloir supprimer définitivement votre compte Kinshasa Flow ({user.email}) ? Toutes vos stars, signalements et préférences seront immédiatement et définitivement effacés de nos serveurs.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDeleteAccount} 
                        className="bg-destructive hover:bg-destructive/90 rounded-xl font-bold"
                        disabled={isDeleting}
                      >
                        {isDeleting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                        Confirmer la suppression
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="rounded-3xl">
                        <DialogHeader>
                            <DialogTitle>Photo de profil</DialogTitle>
                             <DialogDescription>
                                Choisissez une image claire pour être reconnu par la communauté.
                            </DialogDescription>
                        </DialogHeader>
                        
                        <div className="flex flex-col items-center gap-4 py-4">
                            <Avatar className="h-32 w-32 border-4 border-primary/10 shadow-xl">
                                <AvatarImage src={imagePreview || user.photoURL || ""} />
                                <AvatarFallback className="h-32 w-32">
                                    <div className="h-32 w-32 flex items-center justify-center bg-muted rounded-full">
                                         <User className="h-16 w-16 text-muted-foreground" />
                                    </div>
                                </AvatarFallback>
                            </Avatar>
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="rounded-xl border-2">
                                <ImageIcon className="mr-2 h-4 w-4" />
                                {imagePreview ? "Changer" : "Sélectionner une photo"}
                            </Button>
                            <Input 
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={isUploading} className="rounded-xl font-bold">Annuler</Button>
                            <Button onClick={handleUpdateProfilePicture} disabled={!imagePreview || isUploading} className="rounded-xl font-bold shadow-lg shadow-primary/20">
                                {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Enregistrer
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-xl border-2 font-bold h-9">
                <Link href="/login">Connexion</Link>
            </Button>
            <Button asChild className="rounded-xl font-black h-9 shadow-lg shadow-primary/20 px-4">
                <Link href="/signup">S'inscrire</Link>
            </Button>
        </div>
    )
}
