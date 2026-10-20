// Kleine Klänge per WebAudio – keine Dateien nötig. Lautstärke und Stummschaltung kommen aus dem Hallen-Speicher.
import { hallData } from './store';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

export interface Note { f: number; d: number; t?: OscillatorType; v?: number; at?: number; slide?: number }

export function playNotes(notes: Note[]) {
  const h = hallData();
  if (!h.sound || h.volume <= 0) return;
  const c = ac();
  if (!c) return;
  for (const n of notes) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = n.t ?? 'sine';
    const t0 = c.currentTime + (n.at ?? 0);
    o.frequency.setValueAtTime(n.f, t0);
    if (n.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, n.f + n.slide), t0 + n.d);
    const vol = (n.v ?? 0.15) * h.volume;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + n.d + 0.03);
  }
}

/** Rauschstoß (Explosion, Mischen …). */
export function noise(dur = 0.25, vol = 0.2, freq = 800) {
  const h = hallData();
  if (!h.sound || h.volume <= 0) return;
  const c = ac();
  if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol * h.volume;
  s.connect(f).connect(g).connect(c.destination);
  s.start();
}

type SfxName = 'tick' | 'place' | 'erase' | 'good' | 'bad' | 'win' | 'lose' | 'flag' | 'boom' | 'pop' | 'card' | 'drop' | 'clear' | 'rotate' | 'hold' | 'secret' | 'level';
export function sfx(name: SfxName) {
  switch (name) {
    case 'tick': return playNotes([{ f: 900, d: 0.04, t: 'square', v: 0.06 }]);
    case 'place': return playNotes([{ f: 520, d: 0.07, t: 'triangle', v: 0.14 }]);
    case 'erase': return playNotes([{ f: 300, d: 0.06, t: 'triangle', v: 0.1 }]);
    case 'good': return playNotes([{ f: 660, d: 0.09, t: 'sine' }, { f: 880, d: 0.12, at: 0.07 }]);
    case 'bad': return playNotes([{ f: 180, d: 0.18, t: 'sawtooth', v: 0.1 }]);
    case 'flag': return playNotes([{ f: 700, d: 0.05, t: 'square', v: 0.07 }, { f: 520, d: 0.05, t: 'square', v: 0.07, at: 0.05 }]);
    case 'boom': return noise(0.5, 0.35, 500);
    case 'pop': return playNotes([{ f: 500, d: 0.06, t: 'sine', slide: 300 }]);
    case 'card': return noise(0.06, 0.12, 3000);
    case 'drop': return playNotes([{ f: 130, d: 0.09, t: 'triangle', v: 0.2 }]);
    case 'clear': return playNotes([{ f: 523, d: 0.1 }, { f: 659, d: 0.1, at: 0.08 }, { f: 784, d: 0.16, at: 0.16 }]);
    case 'rotate': return playNotes([{ f: 440, d: 0.04, t: 'square', v: 0.05 }]);
    case 'hold': return playNotes([{ f: 330, d: 0.08, t: 'triangle', v: 0.1 }, { f: 440, d: 0.08, t: 'triangle', v: 0.1, at: 0.06 }]);
    case 'win': return playNotes([{ f: 523, d: 0.16 }, { f: 659, d: 0.16, at: 0.14 }, { f: 784, d: 0.16, at: 0.28 }, { f: 1047, d: 0.4, at: 0.42 }]);
    case 'lose': return playNotes([{ f: 392, d: 0.2, t: 'triangle' }, { f: 330, d: 0.2, t: 'triangle', at: 0.18 }, { f: 262, d: 0.4, t: 'triangle', at: 0.36 }]);
    case 'secret': return playNotes([{ f: 392, d: 0.1 }, { f: 494, d: 0.1, at: 0.09 }, { f: 587, d: 0.1, at: 0.18 }, { f: 784, d: 0.3, at: 0.27 }]);
    case 'level': return playNotes([{ f: 587, d: 0.1, t: 'triangle' }, { f: 880, d: 0.18, t: 'triangle', at: 0.09 }]);
  }
}
