'use client';

/**
 * Chat Direct — « Radio Trottoir » animée par K-Flow.
 * Messages libres vérifiés avant envoi (liens, numéros, insultes), alertes vérifiées par le serveur
 * (lieu retrouvé, doublons fusionnés) qui alimentent la carte et le Centre de Contrôle,
 * réactions (une par personne), confirmations sur place, personnages kinois et petits sons.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useFirebase, useCollection, useDoc, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, limit, serverTimestamp, setDoc, doc, where, Timestamp, updateDoc, increment, deleteField } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CommunityMessage, ChatComment, WithId } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Send, ImageIcon, Mic, Square, Loader2, Play, Pause, MapPin, Siren, Construction, Car,
  MessageCircle, Reply, Camera, Volume2, VolumeX, ShieldCheck, Map as MapIcon, Megaphone, X, CheckCircle2,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { compressImageForUpload } from '@/lib/image-compress';
import { useToast } from '@/hooks/use-toast';
import { postChatAlertAction, transcribeVoiceNoteAction } from '@/app/actions';
import { VoiceRecorder } from '@/components/kin/voice-recorder';
import { voiceFileInfo, formatDuration } from '@/lib/voice';
import { KFlowAvatar } from '@/components/kin/illustrations';
import { KinoisFace, kinoisFor, KINOIS_TITLES } from '@/components/kin/kinois-face';
import { play, isMuted, setMuted, onMutedChange } from '@/lib/sfx';
import { checkChatText, CHAT_MAX_LEN, type ChatAlertType } from '@/lib/chat-check';

type Msg = WithId<CommunityMessage> & {
  reactions?: Record<string, string>; verified?: boolean; reportId?: string; confirmation?: boolean;
  /** notes vocales : durée, texte compris par K-Flow (écrit par le serveur) et alerte détectée */
  mediaDuration?: number; transcript?: string; voiceAlert?: { type: ChatAlertType; place: string | null } | null;
};

const REACTIONS = ['🔥', '😂', '🙏', '😡', '❤️'] as const;

const QUICK = [
  'Nzela ezali polele ✅',
  'Ekangami mingi 🚗🚗🚗',
  'Pesa nzela ! 📯',
  'Mbote Kin ! 👋',
  'Mvula ezali kobeta 🌧️',
];

const ALERTS: Record<ChatAlertType, { label: string; sub: string; color: string; ring: string; icon: React.ReactNode; sfx: 'honk' | 'siren' }> = {
  embouteillage: { label: 'Embouteillage', sub: 'Ça ne bouge plus', color: 'bg-orange-500', ring: 'ring-orange-400', icon: <Car className="h-5 w-5" />, sfx: 'honk' },
  travaux: { label: 'Travaux / route abîmée', sub: 'Chantier, trou, inondation', color: 'bg-amber-500', ring: 'ring-amber-400', icon: <Construction className="h-5 w-5" />, sfx: 'honk' },
  police: { label: 'Contrôle police', sub: 'PCR, roulage, barrage', color: 'bg-red-600', ring: 'ring-red-400', icon: <Siren className="h-5 w-5" />, sfx: 'siren' },
};

const PLACES = ['Rond-point Victoire', 'Kintambo Magasin', 'Rond-point Ngaba', 'Échangeur de Limete', 'Bd du 30 Juin', 'Av. des Huileries', 'By-Pass', 'Bd Lumumba', 'UPN', 'Rond-point Mandela'];

const HOST_LINES = [
  'Mbote na bino ! Ici Radio Trottoir. Dites-nous ce qui se passe sur vos routes.',
  'Une alerte vérifiée = une route de moins pour les bouchons. Merci ndeko !',
  'Vous êtes coincé ? Lancez une alerte : je la pose sur la carte de tout Kinshasa.',
  'Pas de liens, pas de numéros : ici on parle nzela, pas arnaques.',
  "Quelqu'un a vu un embouteillage ? Confirmez-le d'un tap, ça rend l'info plus sûre.",
];

function dayLabel(d: Date) {
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return 'Hier';
  return format(d, 'EEEE d MMMM', { locale: fr });
}

/* ───────────── Avatar : photo si elle existe, sinon personnage kinois ───────────── */
function MemberAvatar({ uid, src, className }: { uid: string; src?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" onError={() => setBroken(true)} className={cn('rounded-full object-cover', className)} />;
  }
  return <KinoisFace seed={uid} className={className} />;
}

