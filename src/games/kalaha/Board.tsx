import { sideOfIdx, type Side } from './engine';

const W = 1000, H = 440, GAP = 118, YT = 128, YB = 312, YS = 220;
const SEEDS = ['#2fb5a6', '#e8604c', '#f2b84b', '#5a6bdf', '#efe8d4', '#9a4bb0'];

export interface BoardProps {
  n: number;
  b: number[];
  turn: Side;
  /** absolute Indizes der anklickbaren Mulden */
  playable: number[];
  onPit: (idx: number) => void;
  hand?: { idx: number; n: number } | null;
  flash?: { idx: number; k: number } | null;
  preview?: { land: number; extra: boolean; cap: number } | null;
  onHover?: (idx: number | null) => void;
  hint?: number | null;
  capture?: number[];
  names: [string, string];
}

/** Mittelpunkt einer Mulde oder eines Speichers. */
export function pitXY(n: number, k: number): [number, number] {
  const s = sideOfIdx(n, k);
  if (k === n) return [W - 80, YS];
  if (k === 2 * n + 1) return [80, YS];
  const col = s === 0 ? k : n - 1 - (k - n - 1);
  const x = W / 2 + (col - (n - 1) / 2) * GAP;
  return [x, s === 0 ? YB : YT];
}

const seedPos = (j: number, r: number): [number, number] => {
  const a = j * 2.39996, d = Math.min(r, 6.2 * Math.sqrt(j + 0.6));
  return [Math.cos(a) * d, Math.sin(a) * d];
};

export default function Board({ n, b, turn, playable, onPit, hand, flash, preview, onHover, hint, capture, names }: BoardProps) {
  const pit = new Set(playable);
  const els: React.ReactNode[] = [];
  for (let k = 0; k <= 2 * n + 1; k++) {
    const [x, y] = pitXY(n, k);
    const store = k === n || k === 2 * n + 1;
    const cnt = b[k];
    const s = sideOfIdx(n, k);
    const num = store ? 0 : s === 0 ? k + 1 : k - n;
    const dots: React.ReactNode[] = [];
    if (store) {
      for (let j = 0; j < Math.min(cnt, 54); j++) {
        const col = j % 5, row = Math.floor(j / 5);
        dots.push(<circle key={j} className="seed" r="7.4" cx={(col - 2) * 13 + ((row % 2) * 4 - 2)} cy={96 - row * 14.5} fill={SEEDS[(j * 3 + k) % SEEDS.length]} />);
      }
    } else {
      for (let j = 0; j < Math.min(cnt, 34); j++) {
        const [dx, dy] = seedPos(j, 36);
        dots.push(<circle key={j} className="seed" r="8" cx={dx} cy={dy} fill={SEEDS[(j * 3 + k) % SEEDS.length]} />);
      }
    }
    const isFlash = flash && flash.idx === k;
    els.push(
      <g key={k} className={`kl-pit${store ? ' store' : ''}${pit.has(k) ? ' play' : ''}${hint === k ? ' hint' : ''}${capture?.includes(k) ? ' cap' : ''}`} transform={`translate(${x} ${y})`}>
        {store
          ? <rect className="hole" x="-50" y="-128" width="100" height="256" rx="50" />
          : <circle className="hole" r="52" />}
        {store ? <rect className="rim" x="-50" y="-128" width="100" height="256" rx="50" /> : <circle className="rim" r="52" />}
        <g className={isFlash ? 'pulse' : ''} key={isFlash ? flash!.k : 0}>{dots}</g>
        {!store && <text className="num" y={s === 0 ? 82 : -66} textAnchor="middle">{num}</text>}
        {!store && <g className="badge" transform={`translate(40 ${s === 0 ? 40 : -40})`}><circle r="15" /><text y="5" textAnchor="middle">{cnt}</text></g>}
        {store && <text className="storecnt" y="-96" textAnchor="middle">{cnt}</text>}
        {pit.has(k) && <circle className="ring" r="58" />}
        {hint === k && <circle className="hintring" r="62" />}
      </g>,
    );
  }
  const labelTop = names[1], labelBot = names[0];
  return (
    <svg className="kl-board" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Spielbrett">
      <defs>
        <linearGradient id="kl-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--wood1)" /><stop offset="1" stopColor="var(--wood2)" /></linearGradient>
        <radialGradient id="kl-hole" cx="50%" cy="38%" r="70%"><stop offset="0" stopColor="var(--hole1)" /><stop offset="1" stopColor="var(--hole2)" /></radialGradient>
        <pattern id="kl-grain" width="160" height="14" patternUnits="userSpaceOnUse"><path d="M0 4C40 1 80 7 160 3M0 10C50 13 100 8 160 11" stroke="rgba(60,30,5,.16)" strokeWidth="1.2" fill="none" /></pattern>
      </defs>
      <rect className="kl-wood" x="6" y="6" width={W - 12} height={H - 12} rx="46" fill="url(#kl-wood)" />
      <rect x="6" y="6" width={W - 12} height={H - 12} rx="46" fill="url(#kl-grain)" />
      <rect className="kl-inlay" x="24" y="24" width={W - 48} height={H - 48} rx="34" />
      <text className={'kl-name top' + (turn === 1 ? ' on' : '')} x={W / 2} y="38" textAnchor="middle">{labelTop}</text>
      <text className={'kl-name bot' + (turn === 0 ? ' on' : '')} x={W / 2} y={H - 22} textAnchor="middle">{labelBot}</text>
      {els}
      {preview && (() => { const [x, y] = pitXY(n, preview.land); const st = preview.land === n || preview.land === 2 * n + 1; return <g className="kl-prev" transform={`translate(${x} ${y})`}>{st ? <rect x="-56" y="-132" width="112" height="264" rx="56" /> : <circle r="60" />}<text y={st ? 150 : (y > 200 ? 100 : -92)} textAnchor="middle">{preview.extra ? 'Extrazug' : preview.cap > 0 ? `Fang +${preview.cap}` : ''}</text></g>; })()}
      {hand && (() => { const [x, y] = pitXY(n, hand.idx); return <g className="kl-hand" style={{ transform: `translate(${x}px, ${y - 20}px)` }}><circle r="24" /><text y="7" textAnchor="middle">{hand.n}</text><path d="M-14 -26 q14 -16 28 0" /></g>; })()}
      {Array.from({ length: 2 * n + 2 }, (_, k) => {
        if (!pit.has(k)) return null;
        const [x, y] = pitXY(n, k);
        return <circle key={'c' + k} className="kl-hit" cx={x} cy={y} r="58" onClick={() => onPit(k)} onPointerEnter={() => onHover?.(k)} onPointerLeave={() => onHover?.(null)} />;
      })}
    </svg>
  );
}

