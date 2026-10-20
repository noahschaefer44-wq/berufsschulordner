import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Keyboard from './Keyboard';
import { FINGER_NAMES, layoutById, locate } from './layouts';
import { keySound, winSound } from './sound';
import { BADGES, addKeyStat, flushStats, getData, recordRun, useSettings, type RunResult } from './store';

export interface Racer { name: string; wpm: number }
export interface TextRunProps {
  text: string;
  /** Kennung für Statistik, z. B. „sprint“ oder „lektion:home-1“ */
  mode: string;
  timeLimit?: number;
  hardcore?: boolean;
  blind?: boolean;
  zen?: boolean;
  prompt?: ReactNode;
  racers?: Racer[];
  recordKeys?: boolean;
  goal?: { wpm: number; acc: number };
  onFinish?: (r: RunResult, stars: number) => void;
  onRestart: () => void;
  onNext?: () => void;
  nextLabel?: string;
  extra?: ReactNode;
  /** Eingabe gesperrt (z. B. Countdown im Rennspiel) */
  locked?: boolean;
  /** Ergebnisfenster nicht anzeigen (das Spiel zeigt sein eigenes) */
  hideResult?: boolean;
  onProgress?: (p: { idx: number; len: number; wpm: number; elapsed: number; errs: number; streak: number; running: boolean }) => void;
}

const minutes = (secs: number) => Math.max(secs, 0.5) / 60;

export function Confetti() {
  const bits = useMemo(() => Array.from({ length: 46 }, (_, i) => ({ i, x: Math.random() * 100, d: Math.random() * 0.6, c: ['#e5604e', '#f2a93b', '#4fb07a', '#3fb6c4', '#5b8def', '#8c6bd6'][i % 6], r: Math.random() * 360 })), []);
  return (
    <div className="tp-confetti" aria-hidden="true">
      {bits.map((b) => <i key={b.i} style={{ left: `${b.x}%`, animationDelay: `${b.d}s`, background: b.c, transform: `rotate(${b.r}deg)` }} />)}
    </div>
  );
}

