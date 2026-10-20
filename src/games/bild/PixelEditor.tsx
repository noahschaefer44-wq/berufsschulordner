import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../shared/store';
import { newId } from '../shared/ids';
import type { BTheme, Custom } from './data';
import { cluesOf, countSolutions, decodeNono, encodeNono, solveLogic } from './engine';
import { PALETTES } from './NonoCanvas';

interface Props {
  init: { w: number; h: number; bits: Uint8Array; name: string; id?: string };
  theme: BTheme;
  onPlay: (w: number, h: number, bits: Uint8Array, name: string) => void;
  onSave: (c: Custom) => void;
  onPhoto: () => void;
}

type Report = { kind: 'ok' | 'guess' | 'multi' | 'empty'; text: string; passes?: number };

/** Zeichenfläche für eigene Bilder – mit Prüfung (eindeutig? rein logisch lösbar?), Reparatur und Foto-Import. */
export default function PixelEditor({ init, theme, onPlay, onSave, onPhoto }: Props) {
  const [w, setW] = useState(init.w), [h, setH] = useState(init.h);
  const [bits, setBits] = useState<Uint8Array>(init.bits);
  const [name, setName] = useState(init.name);
  const [id] = useState(init.id ?? newId());
  const [report, setReport] = useState<Report | null>(null);
  const [code, setCode] = useState('');
  const [photo, setPhoto] = useState<{ img: HTMLImageElement; thr: number; inv: boolean; side: number } | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const painting = useRef<number | null>(null);
  const cell = Math.max(12, Math.min(34, Math.floor(560 / Math.max(w, h))));
  const P = PALETTES[theme];

  const resize = (nw: number, nh: number) => {
    const nb = new Uint8Array(nw * nh);
    for (let y = 0; y < Math.min(h, nh); y++) for (let x = 0; x < Math.min(w, nw); x++) nb[y * nw + x] = bits[y * w + x];
    setW(nw); setH(nh); setBits(nb); setReport(null);
  };

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = w * cell + 2, H = h * cell + 2;
    c.width = Math.ceil(W * dpr); c.height = Math.ceil(H * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.grid; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < w * h; i++) if (bits[i]) { ctx.fillStyle = P.fill; ctx.fillRect((i % w) * cell + 1, Math.floor(i / w) * cell + 1, cell - 1, cell - 1); }
    for (let i = 0; i <= w; i++) { ctx.strokeStyle = i % 5 === 0 ? P.thick : P.thin; ctx.lineWidth = i % 5 === 0 ? 2 : 1; ctx.beginPath(); ctx.moveTo(i * cell + 0.5, 0); ctx.lineTo(i * cell + 0.5, h * cell); ctx.stroke(); }
    for (let i = 0; i <= h; i++) { ctx.strokeStyle = i % 5 === 0 ? P.thick : P.thin; ctx.lineWidth = i % 5 === 0 ? 2 : 1; ctx.beginPath(); ctx.moveTo(0, i * cell + 0.5); ctx.lineTo(w * cell, i * cell + 0.5); ctx.stroke(); }
  }, [bits, w, h, cell, P]);

  const idx = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) * (w * cell + 2)) / r.width / cell), y = Math.floor(((e.clientY - r.top) * (h * cell + 2)) / r.height / cell);
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  };
  const lastCell = useRef(-1);
  const paint = (i: number) => {
    if (i < 0 || painting.current === null) return;
    // Zellen zwischen dem letzten und dem aktuellen Punkt mitnehmen (schnelle Bewegungen)
    const cells: number[] = [];
    if (lastCell.current >= 0 && lastCell.current !== i) {
      const x0 = lastCell.current % w, y0 = Math.floor(lastCell.current / w), x1 = i % w, y1 = Math.floor(i / w);
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 1; k <= steps; k++) cells.push(Math.round(y0 + ((y1 - y0) * k) / steps) * w + Math.round(x0 + ((x1 - x0) * k) / steps));
    } else cells.push(i);
    lastCell.current = i;
    const nb = bits.slice();
    let changed = false;
    for (const c of cells) if (nb[c] !== painting.current) { nb[c] = painting.current; changed = true; }
    if (changed) { setBits(nb); setReport(null); }
  };

  const check = () => {
    const filled = bits.reduce((a, b) => a + b, 0);
    if (filled === 0 || filled === bits.length) { setReport({ kind: 'empty', text: 'Das Bild ist leer oder komplett gefüllt – zeichne etwas Dazwischenliegendes.' }); return null; }
    const nono = cluesOf(w, h, bits);
    const r = solveLogic(nono);
    if (r.status === 'solved') { const rep: Report = { kind: 'ok', passes: r.passes, text: `Eindeutig und rein logisch lösbar (${r.passes} Durchgänge). Du kannst es spielen oder speichern.` }; setReport(rep); return rep; }
    const n = countSolutions(nono, 2);
    if (n === 1) { const rep: Report = { kind: 'guess', text: 'Eindeutig lösbar, aber nicht allein mit Zeilenlogik – man muss an einer Stelle ausprobieren. „Reparieren“ versucht, ein Feld so zu ändern, dass es rein logisch geht.' }; setReport(rep); return rep; }
    const rep: Report = { kind: 'multi', text: 'Das Rätsel hat mehrere Lösungen. „Reparieren“ ändert wenn möglich ein oder zwei Felder.' }; setReport(rep); return rep;
  };
  const repair = () => {
    const base = bits.slice();
    const tryBits = (b: Uint8Array) => solveLogic(cluesOf(w, h, b)).status === 'solved';
    if (tryBits(base)) { toast('Schon rein logisch lösbar'); check(); return; }
    for (let a = 0; a < base.length; a++) { base[a] ^= 1; if (tryBits(base)) { setBits(base); setReport({ kind: 'ok', text: 'Repariert: ein Feld wurde geändert. Jetzt ist es eindeutig und rein logisch lösbar.' }); return; } base[a] ^= 1; }
    if (base.length <= 150) for (let a = 0; a < base.length; a++) for (let b = a + 1; b < base.length; b++) { base[a] ^= 1; base[b] ^= 1; if (tryBits(base)) { setBits(base); setReport({ kind: 'ok', text: 'Repariert: zwei Felder wurden geändert.' }); return; } base[b] ^= 1; base[a] ^= 1; }
    toast('Keine einfache Reparatur gefunden – ändere das Bild ein wenig.');
  };

  const flipH = () => { const nb = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) nb[y * w + x] = bits[y * w + (w - 1 - x)]; setBits(nb); setReport(null); };
  const flipV = () => { const nb = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) nb[y * w + x] = bits[(h - 1 - y) * w + x]; setBits(nb); setReport(null); };
  const invert = () => { setBits(bits.map((b) => 1 - b) as Uint8Array); setReport(null); };
  const shift = (dx: number, dy: number) => { const nb = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) nb[y * w + x] = bits[((y - dy + h) % h) * w + ((x - dx + w) % w)]; setBits(nb); setReport(null); };
  const mirrorSym = () => { const nb = bits.slice(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bits[y * w + x]) nb[y * w + (w - 1 - x)] = 1; setBits(nb); setReport(null); };

  // Foto → Bild
  const loadPhoto = (f?: File) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { setPhoto({ img, thr: 128, inv: false, side: 20 }); };
    img.onerror = () => toast('Bild konnte nicht gelesen werden');
    img.src = url;
  };
  const photoBits = useMemo(() => {
    if (!photo) return null;
    const { img, thr, inv, side } = photo;
    const ar = img.width / img.height;
    const pw = ar >= 1 ? side : Math.max(5, Math.round(side * ar));
    const ph = ar >= 1 ? Math.max(5, Math.round(side / ar)) : side;
    const c = document.createElement('canvas'); c.width = pw; c.height = ph;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pw, ph);
    ctx.drawImage(img, 0, 0, pw, ph);
    const d = ctx.getImageData(0, 0, pw, ph).data;
    const b = new Uint8Array(pw * ph);
    for (let i = 0; i < pw * ph; i++) { const lum = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; b[i] = (lum < thr) !== inv ? 1 : 0; }
    return { w: pw, h: ph, bits: b };
  }, [photo]);
  const pv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = pv.current;
    if (!c || !photoBits) return;
    const k = Math.max(4, Math.floor(260 / Math.max(photoBits.w, photoBits.h)));
    c.width = photoBits.w * k; c.height = photoBits.h * k;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#111';
    for (let i = 0; i < photoBits.bits.length; i++) if (photoBits.bits[i]) ctx.fillRect((i % photoBits.w) * k, Math.floor(i / photoBits.w) * k, k, k);
  }, [photoBits]);

  return (
    <main className="bd-editor">
      <section className="bd-stage">
        <div className="bd-bar"><input className="bd-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" maxLength={30} /><span>{w}×{h}</span></div>
        <canvas
          ref={cv} className="bd-canvas" style={{ width: w * cell + 2, height: h * cell + 2, touchAction: 'none' }}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); const i = idx(e); if (i < 0) return; lastCell.current = -1; painting.current = e.button === 2 ? 0 : bits[i] ? 0 : 1; paint(i); }}
          onPointerMove={(e) => paint(idx(e))}
          onPointerUp={() => { painting.current = null; lastCell.current = -1; }}
          onPointerCancel={() => { painting.current = null; }}
        />
        {report && <div className={'bd-hint' + (report.kind === 'ok' ? ' ok' : '')} role="status">{report.text}</div>}
      </section>
      <aside className="bd-side">
        <div className="bd-opts">
          <h3>Größe</h3>
          <label><span>Breite {w}</span><input type="range" min={5} max={30} value={w} onChange={(e) => resize(+e.target.value, h)} /></label>
          <label><span>Höhe {h}</span><input type="range" min={5} max={30} value={h} onChange={(e) => resize(w, +e.target.value)} /></label>
        </div>
        <div className="bd-tools">
          <button onClick={() => { setBits(new Uint8Array(w * h)); setReport(null); }}>Leeren</button>
          <button onClick={invert}>Umkehren</button>
          <button onClick={flipH}>↔ Spiegeln</button>
          <button onClick={flipV}>↕ Spiegeln</button>
          <button onClick={mirrorSym}>Symmetrisch machen</button>
          <button onClick={() => shift(-1, 0)}>←</button><button onClick={() => shift(1, 0)}>→</button><button onClick={() => shift(0, -1)}>↑</button><button onClick={() => shift(0, 1)}>↓</button>
        </div>
        <div className="bd-tools">
          <button onClick={check}>Prüfen</button>
          <button onClick={repair}>Reparieren</button>
          <button className="bd-primary" onClick={() => { const r = report ?? check(); if (r && r.kind === 'empty') return; onPlay(w, h, bits, `Eigenes: ${name}`); }}>Lösen</button>
          <button onClick={() => { const r = check(); if (r?.kind === 'empty') return; onSave({ id, name: name || 'Ohne Namen', code: encodeNono(w, h, bits) }); toast('Gespeichert'); }}>Speichern</button>
        </div>
        <div className="bd-opts">
          <h3>Teilen</h3>
          <div className="bd-tools">
            <button onClick={() => { void navigator.clipboard?.writeText(encodeNono(w, h, bits)); toast('Code kopiert'); }}>Code kopieren</button>
          </div>
          <textarea rows={2} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code einfügen …" spellCheck={false} />
          <div className="bd-tools"><button onClick={() => { const d = decodeNono(code); if (!d) { toast('Code nicht lesbar'); return; } setW(d.w); setH(d.h); setBits(d.bits); setReport(null); }}>Laden</button></div>
        </div>
        <div className="bd-opts">
          <h3>Foto → Rätsel</h3>
          <label className="bd-file">Foto wählen<input type="file" accept="image/*" onChange={(e) => loadPhoto(e.target.files?.[0])} /></label>
          {photo && photoBits && (
            <>
              <canvas ref={pv} className="bd-prev" />
              <label><span>Schwelle {photo.thr}</span><input type="range" min={20} max={235} value={photo.thr} onChange={(e) => setPhoto({ ...photo, thr: +e.target.value })} /></label>
              <label><span>Größe (lange Seite) {photo.side}</span><input type="range" min={8} max={30} value={photo.side} onChange={(e) => setPhoto({ ...photo, side: +e.target.value })} /></label>
              <label><span>Umkehren</span><input type="checkbox" checked={photo.inv} onChange={(e) => setPhoto({ ...photo, inv: e.target.checked })} /></label>
              <div className="bd-tools"><button className="bd-primary" onClick={() => { setW(photoBits.w); setH(photoBits.h); setBits(photoBits.bits); setReport(null); setPhoto(null); onPhoto(); toast('Foto übernommen – jetzt prüfen und reparieren'); }}>Übernehmen</button></div>
              <p className="bd-note">Das Foto verlässt dein Gerät nicht.</p>
            </>
          )}
        </div>
      </aside>
    </main>
  );
}