/* ───────────── Mini-illustrations des alertes ───────────── */
function AlertScene({ type, className = 'h-20' }: { type: ChatAlertType; className?: string }) {
  if (type === 'police') {
    return (
      <svg viewBox="0 0 120 44" preserveAspectRatio="xMidYMax slice" className={cn('block w-full', className)} aria-hidden>
        <rect width="120" height="44" rx="10" fill="#1f0a0a" />
        <rect y="30" width="120" height="14" fill="#2b2f36" />
        <path d="M0 37h120" stroke="#fff" strokeDasharray="8 7" strokeWidth="1.4" opacity=".5" className="kf-lane-run" />
        <rect x="44" y="18" width="34" height="14" rx="4" fill="#e2e8f0" />
        <rect x="52" y="12" width="18" height="8" rx="3" fill="#cbd5e1" />
        <rect x="55" y="9" width="5" height="4" rx="1" fill="#ef4444" className="kf-siren-red" />
        <rect x="61" y="9" width="5" height="4" rx="1" fill="#3b82f6" className="kf-siren-blue" />
        <text x="61" y="28" textAnchor="middle" fontSize="6" fontWeight="900" fill="#1e3a8a">PCR</text>
        <circle cx="50" cy="33" r="3.2" fill="#111" /><circle cx="72" cy="33" r="3.2" fill="#111" />
        <g transform="translate(92 14)"><circle cx="5" cy="3" r="3" fill="#6B3E26" /><rect x="1" y="6" width="8" height="12" rx="2" fill="#1e3a8a" /><rect x="0" y="0" width="10" height="2" rx="1" fill="#1e3a8a" /><path d="M9 9l6-5" stroke="#fff" strokeWidth="1.6" className="kf-wave" style={{ transformOrigin: '9px 9px' }} /></g>
      </svg>
    );
  }
  if (type === 'travaux') {
    return (
      <svg viewBox="0 0 120 44" preserveAspectRatio="xMidYMax slice" className={cn('block w-full', className)} aria-hidden>
        <rect width="120" height="44" rx="10" fill="#2a1d05" />
        <rect y="30" width="120" height="14" fill="#2b2f36" />
        <ellipse cx="62" cy="36" rx="16" ry="4" fill="#0b0d10" />
        {[30, 52, 74, 96].map((x, i) => (
          <g key={x} transform={`translate(${x} 18)`} className={i % 2 ? 'kf-bob' : 'kf-bob-slow'}>
            <path d="M5 0l5 14H0z" fill="#f97316" /><rect x="1.8" y="5" width="6.4" height="2" fill="#fff" /><rect x="-1" y="14" width="12" height="2" rx="1" fill="#f97316" />
          </g>
        ))}
        <rect x="10" y="10" width="100" height="5" rx="2" fill="url(#kf-stripes)" />
        <defs><pattern id="kf-stripes" width="10" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#facc15" /><rect x="5" width="5" height="5" fill="#111" /></pattern></defs>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 44" preserveAspectRatio="xMidYMax slice" className={cn('block w-full', className)} aria-hidden>
      <rect width="120" height="44" rx="10" fill="#261005" />
      <rect y="26" width="120" height="18" fill="#2b2f36" />
      {[6, 32, 58, 84, 110].map((x, i) => (
        <g key={x} transform={`translate(${x - 14} ${27 + (i % 2) * 6})`} className="kf-bob" style={{ animationDelay: `${i * 0.15}s` }}>
          <rect width="22" height="8" rx="3" fill={['#facc15', '#e2e8f0', '#1E9BFF', '#facc15', '#ef4444'][i]} />
          <rect x="4" y="-4" width="12" height="5" rx="2" fill={['#facc15', '#e2e8f0', '#1E9BFF', '#facc15', '#ef4444'][i]} />
          <rect x="-1" y="2" width="2" height="2" fill="#ef4444" className="kf-beam" />
          <circle cx="5" cy="8" r="2.2" fill="#111" /><circle cx="17" cy="8" r="2.2" fill="#111" />
        </g>
      ))}
      <text x="60" y="15" textAnchor="middle" fontSize="8" fontWeight="900" fill="#fdba74" className="kf-wiggle" style={{ transformOrigin: '60px 12px', transformBox: 'fill-box' }}>PIN PIN !</text>
    </svg>
  );
}

/* ───────────── Commentaires ───────────── */
const CommentDialog = ({ message }: { message: Msg }) => {
  const [open, setOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { firestore, user } = useFirebase();
  const { toast } = useToast();

  const commentsRef = useMemoFirebase(() => collection(firestore, 'community_chat', message.id, 'comments'), [firestore, message.id]);
  const commentsQuery = useMemoFirebase(() => (open ? query(commentsRef, orderBy('timestamp', 'asc')) : null), [commentsRef, open]);
  const { data: comments, isLoading } = useCollection<ChatComment>(commentsQuery);

  const handleAddComment = async () => {
    if (!user) return;
    const check = checkChatText(newComment);
    if (!check.ok) { toast({ title: 'Commentaire refusé', description: check.reason, variant: 'destructive' }); return; }
    setIsSubmitting(true);
    try {
      await addDocumentNonBlocking(commentsRef, {
        userId: user.uid,
        userName: user.displayName || 'Kinois',
        userAvatar: user.photoURL || '',
        text: check.text,
        timestamp: serverTimestamp(),
      });
      await updateDoc(doc(firestore, 'community_chat', message.id), { commentCount: increment(1) });
      play('send');
      setNewComment('');
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'ajouter le commentaire.", variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-primary transition-colors">
        <MessageCircle className="h-3.5 w-3.5" />
        {message.commentCount || 0}
      </button>
      <DialogContent className="sm:max-w-md rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-[#0A1A29] p-5 text-white">
          <DialogTitle className="text-lg font-black text-white">Commentaires</DialogTitle>
          <DialogDescription className="text-[#8EA8BD] text-xs line-clamp-2">{message.text || message.locationName || 'Radio Trottoir'}</DialogDescription>
        </div>
        <div className="p-4 flex flex-col h-[400px]">
          <ScrollArea className="flex-1 pr-3">
            <div className="space-y-3">
              {isLoading ? <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto h-5 w-5 text-primary" /></div>
                : comments && comments.length > 0 ? comments.map(c => (
                  <div key={c.id} className="flex gap-2.5">
                    <MemberAvatar uid={c.userId} src={c.userAvatar} className="h-7 w-7 shrink-0" />
                    <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 flex-1">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-[11px] font-black text-slate-700">{c.userName}</span>
                        <span className="text-[9px] text-slate-400 font-bold">{c.timestamp?.toDate ? format(c.timestamp.toDate(), 'HH:mm', { locale: fr }) : '…'}</span>
                      </div>
                      <p className="text-sm text-slate-700 leading-snug">{c.text}</p>
                    </div>
                  </div>
                )) : <p className="text-center py-10 text-slate-400 text-xs font-bold">Pas encore de commentaire. Lance la discussion !</p>}
            </div>
          </ScrollArea>
          <div className="mt-3 pt-3 border-t flex gap-2">
            <Input value={newComment} maxLength={CHAT_MAX_LEN} onChange={e => setNewComment(e.target.value)} placeholder="Ton avis…" className="h-11 rounded-xl" onKeyDown={e => e.key === 'Enter' && handleAddComment()} />
            <Button size="icon" onClick={handleAddComment} disabled={isSubmitting || !newComment.trim()} className="h-11 w-11 rounded-xl">
              {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ───────────── Confirmation sur place d'une alerte vérifiée ───────────── */
function ConfirmAlert({ reportId }: { reportId: string }) {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const ref = useMemoFirebase(() => doc(firestore, 'road_condition_reports', reportId), [firestore, reportId]);
  const { data: report } = useDoc<any>(ref);
  const key = `kf-confirmed-${reportId}`;
  const [done, setDone] = useState(false);
  useEffect(() => { try { setDone(localStorage.getItem(key) === '1'); } catch { /* */ } }, [key]);

  const confirm = async () => {
    if (!user) { toast({ title: 'Connexion requise', variant: 'destructive' }); return; }
    if (done) return;
    try {
      await updateDoc(ref, { votes: increment(1) });
      try { localStorage.setItem(key, '1'); } catch { /* */ }
      setDone(true);
      play('ding');
      toast({ title: 'Merci ndeko !', description: 'Votre confirmation rend cette alerte plus sûre pour tout Kinshasa.' });
    } catch {
      toast({ title: 'Confirmation impossible', variant: 'destructive' });
    }
  };

  const votes = Number(report?.votes || 0);
  return (
    <button
      type="button"
      onClick={confirm}
      disabled={done}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black transition-colors',
        done ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/15 text-white hover:bg-white/25'
      )}
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      {done ? 'Confirmé' : 'Je confirme'}{votes > 0 ? ` · ${votes}` : ''}
    </button>
  );
}

/* ───────────── Bulle de message ───────────── */
const MessageBubble = ({ message, isOwn, onReply }: { message: Msg; isOwn: boolean; onReply: (name: string) => void }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [burst, setBurst] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { firestore, user } = useFirebase();
  const { toast } = useToast();

  const timeStr = message.timestamp?.toDate ? format(message.timestamp.toDate(), 'HH:mm', { locale: fr }) : '…';
  const reactions = message.reactions || {};
  const mine = user ? reactions[user.uid] : undefined;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    Object.values(reactions).forEach(e => { c[e] = (c[e] || 0) + 1; });
    if (message.likes) c['❤️'] = (c['❤️'] || 0) + Number(message.likes);
    return c;
  }, [reactions, message.likes]);

  const [progress, setProgress] = useState(0);
  const [audioLen, setAudioLen] = useState<number | null>(message.mediaDuration ?? null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const toggleAudio = () => {
    if (!message.mediaUrl) return;
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = 'auto';
      a.onended = () => { setIsPlaying(false); setProgress(0); };
      a.ontimeupdate = () => { if (a.duration && isFinite(a.duration)) setProgress(a.currentTime / a.duration); };
      a.onloadedmetadata = () => { if (isFinite(a.duration) && a.duration > 0) setAudioLen(a.duration); };
      a.onwaiting = () => setLoadingAudio(true);
      a.onplaying = () => setLoadingAudio(false);
      a.src = message.mediaUrl;
      audioRef.current = a;
    }
    const a = audioRef.current;
    if (isPlaying) { a.pause(); setIsPlaying(false); return; }
    setLoadingAudio(true);
    a.play().then(() => { setIsPlaying(true); setLoadingAudio(false); }).catch(err => {
      setLoadingAudio(false);
      setIsPlaying(false);
      audioRef.current = null;
      const notSupported = (err as { name?: string })?.name === 'NotSupportedError';
      toast({
        title: notSupported ? 'Format non lu par ce téléphone' : 'Lecture impossible',
        description: notSupported ? 'Cette ancienne note n’est pas lisible ici. Les nouvelles notes vocales le sont sur tous les téléphones.' : 'Vérifiez votre connexion puis réessayez.',
        variant: 'destructive',
      });
    });
  };

  const react = async (emoji: string) => {
    if (!user) { toast({ title: 'Connexion requise', variant: 'destructive' }); return; }
    const ref = doc(firestore, 'community_chat', message.id);
    try {
      if (mine === emoji) {
        await updateDoc(ref, { [`reactions.${user.uid}`]: deleteField() });
      } else {
        await updateDoc(ref, { [`reactions.${user.uid}`]: emoji });
        setBurst(emoji);
        setTimeout(() => setBurst(null), 900);
        play('ding');
      }
    } catch (e) {
      console.error('Reaction failed', e);
    }
  };

  const alert = message.alertType ? ALERTS[message.alertType as ChatAlertType] : null;
  const character = KINOIS_TITLES[kinoisFor(message.userId).hat];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={cn('flex items-end gap-2 mb-5', isOwn ? 'flex-row-reverse' : 'flex-row')}
    >
      <MemberAvatar uid={message.userId} src={message.userAvatar} className="h-9 w-9 shrink-0 mb-6 ring-2 ring-white shadow" />

      <div className={cn('max-w-[82%] flex flex-col', isOwn ? 'items-end' : 'items-start')}>
        <div className="flex items-center gap-1.5 mb-1 px-1">
          <span className="text-[11px] font-black text-slate-600">{isOwn ? 'Moi' : message.userName}</span>
          {!message.userAvatar && !isOwn && <span className="text-[9px] font-bold text-slate-400">· {character}</span>}
          <span className="text-[9px] font-bold text-slate-300">{timeStr}</span>
        </div>

        {alert ? (
          <div className={cn('relative w-[min(78vw,320px)] overflow-hidden rounded-3xl text-white shadow-lg ring-2', alert.color, alert.ring, 'kf-alert-pulse')}>
            <AlertScene type={message.alertType as ChatAlertType} />
            <div className="p-3 pt-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-black/20">{alert.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-wide">{message.confirmation ? 'Confirmation' : 'Alerte'} · {alert.label}</div>
                  {message.locationName && <div className="text-sm font-black leading-tight truncate flex items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" />{message.locationName}</div>}
                </div>
              </div>
              {message.text && <p className="text-[13px] leading-snug text-white/90">{message.text}</p>}
              <div className="flex flex-wrap items-center gap-1.5">
                {message.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-1 text-[10px] font-black"><ShieldCheck className="h-3 w-3" /> Lieu vérifié · sur la carte</span>
                )}
                {message.reportId && <ConfirmAlert reportId={message.reportId} />}
                {message.verified && (
                  <Link href="/verifier-trafic" className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-black hover:bg-white/25"><MapIcon className="h-3.5 w-3.5" /> Carte</Link>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className={cn(
            'px-4 py-3 rounded-[1.4rem] shadow-sm relative',
            isOwn ? 'bg-gradient-to-br from-[#1E9BFF] to-[#0B6FD6] text-white rounded-br-md' : 'bg-white border border-slate-100 text-slate-800 rounded-bl-md'
          )}>
            {message.mediaUrl && message.mediaType === 'image' && (
              <div className="relative aspect-video rounded-2xl overflow-hidden mb-2 border border-black/5 min-w-[220px]">
                <Image src={message.mediaUrl} alt="Photo partagée" fill className="object-cover" />
              </div>
            )}
            {message.mediaUrl && message.mediaType === 'video' && (
              <video src={message.mediaUrl} controls className="rounded-2xl mb-2 max-h-64 bg-black min-w-[220px]" />
            )}
            {message.mediaUrl && message.mediaType === 'audio' && (
              <div className="py-1 pr-1">
                <div className="flex items-center gap-2.5">
                  <Button onClick={toggleAudio} size="icon" variant="ghost" aria-label={isPlaying ? 'Pause' : 'Écouter la note vocale'}
                    className={cn('rounded-full h-10 w-10 shrink-0', isOwn ? 'text-white hover:bg-white/10' : 'text-primary hover:bg-primary/10')}>
                    {loadingAudio ? <Loader2 className="h-5 w-5 animate-spin" /> : isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
                  </Button>
                  <div className="flex items-center gap-[3px] h-7 min-w-[120px]" aria-hidden>
                    {Array.from({ length: 22 }).map((_, i) => (
                      <span key={i}
                        className={cn('w-[3px] rounded-full bg-current transition-opacity', i / 22 < progress ? 'opacity-100' : 'opacity-40', isPlaying && 'kf-eq')}
                        style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `${(i % 6) * 0.08}s` }} />
                    ))}
                  </div>
                  <span className={cn('text-[11px] font-bold tabular-nums shrink-0', isOwn ? 'text-white/80' : 'text-slate-500')}>
                    {audioLen ? formatDuration(isPlaying ? audioLen * (1 - progress) : audioLen) : '🎙'}
                  </span>
                </div>
                {message.transcript ? (
                  <p className={cn('mt-1 text-[12px] leading-snug italic', isOwn ? 'text-white/90' : 'text-slate-600 dark:text-slate-300')}>
                    <span aria-hidden>📝 </span>« {message.transcript} »
                  </p>
                ) : null}
              </div>
            )}
            {message.text && <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>}
          </div>
        )}

        {/* Réactions */}
        <div className={cn('relative flex flex-wrap items-center gap-1 mt-1.5 px-1', isOwn ? 'justify-end' : 'justify-start')}>
          <AnimatePresence>
            {burst && (
              <motion.span
                key={burst + Date.now()}
                initial={{ y: 0, opacity: 1, scale: 0.6 }}
                animate={{ y: -34, opacity: 0, scale: 1.8 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                className="pointer-events-none absolute -top-2 left-4 text-xl"
              >{burst}</motion.span>
            )}
          </AnimatePresence>
          {REACTIONS.map(e => {
            const n = counts[e] || 0;
            const active = mine === e;
            if (!n && !active) return (
              <button key={e} type="button" onClick={() => react(e)} className="h-7 w-7 rounded-full text-sm opacity-40 hover:opacity-100 hover:scale-125 transition-all" aria-label={`Réagir ${e}`}>{e}</button>
            );
            return (
              <button key={e} type="button" onClick={() => react(e)} aria-pressed={active}
                className={cn('h-7 px-2 rounded-full text-xs font-bold border transition-all hover:scale-110', active ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-slate-200 text-slate-600')}>
                {e} {n}
              </button>
            );
          })}
          <CommentDialog message={message} />
          {!isOwn && (
            <button onClick={() => onReply(message.userName)} className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-primary transition-colors ml-1">
              <Reply className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

/* ───────────── Bulle de l'animateur K-Flow (locale, jamais enregistrée) ───────────── */
function HostBubble({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 mb-5">
      <KFlowAvatar mood="fluide" className="h-10 w-10 shrink-0 kf-bob-slow" />
      <div className="max-w-[82%]">
        <div className="text-[11px] font-black text-[#1E9BFF] mb-1 px-1">K-Flow · animateur</div>
        <div className="rounded-[1.4rem] rounded-bl-md bg-[#0A1A29] text-[#EAF3FA] px-4 py-3 text-[14px] leading-snug shadow">{text}</div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════ PAGE ═══════════════════════════ */
export default function CommunityChat() {
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceSuggest, setVoiceSuggest] = useState<{ type: ChatAlertType; place: string | null; transcript: string } | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertType, setAlertType] = useState<ChatAlertType>('embouteillage');
  const [alertPlace, setAlertPlace] = useState('');
  const [alertNote, setAlertNote] = useState('');
  const [suggest, setSuggest] = useState<ChatAlertType | null>(null);
  const [muted, setMutedState] = useState(false);
  const [hostLine, setHostLine] = useState(0);
  const [hostEvents, setHostEvents] = useState<{ id: number; text: string }[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const camInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const seenRef = useRef<Set<string> | null>(null);

  const { user, firestore, firebaseApp } = useFirebase();
  const { toast } = useToast();

  useEffect(() => {
    setMutedState(isMuted());
    const off = onMutedChange(setMutedState);
    const t = setInterval(() => setHostLine(n => n + 1), 9000);
    return () => { off(); clearInterval(t); };
  }, []);

  // Présence (« en ligne »)
  useEffect(() => {
    if (!user) return;
    const ping = () => setDoc(doc(firestore, 'presence', user.uid), { lastSeen: serverTimestamp() }).catch(() => {});
    ping();
    const i = setInterval(ping, 60000);
    return () => clearInterval(i);
  }, [user, firestore]);

  const presenceQuery = useMemoFirebase(() => {
    // La présence n'est lisible que connecté : sans compte, on n'interroge pas (sinon la page plante).
    if (!firestore || !user) return null;
    return query(collection(firestore, 'presence'), where('lastSeen', '>=', Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000))));
  }, [firestore, user]);
  const { data: onlineUsers } = useCollection(presenceQuery);
  const onlineCount = onlineUsers?.length ?? 0;

  const messagesQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'community_chat'), orderBy('timestamp', 'desc'), limit(60)) : null), [firestore]);
  const { data: rawMessages, isLoading } = useCollection<CommunityMessage>(messagesQuery);
  const messages = useMemo(() => (rawMessages ? [...rawMessages].reverse() as Msg[] : []), [rawMessages]);

  // Son à l'arrivée d'un nouveau message d'un autre membre (pas au premier chargement)
  useEffect(() => {
    if (!rawMessages) return;
    const ids = new Set(rawMessages.map(m => m.id));
    if (seenRef.current) {
      const fresh = (rawMessages as Msg[]).filter(m => !seenRef.current!.has(m.id) && m.userId !== user?.uid);
      if (fresh.length) {
        const a = fresh.find(m => m.alertType);
        play(a ? ALERTS[a.alertType as ChatAlertType].sfx : 'pop');
      }
    }
    seenRef.current = ids;
  }, [rawMessages, user?.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, hostEvents.length]);

  const toggleMute = () => { setMuted(!muted); if (muted) setTimeout(() => play('pop'), 30); };

  const hostSay = (text: string) => setHostEvents(ev => [...ev.slice(-3), { id: Date.now(), text }]);

  /* Envoi d'un message libre (texte ou média), vérifié avant l'envoi */
  const sendMessage = async (params: {
    text?: string; mediaFile?: File | Blob; mediaType?: 'image' | 'video' | 'audio';
    contentType?: string; ext?: string; durationSec?: number;
  }): Promise<{ ok: boolean; id?: string }> => {
    if (!user) { toast({ title: 'Connexion requise', description: 'Connectez-vous pour parler sur Radio Trottoir.', variant: 'destructive' }); return { ok: false }; }
    let text = '';
    if (params.text !== undefined && !params.mediaFile) {
      const check = checkChatText(params.text);
      if (!check.ok) { toast({ title: 'Message refusé', description: check.reason, variant: 'destructive' }); return { ok: false }; }
      text = check.text;
      if (check.suggest) setSuggest(check.suggest);
    }
    if (!text && !params.mediaFile) return { ok: false };

    setIsUploading(true);
    try {
      let mediaUrl = '';
      if (params.mediaFile) {
        try {
          const storage = getStorage(firebaseApp);
          const ext = params.ext || (params.mediaType === 'video' ? 'mp4' : 'jpg');
          const contentType = params.contentType || params.mediaFile.type || undefined;
          const snap = await uploadBytes(storageRef(storage, `chat/${user.uid}/${Date.now()}.${ext}`), params.mediaFile, contentType ? { contentType } : undefined);
          mediaUrl = await getDownloadURL(snap.ref);
        } catch (err) {
          console.error('STORAGE ERROR:', err);
          toast({ title: 'Envoi impossible', description: params.mediaType === 'audio' ? "La note vocale n'est pas partie (réseau ?). Elle est gardée : réessayez." : "Le fichier n'a pas pu être envoyé.", variant: 'destructive' });
          return { ok: false };
        }
      }
      const created = await addDocumentNonBlocking(collection(firestore, 'community_chat'), {
        userId: user.uid,
        userName: user.displayName || 'Kinois',
        userAvatar: user.photoURL || '',
        text,
        mediaUrl,
        mediaType: params.mediaType || null,
        ...(params.mediaType === 'audio' && params.durationSec ? { mediaDuration: Math.round(params.durationSec) } : {}),
        locationName: '',
        alertType: null,
        likes: 0,
        commentCount: 0,
        reactions: {},
        timestamp: serverTimestamp(),
      });
      if (!created) return { ok: false };
      play('send');
      if (!params.mediaFile) setInputText('');
      return { ok: true, id: created.id };
    } catch (e) {
      console.error('CHAT SEND ERROR:', e);
      toast({ title: "Erreur d'envoi", variant: 'destructive' });
      return { ok: false };
    } finally {
      setIsUploading(false);
    }
  };

  /* Alerte vérifiée par le serveur */
  const openAlert = (type: ChatAlertType, note = '') => {
    setAlertType(type);
    setAlertNote(note);
    setAlertOpen(true);
    play(ALERTS[type].sfx);
  };

  const sendAlert = async () => {
    if (!user) { toast({ title: 'Connexion requise', variant: 'destructive' }); return; }
    setIsUploading(true);
    try {
      const res = await postChatAlertAction({ idToken: await user.getIdToken(), type: alertType, place: alertPlace, note: alertNote });
      if (!res.success) {
        toast({ title: 'Alerte non publiée', description: res.error, variant: 'destructive' });
        return;
      }
      setAlertOpen(false);
      setAlertPlace('');
      setAlertNote('');
      setSuggest(null);
      setVoiceSuggest(null);
      if (res.duplicate) {
        play('ding');
        hostSay(`Bien vu ndeko ! Quelqu'un avait déjà signalé ${res.locationName} : j'ai ajouté ta confirmation, l'alerte est plus sûre.`);
      } else {
        play('tada');
        hostSay(`Alerte vérifiée ! ${res.locationName} est maintenant sur la carte de tout Kinshasa.${res.reward?.xpGained ? ` +${res.reward.xpGained} XP` : ''}${res.reward?.rewardCDF ? ` et +${res.reward.rewardCDF} FC` : ''}. Merci, mokonzi ya nzela !`);
      }
    } catch {
      toast({ title: 'Erreur', description: "L'alerte n'a pas pu être envoyée.", variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  /* Note vocale : envoi, puis K-Flow écoute et propose d'en faire une alerte vérifiée */
  const sendVoice = async (note: { blob: Blob; mime: string; durationSec: number }) => {
    const info = voiceFileInfo(note.mime);
    const res = await sendMessage({ mediaFile: note.blob, mediaType: 'audio', contentType: info.contentType, ext: info.ext, durationSec: note.durationSec });
    if (res.ok && res.id && user) void listenToVoice(res.id);
    return res.ok;
  };

  const listenToVoice = async (messageId: string) => {
    try {
      const out = await transcribeVoiceNoteAction({ idToken: await user!.getIdToken(), messageId });
      if (!out.success) return; // transcription indisponible : la note vocale reste une note vocale
      if (out.alertType) {
        setVoiceSuggest({ type: out.alertType, place: out.place, transcript: out.transcript });
        setSuggest(null);
        play('pop');
        hostSay(`J'ai bien entendu ndeko : ${ALERTS[out.alertType].label.toLowerCase()}${out.place ? ` à ${out.place}` : ''}. On le met sur la carte ?`);
      }
    } catch { /* silencieux : ne bloque jamais le chat */ }
  };

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try { await sendMessage({ mediaFile: await compressImageForUpload(file, 1280, 0.75), mediaType: 'image', contentType: 'image/jpeg', ext: 'jpg' }); }
    catch { await sendMessage({ mediaFile: file, mediaType: 'image' }); }
  };

  let lastDay = '';

  return (
    <div className="w-full h-full flex flex-col bg-[#EEF3F8] dark:bg-slate-950">
      {/* ── Studio Radio Trottoir ── */}
      <div className="relative overflow-hidden bg-[#0A1A29] text-white border-b border-[#22425C] z-20">
        <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 15% 50%, #1E9BFF 0, transparent 45%), radial-gradient(circle at 90% 0%, #FF7A45 0, transparent 35%)' }} />
        <div className="relative flex items-center gap-3 px-3 py-2.5">
          <div className="relative shrink-0">
            <KFlowAvatar mood="fluide" className="h-12 w-12 kf-bob-slow" />
            <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-[#FF3B3B] ring-2 ring-[#0A1A29]"><Mic className="h-3 w-3" /></span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display uppercase tracking-wide text-lg leading-none truncate text-white">Radio Trottoir</h2>
              <span className="inline-flex items-center gap-1 rounded bg-[#FF3B3B] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest kf-onair">On air</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-[#8EA8BD]">
              <span className="flex items-end gap-[2px] h-3" aria-hidden>{[0, 1, 2, 3].map(i => <span key={i} className="w-[3px] h-full rounded-full bg-[#3DDC97] kf-eq" style={{ animationDelay: `${i * 0.12}s` }} />)}</span>
              <span className="font-bold text-[#3DDC97]">{onlineCount} en ligne</span>
              <span className="truncate">· animé par K-Flow</span>
            </div>
          </div>
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Activer les sons' : 'Couper les sons'} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-[#FFD23F]" />}
          </button>
        </div>
        {/* Boutons d'alerte */}
        <div className="relative flex gap-2 px-3 pb-3 overflow-x-auto no-scrollbar">
          {(Object.keys(ALERTS) as ChatAlertType[]).map(t => (
            <button key={t} type="button" onClick={() => openAlert(t)}
              className={cn('shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-lg active:scale-95 transition-transform', ALERTS[t].color)}>
              {ALERTS[t].icon}<span>{t === 'travaux' ? 'Travaux' : ALERTS[t].label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Fil ── */}
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto flex flex-col px-3 py-4 md:px-6">
          <AnimatePresence mode="wait">
            <motion.div key={hostLine % HOST_LINES.length} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <HostBubble text={HOST_LINES[hostLine % HOST_LINES.length]} />
            </motion.div>
          </AnimatePresence>

          {isLoading && <div className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>}

          {messages.map(msg => {
            const d = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
            const label = dayLabel(d);
            const sep = label !== lastDay;
            lastDay = label;
            return (
              <React.Fragment key={msg.id}>
                {sep && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-white/80 dark:bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 shadow-sm">{label}</span>
                  </div>
                )}
                <MessageBubble message={msg} isOwn={msg.userId === user?.uid} onReply={name => setInputText(`@${name} `)} />
              </React.Fragment>
            );
          })}

          {hostEvents.map(ev => <HostBubble key={ev.id} text={ev.text} />)}
          <div ref={bottomRef} className="h-2" />
        </div>
      </ScrollArea>

      {/* ── K-Flow a compris une note vocale : en faire une alerte vérifiée ── */}
      <AnimatePresence>
        {voiceSuggest && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            className="mx-3 mb-2 rounded-2xl bg-[#0A1A29] text-white p-3 shadow-xl space-y-2">
            <div className="flex items-start gap-2">
              <KFlowAvatar mood="dense" className="h-8 w-8 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-snug">J&apos;ai entendu <b>{ALERTS[voiceSuggest.type].label.toLowerCase()}</b>{voiceSuggest.place ? <> à <b>{voiceSuggest.place}</b></> : null}. On le met sur la carte ?</p>
                {voiceSuggest.transcript && <p className="mt-1 text-[11px] italic text-[#8EA8BD] line-clamp-2">« {voiceSuggest.transcript} »</p>}
              </div>
              <button type="button" onClick={() => setVoiceSuggest(null)} className="p-1 text-[#8EA8BD]" aria-label="Non merci"><X className="h-4 w-4" /></button>
            </div>
            <Button size="sm" onClick={() => { setAlertPlace(voiceSuggest.place || ''); openAlert(voiceSuggest.type, voiceSuggest.transcript.slice(0, 160)); }}
              className={cn('w-full h-9 rounded-full text-xs font-black', ALERTS[voiceSuggest.type].color)}>
              <Megaphone className="h-3.5 w-3.5 mr-1" /> Oui, alerte vérifiée
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Suggestion : ce message ressemble à une alerte ── */}
      <AnimatePresence>
        {suggest && !voiceSuggest && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            className="mx-3 mb-2 flex items-center gap-2 rounded-2xl bg-[#0A1A29] text-white p-2.5 pl-3 shadow-xl">
            <KFlowAvatar mood="dense" className="h-8 w-8 shrink-0" />
            <p className="flex-1 text-xs leading-snug">On dirait une info <b>{ALERTS[suggest].label.toLowerCase()}</b>. Tu en fais une alerte vérifiée sur la carte ?</p>
            <Button size="sm" onClick={() => openAlert(suggest)} className={cn('h-8 rounded-full text-[11px] font-black', ALERTS[suggest].color)}>
              <Megaphone className="h-3.5 w-3.5 mr-1" /> Oui
            </Button>
            <button type="button" onClick={() => setSuggest(null)} className="p-1 text-[#8EA8BD]" aria-label="Non merci"><X className="h-4 w-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Saisie ── */}
      <div className="bg-white dark:bg-slate-900 border-t pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-3 pt-2.5">
          {QUICK.map(q => (
            <button key={q} type="button" onClick={() => sendMessage({ text: q })} disabled={isUploading}
              className="shrink-0 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-primary/60 active:scale-95 transition-all">
              {q}
            </button>
          ))}
        </div>
        <div className="max-w-3xl mx-auto flex items-center gap-1.5 px-3 pt-2">
          <input type="file" ref={camInputRef} className="hidden" accept="image/*" capture="environment" onChange={pickImage} />
          <input type="file" ref={imgInputRef} className="hidden" accept="image/*" onChange={pickImage} />
          {!voiceActive && (<>
          <Button type="button" variant="ghost" size="icon" onClick={() => camInputRef.current?.click()} className="rounded-full h-10 w-10 shrink-0 text-slate-400 hover:text-primary" aria-label="Prendre une photo"><Camera className="h-5 w-5" /></Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => imgInputRef.current?.click()} className="rounded-full h-10 w-10 shrink-0 text-slate-400 hover:text-primary hidden sm:inline-flex" aria-label="Choisir une image"><ImageIcon className="h-5 w-5" /></Button>

          <div className="flex-1 relative">
            <Input
              value={inputText}
              maxLength={CHAT_MAX_LEN}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isUploading && sendMessage({ text: inputText })}
              placeholder="Ça roule chez toi ?"
              className="h-12 rounded-2xl border-2 border-slate-100 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 font-semibold pl-4 pr-12"
            />
            {inputText.length > CHAT_MAX_LEN - 40 && (
              <span className="absolute right-12 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 tabular-nums">{CHAT_MAX_LEN - inputText.length}</span>
            )}
            <Button onClick={() => sendMessage({ text: inputText })} disabled={!inputText.trim() || isUploading} size="icon"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-xl" aria-label="Envoyer">
              {isUploading ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          </>)}

          <VoiceRecorder onSend={sendVoice} onActiveChange={setVoiceActive} disabled={isUploading} />
        </div>
      </div>

      {/* ── Fenêtre d'alerte ── */}
      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent className="sm:max-w-md rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className={cn('text-white', ALERTS[alertType].color)}>
            <AlertScene type={alertType} className="h-28" />
            <div className="p-5 pt-3">
              <DialogTitle className="text-2xl font-black text-white">{ALERTS[alertType].label}</DialogTitle>
              <DialogDescription className="text-white/85 text-sm">K-Flow vérifie le lieu, puis pose l'alerte sur la carte de tout Kinshasa.</DialogDescription>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(ALERTS) as ChatAlertType[]).map(t => (
                <button key={t} type="button" onClick={() => { setAlertType(t); play(ALERTS[t].sfx); }} aria-pressed={alertType === t}
                  className={cn('rounded-2xl border-2 p-2 text-center text-[11px] font-black transition-all', alertType === t ? cn(ALERTS[t].color, 'text-white border-transparent scale-[1.03]') : 'border-slate-200 text-slate-600')}>
                  <span className="mx-auto mb-1 grid h-7 w-7 place-items-center">{ALERTS[t].icon}</span>
                  {t === 'travaux' ? 'Travaux' : ALERTS[t].label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500" htmlFor="kf-alert-place">Où ça ?</label>
              <Input id="kf-alert-place" value={alertPlace} onChange={e => setAlertPlace(e.target.value)} placeholder="Ex. : Rond-point Victoire" className="h-12 rounded-xl font-bold" maxLength={80} />
              <div className="flex flex-wrap gap-1.5">
                {PLACES.map(p => (
                  <button key={p} type="button" onClick={() => setAlertPlace(p)} className={cn('rounded-full border px-2.5 py-1 text-[11px] font-bold', alertPlace === p ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-600')}>{p}</button>
                ))}
              </div>
            </div>
            <Input value={alertNote} onChange={e => setAlertNote(e.target.value)} placeholder="Détail (facultatif) : sens, voie, depuis quand…" className="h-11 rounded-xl" maxLength={160} />
            <Button onClick={sendAlert} disabled={alertPlace.trim().length < 3 || isUploading} className={cn('w-full h-14 rounded-2xl text-base font-black uppercase shadow-xl', ALERTS[alertType].color)}>
              {isUploading ? <Loader2 className="animate-spin" /> : <><Megaphone className="mr-2 h-5 w-5" /> Diffuser l'alerte</>}
            </Button>
            <p className="text-[11px] text-center text-slate-500">Une alerte toutes les 3 minutes. Les fausses alertes sont retirées.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