export function Series({ data, w = 360, h = 70 }: { data: number[]; w?: number; h?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 10);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * (w - 8) + 4},${h - 6 - (v / max) * (h - 12)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="tp-series" role="img" aria-label="Tempo pro Sekunde">
      <polyline points={pts} fill="none" stroke="var(--tp-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function TextRun(p: TextRunProps) {
  const s = useSettings();
  const layout = layoutById(s.layout);
  const text = p.text;
  const [typed, setTyped] = useState<string[]>([]);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<(RunResult & { stars: number; place?: number; fresh: boolean; badges: string[] }) | null>(null);
  const [note, setNote] = useState('');
  const t = useRef({ typed: [] as string[], start: 0, keys: 0, good: 0, errs: 0, last: 0, series: [] as number[], done: false, streak: 0 });
  const box = useRef<HTMLDivElement>(null);
  const cur = useRef<HTMLSpanElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  // Neustart bei neuem Text
  useEffect(() => {
    t.current = { typed: [], start: 0, keys: 0, good: 0, errs: 0, last: 0, series: [], done: false, streak: 0 };
    setTyped([]); setResult(null); setNow(0); setNote('');
    hidden.current?.focus();
  }, [text]);

  const finish = useCallback((timeUp = false) => {
    const c = t.current;
    if (c.done) return;
    c.done = true;
    const secs = timeUp && p.timeLimit ? p.timeLimit : Math.max(0.2, (performance.now() - c.start) / 1000);
    const right = c.typed.reduce((a, ch, i) => a + (ch === text[i] ? 1 : 0), 0);
    const r: RunResult = {
      wpm: Math.round((right / 5 / minutes(secs)) * 10) / 10,
      raw: Math.round((c.typed.length / 5 / minutes(secs)) * 10) / 10,
      acc: c.keys ? Math.round((c.good / c.keys) * 1000) / 10 : 100,
      secs, chars: right, errs: c.errs, series: c.series,
    };
    let stars = 0;
    if (p.goal) {
      stars = r.acc >= p.goal.acc && r.wpm >= p.goal.wpm ? 3 : r.acc >= p.goal.acc - 2 && r.wpm >= p.goal.wpm * 0.75 ? 2 : r.acc >= p.goal.acc - 6 ? 1 : 0;
    }
    const before = getData().best[p.mode.split(':')[0]] ?? 0;
    const flags = (p.hardcore ? ':hardcore' : '') + (p.blind ? ':blind' : '') + (p.zen ? ':zen' : '');
    flushStats();
    const got = recordRun(p.mode + flags, r);
    const place = p.racers?.length ? 1 + p.racers.filter((x) => text.length / ((x.wpm * 5) / 60) < secs).length : undefined;
    setResult({ ...r, stars, place, fresh: r.wpm > before && r.acc >= 90 && before > 0, badges: got });
    if (r.acc >= 90 || stars > 0) winSound();
    p.onFinish?.(r, stars);
  }, [p, text]);

  const press = useCallback((ch: string) => {
    const c = t.current;
    if (c.done || p.locked || c.typed.length >= text.length) return;
    const nowMs = performance.now();
    if (!c.start) c.start = nowMs;
    const idx = c.typed.length;
    const exp = text[idx];
    const ok = ch === exp;
    c.keys++;
    if (ok) { c.good++; c.streak++; } else { c.errs++; c.streak = 0; }
    if (p.recordKeys !== false && exp !== '\n') {
      const dt = c.last ? nowMs - c.last : 0;
      addKeyStat('keys', exp.toLowerCase(), ok, dt);
      if (idx > 0) addKeyStat('pairs', (text[idx - 1] + exp).toLowerCase(), ok, dt);
    }
    c.last = nowMs;
    keySound(ok ? (ch === ' ' ? 'space' : ch === '\n' ? 'enter' : 'ok') : 'err');
    if (!ok && p.hardcore) {
      t.current = { typed: [], start: 0, keys: 0, good: 0, errs: 0, last: 0, series: [], done: false, streak: 0 };
      setTyped([]); setNow(0); setNote('Fehler! Neustart …');
      return;
    }
    if (!ok && s.stopOnError) { setNote(`Erwartet: ${exp === ' ' ? 'Leertaste' : exp === '\n' ? 'Enter' : exp}`); return; }
    setNote('');
    c.typed = [...c.typed, ch];
    setTyped(c.typed);
    if (c.typed.length >= text.length) finish();
  }, [finish, p.hardcore, p.locked, p.recordKeys, s.stopOnError, text]);

  const back = useCallback(() => {
    const c = t.current;
    if (c.done || p.hardcore || !c.typed.length) return;
    c.typed = c.typed.slice(0, -1);
    setTyped(c.typed);
  }, [p.hardcore]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el !== hidden.current && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'Tab') { e.preventDefault(); p.onRestart(); return; }
      if (e.key === 'Escape') return;
      if (result) {
        if (e.key === 'Enter' && !p.hideResult) { e.preventDefault(); (p.onNext ?? p.onRestart)(); }
        return;
      }
      if (e.key === 'Backspace') { e.preventDefault(); back(); return; }
      if ((e.ctrlKey || e.metaKey || e.altKey) && !e.getModifierState('AltGraph')) return;
      if (e.key === 'Enter') { e.preventDefault(); press('\n'); return; }
      if (e.key.length === 1) { e.preventDefault(); press(e.key); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, press, result, p]);

  // Zeitgeber
  useEffect(() => {
    if (result) return;
    const id = setInterval(() => {
      const c = t.current;
      if (!c.start || c.done) return;
      const el = (performance.now() - c.start) / 1000;
      setNow(el);
      const sec = Math.floor(el);
      if (sec > c.series.length && sec > 0) {
        const right = c.typed.reduce((a, ch, i) => a + (ch === text[i] ? 1 : 0), 0);
        c.series.push(Math.round(right / 5 / (el / 60)));
      }
      if (p.timeLimit && el >= p.timeLimit) finish(true);
    }, 100);
    return () => clearInterval(id);
  }, [result, p.timeLimit, finish, text]);

  const idx = typed.length;
  const [caret, setCaret] = useState({ x: 0, y: 0, w: 0, h: 0 });
  useEffect(() => {
    const b = box.current, c = cur.current;
    if (!c) return;
    setCaret({ x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight });
    if (b) b.scrollTo({ top: Math.max(0, c.offsetTop - c.offsetHeight * 0.9), behavior: idx === 0 ? 'auto' : 'smooth' });
  }, [idx, text, s.size, s.font]);
  // aktuelles Wort (für die Hervorhebung)
  let ws = idx, we = idx;
  if (idx < text.length) {
    while (ws > 0 && text[ws - 1] !== ' ' && text[ws - 1] !== '\n') ws--;
    while (we < text.length && text[we] !== ' ' && text[we] !== '\n') we++;
  }
  const lastBad = idx > 0 && typed[idx - 1] !== text[idx - 1];

  const running = t.current.start > 0;
  const onProg = p.onProgress;
  const right = typed.reduce((a, ch, i) => a + (ch === text[i] ? 1 : 0), 0);
  const liveWpm = now > 1 ? Math.round(right / 5 / (now / 60)) : 0;
  const left = p.timeLimit ? Math.max(0, Math.ceil(p.timeLimit - now)) : null;
  useEffect(() => {
    onProg?.({ idx, len: text.length, wpm: liveWpm, elapsed: now, errs: t.current.errs, streak: t.current.streak, running });
  }, [idx, now, liveWpm]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextCh = idx < text.length ? text[idx] : null;
  const pos = nextCh ? locate(layout, nextCh) : null;

  return (
    <div className="tp-run" onClick={() => hidden.current?.focus()}>
      <input
        ref={hidden}
        className="tp-hidden"
        aria-label="Eingabe"
        autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          (e.target as HTMLInputElement).value = '';
          if (!result) for (const ch of v) press(ch);
        }}
      />
      {p.prompt && <div className="tp-prompt">{p.prompt}</div>}
      <div className="tp-hud">
        {left !== null && <b className={'tp-timer' + (left <= 5 && running ? ' low' : '')}>{running ? left : p.timeLimit}s</b>}
        {!p.zen && <span>{liveWpm} WPM</span>}
        <span>{t.current.keys ? Math.round((t.current.good / t.current.keys) * 100) : 100} %</span>
        <span>{t.current.errs} Fehler</span>
        {p.hardcore && <em>Hardcore</em>}
        {p.blind && <em>Blind</em>}
        {p.zen && <em>Zen</em>}
        <button className="tp-link" onClick={p.onRestart} title="Tab">Neu ↻</button>
      </div>
      {p.racers && p.racers.length > 0 && (
        <div className="tp-lanes">
          {[{ name: 'Du', wpm: 0, you: true }, ...p.racers.map((r) => ({ ...r, you: false }))].map((r) => {
            const prog = r.you ? idx : Math.min(text.length, (r.wpm * 5 / 60) * (running ? now : 0));
            return (
              <div key={r.name} className="tp-lane">
                <span>{r.name}{r.you ? '' : ` · ${r.wpm}`}</span>
                <div><i className={r.you ? 'you' : ''} style={{ width: `${(prog / text.length) * 100}%` }} /></div>
              </div>
            );
          })}
        </div>
      )}
      <div className="tp-progress" aria-hidden="true"><i style={{ width: `${(idx / Math.max(1, text.length)) * 100}%` }} /><span>{idx} / {text.length}</span></div>
      <div className={'tp-text cur-' + s.cursor + (p.blind ? ' blind' : '')} ref={box}>
        <div className="tp-inner">
          {text.split('').map((ch, i) => {
            const cls = (i < idx ? (typed[i] === ch ? 'ok' : 'bad') : i === idx ? 'cur' : '') + (i >= ws && i < we && !p.blind ? ' wd' : '');
            return (
              <span key={i} ref={i === idx ? cur : undefined} className={cls}>
                {ch === '\n' ? <>↵<br /></> : ch === ' ' && cls.startsWith('bad') ? '·' : ch}
              </span>
            );
          })}
          {idx < text.length && (
            <i className={'tp-caret' + (lastBad ? ' err' : '') + (running ? ' go' : '')} style={{ transform: `translate(${caret.x}px, ${caret.y}px)`, width: caret.w, height: caret.h }} />
          )}
        </div>
      </div>
      {note && <div className="tp-note">{note}</div>}
      {!running && !result && <div className="tp-hint">Tippe los – die Zeit startet beim ersten Anschlag. <kbd>Tab</kbd> = neu starten.</div>}
      {s.showKb && !result && (
        <div className="tp-kbwrap">
          <Keyboard layout={layout} next={nextCh} />
          {pos && pos.finger >= 0 && <div className="tp-fingerhint">{pos.shift ? 'Shift + ' : ''}{pos.altgr ? 'AltGr + ' : ''}{nextCh === '\n' ? 'Enter' : nextCh}: {FINGER_NAMES[pos.finger]}</div>}
        </div>
      )}
      {result && !p.hideResult && (
        <div className="tp-result" role="dialog" aria-label="Ergebnis">
          {s.confetti && (result.stars > 0 || (!p.goal && result.acc >= 95)) && <Confetti />}
          {p.goal && <div className="tp-stars" aria-label={`${result.stars} von 3 Sternen`}>{[1, 2, 3].map((n) => <span key={n} className={n <= result.stars ? 'on' : ''}>★</span>)}</div>}
          <div className="tp-big">{p.zen ? `${result.acc} %` : `${result.wpm} WPM`}</div>
          {result.fresh && <div className="tp-new">Neue Bestleistung!</div>}
          <div className="tp-grid4">
            <div><b>{result.acc} %</b><small>Genauigkeit</small></div>
            <div><b>{result.raw}</b><small>Rohtempo</small></div>
            <div><b>{result.errs}</b><small>Fehler</small></div>
            <div><b>{Math.round(result.secs)} s</b><small>Zeit</small></div>
          </div>
          {result.place && <div className="tp-new">Platz {result.place} von {(p.racers?.length ?? 0) + 1}</div>}
          <Series data={result.series} />
          {p.goal && <div className="tp-hint">Ziel: {p.goal.wpm} WPM bei {p.goal.acc} % Genauigkeit.{result.stars === 0 ? ' Noch nicht geschafft – versuch es nochmal!' : ''}</div>}
          {result.badges.length > 0 && (
            <div className="tp-badges-new">
              {result.badges.map((id) => <span key={id}>🏅 {BADGES.find((b) => b.id === id)?.name}</span>)}
            </div>
          )}
          {p.extra}
          <div className="tp-btns">
            <button className="tp-btn" onClick={p.onRestart}>Nochmal</button>
            {p.onNext && <button className="tp-btn main" onClick={p.onNext} autoFocus>{p.nextLabel ?? 'Weiter'} ↵</button>}
          </div>
        </div>
      )}
    </div>
  );
}
