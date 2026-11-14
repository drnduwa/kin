'use client';

/**
 * Petits sons de l'app, synthétisés en direct (Web Audio) : aucun fichier à télécharger,
 * rien à payer en données mobiles. Coupés d'un tap (préférence gardée sur l'appareil),
 * et jamais joués avant un premier geste de l'usager (règle des navigateurs).
 */
export type Sfx = 'send' | 'pop' | 'honk' | 'siren' | 'ding' | 'tada' | 'tick';

const KEY = 'kf-sfx-muted';
let ctx: AudioContext | null = null;
const listeners = new Set<(muted: boolean) => void>();

export function isMuted(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setMuted(muted: boolean) {
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* stockage indisponible */ }
  listeners.forEach(l => l(muted));
}

export function onMutedChange(fn: (muted: boolean) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Une note : type d'onde, fréquence de départ → d'arrivée, durée, volume. */
function tone(c: AudioContext, at: number, type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.12) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export function play(name: Sfx) {
  if (isMuted()) return;
  if (typeof navigator !== 'undefined' && (navigator as any).userActivation && !(navigator as any).userActivation.hasBeenActive) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  switch (name) {
    case 'send': // « fiouuu » qui monte
      tone(c, t, 'sine', 380, 1100, 0.16, 0.09);
      break;
    case 'pop': // bulle qui arrive
      tone(c, t, 'triangle', 720, 980, 0.07, 0.1);
      break;
    case 'tick':
      tone(c, t, 'square', 1500, 1400, 0.025, 0.035);
      break;
    case 'ding': // réaction
      tone(c, t, 'sine', 1320, 1320, 0.22, 0.08);
      tone(c, t + 0.07, 'sine', 1760, 1760, 0.25, 0.06);
      break;
    case 'honk': // klaxon de taxi : deux notes un peu fausses
      tone(c, t, 'sawtooth', 392, 380, 0.16, 0.06);
      tone(c, t, 'square', 466, 455, 0.16, 0.04);
      tone(c, t + 0.2, 'sawtooth', 392, 380, 0.24, 0.06);
      tone(c, t + 0.2, 'square', 466, 455, 0.24, 0.04);
      break;
    case 'siren': // sirène courte
      for (let i = 0; i < 3; i++) tone(c, t + i * 0.22, 'triangle', 700, 1150, 0.21, 0.07);
      break;
    case 'tada': // mission / XP
      [523, 659, 784, 1046].forEach((f, i) => tone(c, t + i * 0.08, 'triangle', f, f, 0.18, 0.08));
      break;
  }
}
