/**
 * Graduated urgency signals: haptic + audio only, never visual
 * interruption. whisper < tap < alert. Every API failure is swallowed —
 * a missing vibration motor or a blocked AudioContext must never break
 * the app. One AudioContext is created lazily on the first
 * (user-gesture-triggered) signal so autoplay policies are satisfied.
 */

import type { Urgency } from './trust';

const MUTED_KEY = 'ideario-muted';

export function isMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setMuted(m: boolean): void {
  try {
    window.localStorage.setItem(MUTED_KEY, m ? 'true' : 'false');
  } catch {
    // storage unavailable — fail silently
  }
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

function vibrate(pattern: number | number[]): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // vibration unavailable — fail silently
  }
}

/** Play a sine tone; a second frequency schedules a two-tone slide. */
function tone(freq: number, durationSec: number, gain: number, slideTo?: number): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        // still blocked — fail silently
      });
    }
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo !== undefined) {
      osc.frequency.setValueAtTime(slideTo, ctx.currentTime + durationSec / 2);
    }
    amp.gain.setValueAtTime(gain, ctx.currentTime);
    // Gentle decay so the blip doesn't click.
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationSec);
  } catch {
    // audio unavailable — fail silently
  }
}

export function signalUrgency(u: Urgency): void {
  if (isMuted()) return;
  switch (u) {
    case 'whisper':
      vibrate(40);
      tone(300, 0.08, 0.05);
      break;
    case 'tap':
      vibrate([60, 40, 60]);
      tone(440, 0.12, 0.08);
      break;
    case 'alert':
      vibrate([150, 80, 150]);
      tone(500, 0.25, 0.12, 660);
      break;
  }
}
