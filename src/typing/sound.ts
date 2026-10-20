// Tastenklänge per WebAudio (keine Dateien nötig).
import { getData } from './store';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(c: AudioContext, f: number, dur: number, type: OscillatorType, vol: number, when = 0) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = f;
  const t = c.currentTime + when;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function click(c: AudioContext, vol: number, freq: number, dur = 0.05) {
  if (!noise) return;
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination);
  s.start(); s.stop(c.currentTime + dur);
}

export function keySound(kind: 'ok' | 'err' | 'space' | 'enter') {
  const { sound, volume } = getData().settings;
  if (sound === 'aus') return;
  const c = ac();
  if (!c) return;
  const v = volume;
  if (kind === 'err') { tone(c, 150, 0.12, 'square', 0.12 * v); return; }
  if (sound === 'mechanisch') {
    click(c, 0.9 * v, kind === 'space' ? 900 : 2200 + Math.random() * 600);
    tone(c, 120, 0.04, 'triangle', 0.15 * v);
  } else if (sound === 'schreibmaschine') {
    click(c, 1.2 * v, 1400 + Math.random() * 400, 0.04);
    tone(c, 90, 0.06, 'square', 0.1 * v);
    if (kind === 'enter') tone(c, 1760, 0.5, 'sine', 0.2 * v, 0.02);
  } else {
    tone(c, kind === 'space' ? 330 : 520 + Math.random() * 80, 0.06, 'sine', 0.12 * v);
  }
}

export function winSound() {
  const { sound, volume } = getData().settings;
  if (sound === 'aus') return;
  const c = ac();
  if (!c) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(c, f, 0.25, 'triangle', 0.15 * volume, i * 0.09));
}

export function speak(text: string, lang: 'de' | 'en') {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'de' ? 'de-DE' : 'en-US';
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* kein TTS */ }
}
export const canSpeak = () => typeof speechSynthesis !== 'undefined';
