
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useFirebase, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, limit, serverTimestamp, setDoc, doc, where, Timestamp, updateDoc, increment } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CommunityMessage, ChatComment, WithId, FirestorePermissionError } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { PredictiveForecast } from '@/components/predictive-forecast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Send, 
  ImageIcon, 
  Video as VideoIcon, 
  Mic, 
  MicOff, 
  Loader2, 
  User, 
  Clock, 
  Play, 
  Pause, 
  AlertTriangle, 
  MessagesSquare,
  MapPin,
  Siren,
  Construction,
  Users,
  Car,
  Heart,
  MessageCircle,
  Reply,
  Camera,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { broadcastEmailAction } from '@/app/actions';

const CommentDialog = ({ message }: { message: WithId<CommunityMessage> }) => {
    const [open, setOpen] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { firestore, user } = useFirebase();
    const { toast } = useToast();

    const commentsRef = useMemoFirebase(() => collection(firestore, 'community_chat', message.id, 'comments'), [firestore, message.id]);
    const commentsQuery = useMemoFirebase(() => query(commentsRef, orderBy('timestamp', 'asc')), [commentsRef]);
    const { data: comments, isLoading } = useCollection<ChatComment>(commentsQuery);

    const handleAddComment = async () => {
        if (!user || !newComment.trim()) return;
        setIsSubmitting(true);
        try {
            const commentData = {
                userId: user.uid,
                userName: user.displayName || "Kinois Anonyme",
                userAvatar: user.photoURL || "",
                text: newComment.trim(),
                timestamp: serverTimestamp(),
            };
            await addDocumentNonBlocking(commentsRef, commentData);
            await updateDoc(doc(firestore, 'community_chat', message.id), {
                commentCount: increment(1)
            });
            setNewComment('');
        } catch (e) {
            toast({ title: "Erreur", description: "Impossible d'ajouter le commentaire.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <button 
                onClick={() => setOpen(true)}
                className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-colors"
            >
                <MessageCircle className="h-3.5 w-3.5" />
                {message.commentCount || 0} Commentaires
            </button>
            <DialogContent className="sm:max-w-md rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
                <div className="bg-slate-900 p-6 text-white">
                    <DialogTitle className="text-xl font-black uppercase">Commentaires</DialogTitle>
                    <DialogDescription className="text-slate-400 text-xs">Discussion sur l'alerte à {message.locationName || 'Kinshasa'}</DialogDescription>
                </div>
                <div className="p-4 flex flex-col h-[400px]">
                    <ScrollArea className="flex-1 pr-4">
                        <div className="space-y-4">
                            {isLoading ? <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto h-5 w-5 text-primary" /></div> : 
                             comments && comments.length > 0 ? comments.map(c => (
                                <div key={c.id} className="flex gap-3">
                                    <Avatar className="h-6 w-6 shrink-0 border">
                                        <AvatarImage src={c.userAvatar} />
                                        <AvatarFallback><User size={12} /></AvatarFallback>
                                    </Avatar>
                                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-black uppercase text-slate-600">{c.userName}</span>
                                            <span className="text-[8px] text-slate-400 font-bold">{c.timestamp?.toDate ? format(c.timestamp.toDate(), 'HH:mm', { locale: fr }) : '...'}</span>
                                        </div>
                                        <p className="text-sm font-medium text-slate-700 leading-tight">{c.text}</p>
                                    </div>
                                </div>
                             )) : <p className="text-center py-10 text-slate-400 italic text-xs font-bold uppercase">Aucun commentaire. Soyez le premier !</p>}
                        </div>
                    </ScrollArea>
                    <div className="mt-4 pt-4 border-t flex gap-2">
                        <Input 
                            value={newComment} 
                            onChange={e => setNewComment(e.target.value)} 
                            placeholder="Votre avis..." 
                            className="h-11 rounded-xl font-bold"
                            onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                        />
                        <Button size="icon" onClick={handleAddComment} disabled={isSubmitting || !newComment.trim()} className="h-11 w-11 rounded-xl shadow-lg">
                            {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const MessageBubble = ({ message, isOwn, onReply }: { message: WithId<CommunityMessage>, isOwn: boolean, onReply: (name: string) => void }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  
  const dateObj = message.timestamp?.toDate ? message.timestamp.toDate() : new Date();
  const dayStr = format(dateObj, 'EEEE dd MMMM', { locale: fr });
  const timeStr = format(dateObj, 'HH:mm', { locale: fr });

  const toggleAudio = () => {
    if (!message.mediaUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(message.mediaUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleLike = async () => {
    if (!user) {
        toast({ title: "Connexion requise", variant: "destructive" });
        return;
    }
    try {
      const msgRef = doc(firestore, 'community_chat', message.id);
      await updateDoc(msgRef, { likes: increment(1) });
    } catch (e) {
      console.error("Like failed", e);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: isOwn ? 20 : -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn("flex items-end gap-2 mb-8", isOwn ? "flex-row-reverse" : "flex-row")}
    >
      <Avatar className="h-8 w-8 shrink-0 border border-slate-100 shadow-sm mb-1">
        <AvatarImage src={message.userAvatar} />
        <AvatarFallback className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>

      <div className={cn("max-w-[85%] flex flex-col", isOwn ? "items-end" : "items-start")}>
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
            {isOwn ? "Moi" : message.userName}
          </span>
          <span className="text-[8px] font-bold text-slate-300 uppercase">{dayStr} • {timeStr}</span>
        </div>
        
        <div className={cn(
          "p-4 rounded-[1.75rem] shadow-sm relative",
          isOwn 
            ? "bg-primary text-white rounded-br-none" 
            : "bg-white border border-slate-100 text-slate-800 rounded-bl-none"
        )}>
          {message.alertType && (
            <Badge className={cn(
              "mb-3 flex items-center gap-1.5 font-black text-[9px] uppercase py-1",
              message.alertType === 'travaux' ? "bg-amber-500 text-white" : 
              message.alertType === 'police' ? "bg-red-600 text-white" :
              "bg-orange-600 text-white"
            )}>
              {message.alertType === 'travaux' ? <Construction className="h-3 w-3" /> : 
               message.alertType === 'police' ? <Siren className="h-3 w-3" /> :
               <Car className="h-3 w-3" />}
              Alerte {message.alertType}
            </Badge>
          )}

          {message.mediaUrl && message.mediaType === 'image' && (
            <div className="relative aspect-video rounded-2xl overflow-hidden mb-3 border border-black/5 min-w-[220px]">
              <Image src={message.mediaUrl} alt="Partage" fill className="object-cover" />
            </div>
          )}

          {message.mediaUrl && message.mediaType === 'video' && (
            <video src={message.mediaUrl} controls className="rounded-2xl mb-3 max-h-64 bg-black min-w-[220px]" />
          )}

          {message.mediaUrl && message.mediaType === 'audio' && (
            <div className="flex items-center gap-3 py-1 pr-2">
              <Button 
                onClick={toggleAudio} 
                size="icon" 
                variant="ghost" 
                className={cn("rounded-full h-10 w-10 shrink-0", isOwn ? "text-white hover:bg-white/10" : "text-primary hover:bg-primary/10")}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
              </Button>
              <div className="flex-1 h-1.5 bg-current/20 rounded-full min-w-[140px]">
                <div className="h-full bg-current rounded-full transition-all" style={{ width: isPlaying ? '100%' : '0%', transitionDuration: '3s' }} />
              </div>
            </div>
          )}

          {message.text && (
            <p className={cn("text-sm leading-relaxed", isOwn ? "font-medium" : "font-medium text-slate-700")}>
              {message.text}
            </p>
          )}

          {(message.locationName || message.coords) && (
            <div className={cn(
              "flex items-center gap-1.5 mt-3 pt-2 border-t",
              isOwn ? "border-white/10 text-white/70" : "border-slate-50 text-slate-400"
            )}>
              <MapPin className="h-2.5 w-2.5" />
              <span className="text-[9px] font-black uppercase tracking-tighter truncate max-w-[200px]">
                {message.locationName || "Position GPS"} 
              </span>
            </div>
          )}
        </div>

        <div className={cn("flex items-center gap-4 mt-2 px-2", isOwn ? "flex-row-reverse" : "flex-row")}>
            <button 
                onClick={handleLike}
                className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 hover:text-red-500 transition-colors"
            >
                <Heart className={cn("h-3.5 w-3.5", message.likes && message.likes > 0 && "fill-red-500 text-red-500")} />
                {message.likes || 0}
            </button>
            <CommentDialog message={message} />
            <button 
                onClick={() => onReply(message.userName)}
                className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-colors"
            >
                <Reply className="h-3.5 w-3.5" />
                Répondre
            </button>
        </div>
      </div>
    </motion.div>
  );
};

export default function CommunityChat() {
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [alertDialog, setAlertDialog] = useState<{ open: boolean, type: 'travaux' | 'police' | 'embouteillage' }>({ open: false, type: 'travaux' });
  const [alertLocation, setAlertLocation] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { user, firestore, firebaseApp } = useFirebase();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    const updatePresence = async () => {
      try {
        await setDoc(doc(firestore, 'presence', user.uid), { lastSeen: serverTimestamp() });
      } catch (e) {
        console.error("Presence error", e);
      }
    };
    updatePresence();
    const interval = setInterval(updatePresence, 60000);
    return () => clearInterval(interval);
  }, [user, firestore]);

  const presenceQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    return query(collection(firestore, 'presence'), where('lastSeen', '>=', Timestamp.fromDate(fiveMinsAgo)));
  }, [firestore]);
  const { data: onlineUsers } = useCollection(presenceQuery);
  
  useEffect(() => {
    if (onlineUsers) setOnlineCount(onlineUsers.length);
  }, [onlineUsers]);

  const messagesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'community_chat'), orderBy('timestamp', 'desc'), limit(50));
  }, [firestore]);

  const { data: messages, isLoading } = useCollection<CommunityMessage>(messagesQuery);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (params: { 
    text?: string, 
    mediaFile?: File | Blob, 
    mediaType?: 'image' | 'video' | 'audio',
    alertType?: 'travaux' | 'police' | 'embouteillage',
    locationName?: string
  }) => {
    if (!user) {
      toast({ title: "Connexion requise", variant: "destructive" });
      return;
    }
    if (!params.text?.trim() && !params.mediaFile && !params.alertType) return;

    setIsUploading(true);
    try {
      let mediaUrl = "";
      if (params.mediaFile) {
        try {
          const storage = getStorage(firebaseApp);
          const extension = params.mediaType === 'audio' ? 'wav' : 
                            params.mediaType === 'video' ? 'mp4' : 'jpg';
          
          const safeName = `${Date.now()}.${extension}`;
          const fileRef = storageRef(storage, `chat/${user.uid}/${safeName}`);
          
          const snapshot = await uploadBytes(fileRef, params.mediaFile);
          mediaUrl = await getDownloadURL(snapshot.ref);
        } catch (uploadErr: any) {
          console.error("STORAGE ERROR:", uploadErr);
          
          const permissionError = new FirestorePermissionError({
              path: `storage:chat/${user.uid}/${Date.now()}`,
              operation: 'write',
              requestResourceData: { mediaType: params.mediaType }
          });
          errorEmitter.emit('permission-error', permissionError);

          toast({ 
            title: "Erreur média", 
            description: "Permissions de stockage insuffisantes.",
            variant: "destructive" 
          });
          setIsUploading(false);
          return;
        }
      }

      const messageData = {
        userId: user.uid,
        userName: user.displayName || "Kinois Anonyme",
        userAvatar: user.photoURL || "",
        text: params.text?.trim() || "",
        mediaUrl,
        mediaType: params.mediaType || null,
        locationName: params.locationName || "",
        alertType: params.alertType || null,
        likes: 0,
        commentCount: 0,
        timestamp: serverTimestamp(),
      };

      const chatCollection = collection(firestore, 'community_chat');
      await addDocumentNonBlocking(chatCollection, messageData);

      let recipientEmails: string[] = [];
      try {
          const { getDocs } = await import('firebase/firestore');
          const usersSnap = await getDocs(collection(firestore, 'users'));
          recipientEmails = usersSnap.docs
              .map(doc => doc.data().email)
              .filter(email => email && email.includes('@') && !email.endsWith('@kinshasaflow.online'));
      } catch (e) {
          console.warn("Could not fetch users for broadcast", e);
      }

      // Notification BROADCAST AUTOMATIQUE par e-mail pour chaque post
      broadcastEmailAction({
          title: params.alertType ? `🚨 ALERTE : ${params.alertType.toUpperCase()}` : "💬 Nouveau message sur Radio Trottoir",
          message: params.text || `Média partagé (${params.mediaType})`,
          userName: messageData.userName,
          type: params.alertType ? 'alert' : 'chat',
          location: params.locationName,
          recipientEmails
      }).catch(err => console.warn("[Auto-Email] Echec silencieux", err));

      setInputText('');
      setAlertLocation('');
      setAlertDialog({ ...alertDialog, open: false });
    } catch (e: any) {
      console.error("CHAT SEND ERROR:", e);
      toast({ title: "Erreur d'envoi", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        handleSend({ mediaFile: audioBlob, mediaType: 'audio' });
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      toast({ title: "Microphone bloqué", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#F8FAFC]">
      <div className="p-4 bg-white border-b flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2.5 rounded-2xl shadow-xl shadow-primary/20">
            <MessagesSquare className="text-white h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 leading-none">Radio Trottoir Live</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-[9px] font-black uppercase text-emerald-700 tracking-widest">
                   {onlineCount} en ligne
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 max-w-[200px] overflow-x-auto scrollbar-none">
            <button onClick={() => setAlertDialog({ open: true, type: 'embouteillage' })} className="h-9 px-3 rounded-xl border border-orange-200 text-orange-600 bg-orange-50 font-black text-[9px] uppercase flex items-center gap-1.5 shrink-0">
              <Car className="h-3 w-3" /> Embouteillage
            </button>
            <button onClick={() => setAlertDialog({ open: true, type: 'travaux' })} className="h-9 px-3 rounded-xl border border-amber-200 text-amber-600 bg-amber-50 font-black text-[9px] uppercase flex items-center gap-1.5 shrink-0">
              <Construction className="h-3 w-3" /> Travaux
            </button>
            <button onClick={() => setAlertDialog({ open: true, type: 'police' })} className="h-9 px-3 rounded-xl border border-red-200 text-red-600 bg-red-50 font-black text-[9px] uppercase flex items-center gap-1.5 shrink-0">
              <Siren className="h-3 w-3" /> Police
            </button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4 md:p-8">
        <div className="max-w-4xl mx-auto flex flex-col">
          <div className="mb-8 p-4 md:p-6 bg-slate-50/50 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs">Prévisions du Trafic (Live)</h3>
            </div>
            <PredictiveForecast />
          </div>
          
          <AnimatePresence>
            {messages && [...messages].reverse().map((msg) => (
              <MessageBubble key={msg.id} message={msg} isOwn={msg.userId === user?.uid} onReply={(name) => setInputText(`@${name} `)} />
            ))}
          </AnimatePresence>
          <div ref={scrollRef} className="h-4" />
        </div>
      </ScrollArea>

      <div className="p-4 md:p-6 bg-white border-t">
        <div className="max-w-4xl mx-auto flex items-center gap-2 md:gap-3">
          <div className="flex items-center gap-1 shrink-0">
            <input 
              type="file" 
              id="chat-cam" 
              className="hidden" 
              accept="image/*" 
              onChange={e => e.target.files?.[0] && handleSend({ mediaFile: e.target.files[0], mediaType: 'image' })} 
            />
            <Button asChild variant="ghost" size="icon" className="rounded-full h-11 w-11 text-slate-400 hover:text-primary">
              <label htmlFor="chat-cam" className="cursor-pointer"><Camera className="h-5 w-5" /></label>
            </Button>

            <input 
              type="file" 
              id="chat-img" 
              className="hidden" 
              accept="image/*" 
              onChange={e => e.target.files?.[0] && handleSend({ mediaFile: e.target.files[0], mediaType: 'image' })} 
            />
            <Button asChild variant="ghost" size="icon" className="rounded-full h-11 w-11 text-slate-400 hover:text-primary">
              <label htmlFor="chat-img" className="cursor-pointer"><ImageIcon className="h-5 w-5" /></label>
            </Button>
          </div>

          <div className="flex-1 relative">
            <Input 
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isUploading && handleSend({ text: inputText })}
              placeholder="Décrivez l'état de la route..."
              className="h-14 rounded-2xl border-2 border-slate-100 bg-slate-50 focus-visible:ring-primary font-bold pl-6"
            />
            <Button 
                onClick={() => handleSend({ text: inputText })}
                disabled={!inputText.trim() || isUploading}
                variant="ghost" size="icon" 
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl text-primary"
            >
                {isUploading ? <Loader2 className="animate-spin h-5 w-5" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>

          {isRecording ? (
            <Button onClick={stopRecording} className="h-12 w-12 rounded-full bg-red-500 animate-pulse"><MicOff className="h-5 w-5 text-white" /></Button>
          ) : (
            <Button onClick={startRecording} variant="outline" size="icon" className="h-12 w-12 rounded-full border-2 text-slate-400">
              <Mic className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <Dialog open={alertDialog.open} onOpenChange={(o) => setAlertDialog({ ...alertDialog, open: o })}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className={cn("p-10 text-white", alertDialog.type === 'travaux' ? "bg-amber-500" : alertDialog.type === 'police' ? "bg-red-600" : "bg-orange-600")}>
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase">Signalement {alertDialog.type}</DialogTitle>
              <DialogDescription className="text-white/80 font-medium pt-2">Localisez l'incident pour la communauté.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-10 space-y-6">
            <Input value={alertLocation} onChange={e => setAlertLocation(e.target.value)} placeholder="Nom du lieu..." className="h-14 rounded-2xl font-black text-lg" />
            <DialogFooter>
              <Button onClick={() => handleSend({ alertType: alertDialog.type, locationName: alertLocation, text: `⚠️ Alerte ${alertDialog.type.toUpperCase()} à ${alertLocation}` })} disabled={!alertLocation.trim() || isUploading} className="w-full h-16 rounded-2xl text-lg font-black uppercase shadow-xl">
                {isUploading ? <Loader2 className="animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
                Diffuser l'alerte
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
