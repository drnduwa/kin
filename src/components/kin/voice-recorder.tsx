'use client';

/**
 * Enregistreur de note vocale : micro → enregistrement (chrono, niveau du micro en direct, 60 s max)
 * → écoute avant envoi (réécouter, recommencer, envoyer). Jamais d'envoi « à l'aveugle ».
 * Les problèmes de micro sont expliqués (WhatsApp/Facebook, micro bloqué, micro occupé).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, X, Play, Pause, RotateCcw, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { play } from '@/lib/sfx';
import { pickVoiceMime, voiceSupportProblem, micErrorMessage, formatDuration } from '@/lib/voice';

export const VOICE_MAX_SEC = 60;
const MIN_SEC = 1;
const BARS = 28;

type Phase = 'idle' | 'recording' | 'preview';

export function VoiceRecorder({ onSend, onActiveChange, disabled }: {
  onSend: (note: { blob: Blob; mime: string; durationSec: number }) => Promise<boolean>;
  onActiveChange?: (active: boolean) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const [note, setNote] = useState<{ blob: Blob; mime: string; durationSec: number; url: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sending, setSending] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const discardRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { onActiveChange?.(phase !== 'idle'); }, [phase, onActiveChange]);

  const releaseDevices = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    rafRef.current = null; tickRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  };

  const clearNote = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setNote(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });
  };

  useEffect(() => () => {
    discardRef.current = true;
    try { recRef.current?.state === 'recording' && recRef.current.stop(); } catch { /* déjà arrêté */ }
    releaseDevices();
    clearNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    const problem = voiceSupportProblem();
    if (problem) { toast({ ...problem, variant: 'destructive' }); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      toast({ ...micErrorMessage(err), variant: 'destructive' });
      return;
    }
    streamRef.current = stream;
    const mime = pickVoiceMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    } catch {
      rec = new MediaRecorder(stream);
    }
    recRef.current = rec;
    const chunks: Blob[] = [];
    discardRef.current = false;
    rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      const durationSec = (performance.now() - startedAtRef.current) / 1000;
      releaseDevices();
      if (discardRef.current) { setPhase('idle'); return; }
      const type = rec.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunks, { type });
      if (durationSec < MIN_SEC || blob.size < 800) {
        toast({ title: 'Trop court', description: 'Touchez le micro, parlez, puis touchez ■ pour terminer.' });
        setPhase('idle');
        return;
      }
      setNote({ blob, mime: type, durationSec: Math.min(durationSec, VOICE_MAX_SEC), url: URL.createObjectURL(blob) });
      setPhase('preview');
    };

    // Niveau du micro en direct : l'usager voit que sa voix est bien captée.
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let last = 0;
      const loop = (t: number) => {
        rafRef.current = requestAnimationFrame(loop);
        if (t - last < 90) return;
        last = t;
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
        const v = Math.min(1, 0.08 + (peak / 128) * 1.6);
        setLevels(prev => [...prev.slice(1), v]);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch { /* pas d'analyseur : l'enregistrement marche quand même */ }

    startedAtRef.current = performance.now();
    setElapsed(0);
    setLevels(Array(BARS).fill(0.08));
    tickRef.current = setInterval(() => {
      const s = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(s);
      if (s >= VOICE_MAX_SEC && rec.state === 'recording') rec.stop();
    }, 200);
    rec.start(250); // morceaux réguliers : indispensable sur iPhone
    setPhase('recording');
    play('tick');
    try { navigator.vibrate?.(25); } catch { /* pas de vibreur */ }
  };

  const stop = () => { if (recRef.current?.state === 'recording') recRef.current.stop(); };
  const cancel = () => {
    discardRef.current = true;
    if (recRef.current?.state === 'recording') recRef.current.stop(); else { releaseDevices(); setPhase('idle'); }
  };

  const togglePreview = () => {
    if (!note) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(note.url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); return; }
    audioRef.current.play().then(() => setPlaying(true)).catch(() => {
      toast({ title: 'Lecture impossible ici', description: 'Vous pouvez quand même l’envoyer.' });
    });
  };

  const redo = () => { clearNote(); setPhase('idle'); void start(); };

  const send = async () => {
    if (!note) return;
    setSending(true);
    audioRef.current?.pause();
    try {
      const ok = await onSend({ blob: note.blob, mime: note.mime, durationSec: note.durationSec });
      if (ok) { clearNote(); setPhase('idle'); }
    } finally {
      setSending(false);
    }
  };

  if (phase === 'idle') {
    return (
      <Button onClick={start} disabled={disabled} variant="outline" size="icon"
        className="h-11 w-11 shrink-0 rounded-full border-2 text-slate-500 hover:text-red-500 hover:border-red-300" aria-label="Enregistrer une note vocale">
        <Mic className="h-5 w-5" />
      </Button>
    );
  }

  const left = Math.max(0, VOICE_MAX_SEC - elapsed);
  return (
    <div className="flex flex-1 items-center gap-2 rounded-full bg-white dark:bg-slate-900 border-2 border-red-200 dark:border-red-900 pl-1.5 pr-1.5 h-12 min-w-0">
      {phase === 'recording' ? (
        <>
          <Button onClick={cancel} size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full text-slate-500" aria-label="Annuler l’enregistrement">
            <X className="h-5 w-5" />
          </Button>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 animate-pulse" aria-hidden />
          <span className="text-sm font-black tabular-nums text-red-600 shrink-0" aria-live="polite">{formatDuration(elapsed)}</span>
          <div className="flex flex-1 items-center justify-center gap-[2px] h-7 min-w-0 overflow-hidden" aria-hidden>
            {levels.map((v, i) => (
              <span key={i} className="w-[3px] shrink-0 rounded-full bg-red-400 transition-[height] duration-100" style={{ height: `${Math.round(v * 100)}%` }} />
            ))}
          </div>
          {left <= 10 && <span className="text-[10px] font-bold text-amber-600 shrink-0">{Math.ceil(left)} s</span>}
          <Button onClick={stop} size="icon" className="h-9 w-9 shrink-0 rounded-full bg-red-500 hover:bg-red-600" aria-label="Terminer l’enregistrement">
            <Square className="h-4 w-4 fill-white text-white" />
          </Button>
        </>
      ) : (
        <>
          <Button onClick={redo} size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full text-slate-500" aria-label="Recommencer" disabled={sending}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button onClick={togglePreview} size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full text-primary" aria-label={playing ? 'Pause' : 'Réécouter'} disabled={sending}>
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
          </Button>
          <div className="flex flex-1 items-center gap-[2px] h-6 min-w-0 overflow-hidden" aria-hidden>
            {levels.map((v, i) => (
              <span key={i} className={cn('w-[3px] shrink-0 rounded-full bg-primary/60', playing && 'kf-eq')} style={{ height: `${Math.round(v * 100)}%`, animationDelay: `${(i % 6) * 0.08}s` }} />
            ))}
          </div>
          <span className="text-xs font-bold tabular-nums text-slate-500 shrink-0">{formatDuration(note?.durationSec || 0)}</span>
          <Button onClick={send} size="icon" className="h-9 w-9 shrink-0 rounded-full" aria-label="Envoyer la note vocale" disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </>
      )}
    </div>
  );
}
