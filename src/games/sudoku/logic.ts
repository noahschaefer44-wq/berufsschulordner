// Sudoku: logische Lösungstechniken (für Bewertung, Hinweise und die Technik-Schule).
import { type Spec, bitCount, cageCombos, cellName, digitsOf, lowBit } from './engine';

export type Tech = 'nackt1' | 'versteckt1' | 'kaefig' | 'gesperrt' | 'nacktPaar' | 'verstecktPaar' | 'nacktDrilling' | 'verstecktDrilling' | 'xwing' | 'swordfish' | 'xywing';

export const TECH_INFO: Record<Tech, { name: string; w: number; short: string }> = {
  nackt1: { name: 'Nackter Einzelner', w: 1, short: 'Eine Zelle hat nur noch einen Kandidaten.' },
  versteckt1: { name: 'Versteckter Einzelner', w: 2, short: 'Eine Zahl passt in ihrer Reihe, Spalte oder ihrem Block nur an eine Stelle.' },
  kaefig: { name: 'Käfig-Kombinationen', w: 3, short: 'Die Summe eines Käfigs erlaubt nur bestimmte Zahlen.' },
  gesperrt: { name: 'Gesperrte Kandidaten', w: 4, short: 'Eine Zahl liegt in einem Block nur in einer Linie – sie fällt im Rest der Linie weg.' },
  nacktPaar: { name: 'Nacktes Paar', w: 5, short: 'Zwei Zellen teilen sich dieselben zwei Kandidaten.' },
  verstecktPaar: { name: 'Verstecktes Paar', w: 6, short: 'Zwei Zahlen passen nur in dieselben zwei Zellen.' },
  nacktDrilling: { name: 'Nacktes Drilling', w: 7, short: 'Drei Zellen teilen sich dieselben drei Kandidaten.' },
  verstecktDrilling: { name: 'Verstecktes Drilling', w: 8, short: 'Drei Zahlen passen nur in dieselben drei Zellen.' },
  xwing: { name: 'X-Wing', w: 9, short: 'Eine Zahl bildet ein Rechteck aus zwei Linien und zwei Gegenlinien.' },
  swordfish: { name: 'Schwertfisch', w: 10, short: 'Die Drei-Linien-Variante des X-Wing.' },
  xywing: { name: 'XY-Wing', w: 10, short: 'Drei Zellen mit je zwei Kandidaten bilden eine Kette, die eine Zahl ausschließt.' },
};

export interface Step {
  tech: Tech;
  place?: { cell: number; d: number };
  elim: { cell: number; d: number }[];
  /** auslösende Zellen */
  cells: number[];
  group?: number;
  digits: number[];
  text: string;
}

export interface LState { val: Int8Array; cand: Uint16Array }

export function initState(spec: Spec, grid: ArrayLike<number>): LState {
  const N = spec.n * spec.n;
  const full = (1 << spec.n) - 1;
  const val = new Int8Array(N);
  const cand = new Uint16Array(N).fill(full);
  for (let i = 0; i < N; i++) if (grid[i]) {
    val[i] = grid[i]; cand[i] = 0;
  }
  for (let i = 0; i < N; i++) if (val[i]) for (const p of spec.peers[i]) cand[p] &= ~(1 << (val[i] - 1));
  return { val, cand };
}

export function cloneState(s: LState): LState { return { val: s.val.slice(), cand: s.cand.slice() }; }

export function applyStep(spec: Spec, s: LState, st: Step) {
  if (st.place) {
    const { cell, d } = st.place;
    s.val[cell] = d; s.cand[cell] = 0;
    for (const p of spec.peers[cell]) s.cand[p] &= ~(1 << (d - 1));
  }
  for (const e of st.elim) s.cand[e.cell] &= ~(1 << (e.d - 1));
}

export function groupName(spec: Spec, gi: number): string {
  const kind = spec.kinds[gi];
  const same = spec.kinds.slice(0, gi).filter((k) => k === kind).length + 1;
  switch (kind) {
    case 'row': return `Zeile ${same}`;
    case 'col': return `Spalte ${same}`;
    case 'box': return `Block ${same}`;
    case 'diag1': return 'die Hauptdiagonale';
    case 'diag2': return 'die Nebendiagonale';
    default: return `Hyper-Block ${same}`;
  }
}
const cells = (spec: Spec, list: number[]) => list.map((c) => cellName(spec.n, c)).join(', ');

type Finder = (spec: Spec, s: LState) => Step | null;

const nackt1: Finder = (spec, s) => {
  for (let i = 0; i < s.val.length; i++) if (!s.val[i] && bitCount(s.cand[i]) === 1) {
    const d = lowBit(s.cand[i]);
    return { tech: 'nackt1', place: { cell: i, d }, elim: [], cells: [i], digits: [d], text: `${cellName(spec.n, i)} kann nur noch die ${d} enthalten: Alle anderen Zahlen stehen schon bei einem Nachbarn dieser Zelle.` };
  }
  return null;
};

const versteckt1: Finder = (spec, s) => {
  for (let gi = 0; gi < spec.groups.length; gi++) {
    const g = spec.groups[gi];
    for (let d = 1; d <= spec.n; d++) {
      const bit = 1 << (d - 1);
      let at = -1, cnt = 0, placed = false;
      for (const c of g) { if (s.val[c] === d) placed = true; else if (!s.val[c] && (s.cand[c] & bit)) { cnt++; at = c; } }
      if (!placed && cnt === 1) return { tech: 'versteckt1', place: { cell: at, d }, elim: [], cells: [at], group: gi, digits: [d], text: `In ${groupName(spec, gi)} passt die ${d} nur noch in ${cellName(spec.n, at)} – alle anderen Zellen dort schließen sie aus.` };
    }
  }
  return null;
};

const kaefig: Finder = (spec, s) => {
  for (const cg of spec.cages) {
    let sum = 0, free = 0, union = 0, used = 0;
    for (const c of cg.cells) { if (s.val[c]) { sum += s.val[c]; used |= 1 << (s.val[c] - 1); } else { free++; union |= s.cand[c]; } }
    if (!free) continue;
    const combos = cageCombos(free, cg.sum - sum, union & ~used);
    if (!combos.length) continue;
    let possible = 0;
    for (const m of combos) possible |= m;
    const elim: { cell: number; d: number }[] = [];
    for (const c of cg.cells) if (!s.val[c]) for (const d of digitsOf(s.cand[c] & ~possible)) elim.push({ cell: c, d });
    if (elim.length) {
      const ds = digitsOf(possible);
      return { tech: 'kaefig', elim, cells: cg.cells, digits: ds, text: `Der Käfig mit Summe ${cg.sum - sum} und ${free} freien Zellen kann nur aus den Zahlen ${ds.join(', ')} gebildet werden – alle anderen Kandidaten in diesen Zellen entfallen.` };
    }
  }
  return null;
};

const gesperrt: Finder = (spec, s) => {
  for (let a = 0; a < spec.groups.length; a++) {
    for (let d = 1; d <= spec.n; d++) {
      const bit = 1 << (d - 1);
      const P = spec.groups[a].filter((c) => !s.val[c] && (s.cand[c] & bit));
      if (P.length < 2) continue;
      if (spec.groups[a].some((c) => s.val[c] === d)) continue;
      for (let b = 0; b < spec.groups.length; b++) {
        if (b === a) continue;
        const gb = new Set(spec.groups[b]);
        if (!P.every((c) => gb.has(c))) continue;
        const inA = new Set(spec.groups[a]);
        const elim = spec.groups[b].filter((c) => !inA.has(c) && !s.val[c] && (s.cand[c] & bit)).map((c) => ({ cell: c, d }));
        if (elim.length) return { tech: 'gesperrt', elim, cells: P, group: a, digits: [d], text: `In ${groupName(spec, a)} kann die ${d} nur in ${cells(spec, P)} stehen – und diese Zellen liegen alle auch in ${groupName(spec, b)}. Darum fällt die ${d} im Rest von ${groupName(spec, b)} weg.` };
      }
    }
  }
  return null;
};

function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (i: number, cur: T[]) => {
    if (cur.length === k) { out.push([...cur]); return; }
    for (let j = i; j < arr.length; j++) { cur.push(arr[j]); rec(j + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

const nackt = (k: 2 | 3): Finder => (spec, s) => {
  for (let gi = 0; gi < spec.groups.length; gi++) {
    const free = spec.groups[gi].filter((c) => !s.val[c] && bitCount(s.cand[c]) >= 2 && bitCount(s.cand[c]) <= k);
    if (free.length < k) continue;
    for (const set of combos(free, k)) {
      let u = 0;
      for (const c of set) u |= s.cand[c];
      if (bitCount(u) !== k) continue;
      const elim: { cell: number; d: number }[] = [];
      for (const c of spec.groups[gi]) if (!s.val[c] && !set.includes(c)) for (const d of digitsOf(s.cand[c] & u)) elim.push({ cell: c, d });
      if (elim.length) return { tech: k === 2 ? 'nacktPaar' : 'nacktDrilling', elim, cells: set, group: gi, digits: digitsOf(u), text: `In ${groupName(spec, gi)} teilen sich ${cells(spec, set)} nur die Zahlen ${digitsOf(u).join(', ')}. Diese Zahlen gehören also in genau diese Zellen und fallen in den anderen Zellen von ${groupName(spec, gi)} weg.` };
    }
  }
  return null;
};

const versteckt = (k: 2 | 3): Finder => (spec, s) => {
  for (let gi = 0; gi < spec.groups.length; gi++) {
    const g = spec.groups[gi];
    const present = new Set<number>();
    for (const c of g) if (s.val[c]) present.add(s.val[c]);
    const where = new Map<number, number[]>();
    for (let d = 1; d <= spec.n; d++) {
      if (present.has(d)) continue;
      const cs = g.filter((c) => !s.val[c] && (s.cand[c] & (1 << (d - 1))));
      if (cs.length >= 2 && cs.length <= k) where.set(d, cs);
    }
    const ds = [...where.keys()];
    if (ds.length < k) continue;
    for (const dset of combos(ds, k)) {
      const cs = [...new Set(dset.flatMap((d) => where.get(d)!))];
      if (cs.length !== k) continue;
      let keep = 0;
      for (const d of dset) keep |= 1 << (d - 1);
      const elim: { cell: number; d: number }[] = [];
      for (const c of cs) for (const d of digitsOf(s.cand[c] & ~keep)) elim.push({ cell: c, d });
      if (elim.length) return { tech: k === 2 ? 'verstecktPaar' : 'verstecktDrilling', elim, cells: cs, group: gi, digits: dset, text: `In ${groupName(spec, gi)} passen die Zahlen ${dset.join(', ')} nur in ${cells(spec, cs)}. Also müssen sie dort stehen – alle anderen Kandidaten dieser Zellen entfallen.` };
    }
  }
  return null;
};

const fish = (k: 2 | 3): Finder => (spec, s) => {
  for (let d = 1; d <= spec.n; d++) {
    const bit = 1 << (d - 1);
    for (const rows of [true, false]) {
      const lines = rows ? spec.rowG : spec.colG;
      const info = lines.map((gi) => spec.groups[gi].filter((c) => !s.val[c] && (s.cand[c] & bit)));
      const idx = (c: number) => (rows ? c % spec.n : Math.floor(c / spec.n));
      const base = info.map((cs, i) => ({ i, cs })).filter((x) => x.cs.length >= 2 && x.cs.length <= k);
      if (base.length < k) continue;
      for (const set of combos(base, k)) {
        const cover = new Set<number>();
        for (const b of set) for (const c of b.cs) cover.add(idx(c));
        if (cover.size !== k) continue;
        const baseLines = new Set(set.map((b) => b.i));
        const elim: { cell: number; d: number }[] = [];
        for (let li = 0; li < lines.length; li++) {
          if (baseLines.has(li)) continue;
          for (const c of info[li]) if (cover.has(idx(c))) elim.push({ cell: c, d });
        }
        if (elim.length) {
          const cs = set.flatMap((b) => b.cs);
          const nm = rows ? 'Zeilen' : 'Spalten', om = rows ? 'Spalten' : 'Zeilen';
          return { tech: k === 2 ? 'xwing' : 'swordfish', elim, cells: cs, digits: [d], text: `Die ${d} liegt in den ${nm} ${set.map((b) => b.i + 1).join(', ')} nur in den ${om} ${[...cover].map((x) => x + 1).sort().join(', ')}. In diesen ${om} muss die ${d} also in einer dieser ${nm} stehen – in allen anderen ${nm} entfällt sie dort.` };
        }
      }
    }
  }
  return null;
};

const xywing: Finder = (spec, s) => {
  const bi = (c: number) => !s.val[c] && bitCount(s.cand[c]) === 2;
  for (let p = 0; p < s.val.length; p++) {
    if (!bi(p)) continue;
    const [a, b] = digitsOf(s.cand[p]);
    const w = spec.peers[p].filter(bi);
    for (const w1 of w) {
      if (!(s.cand[w1] & (1 << (a - 1))) || (s.cand[w1] & (1 << (b - 1)))) continue;
      const cdig = digitsOf(s.cand[w1] & ~(1 << (a - 1)))[0];
      for (const w2 of w) {
        if (w2 === w1) continue;
        if (s.cand[w2] !== ((1 << (b - 1)) | (1 << (cdig - 1)))) continue;
        const bit = 1 << (cdig - 1);
        const p2 = new Set(spec.peers[w2]);
        const elim = spec.peers[w1].filter((c) => c !== p && c !== w2 && p2.has(c) && !s.val[c] && (s.cand[c] & bit)).map((c) => ({ cell: c, d: cdig }));
        if (elim.length) return { tech: 'xywing', elim, cells: [p, w1, w2], digits: [cdig], text: `XY-Wing: ${cellName(spec.n, p)} (${a}/${b}) sieht ${cellName(spec.n, w1)} (${a}/${cdig}) und ${cellName(spec.n, w2)} (${b}/${cdig}). Egal wie ${cellName(spec.n, p)} ausgeht – eine der beiden Flügelzellen wird zur ${cdig}. Zellen, die beide Flügel sehen, können keine ${cdig} sein.` };
      }
    }
  }
  return null;
};

export const FINDERS: [Tech, Finder][] = [
  ['nackt1', nackt1], ['versteckt1', versteckt1], ['kaefig', kaefig], ['gesperrt', gesperrt],
  ['nacktPaar', nackt(2)], ['verstecktPaar', versteckt(2)], ['nacktDrilling', nackt(3)], ['verstecktDrilling', versteckt(3)],
  ['xwing', fish(2)], ['swordfish', fish(3)], ['xywing', xywing],
];

/** Nächster logischer Schritt (leichteste Technik zuerst). `only`: nur diese Technik suchen. */
export function nextStep(spec: Spec, s: LState, only?: Tech): Step | null {
  for (const [t, f] of FINDERS) {
    if (only && t !== only) continue;
    const r = f(spec, s);
    if (r) return r;
  }
  return null;
}

/** Ist der Stand widerspruchsfrei (jede leere Zelle hat Kandidaten)? */
export const consistent = (s: LState) => s.val.every((v, i) => v !== 0 || s.cand[i] !== 0);

export interface Rating { weight: number; counts: Partial<Record<Tech, number>>; solved: boolean; steps: number }

/** Bewertet ein Rätsel durch schrittweises logisches Lösen. weight 11 = Raten nötig. */
export function rate(spec: Spec, grid: ArrayLike<number>): Rating {
  const s = initState(spec, grid);
  const counts: Partial<Record<Tech, number>> = {};
  let weight = 0, steps = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (s.val.every((v) => v !== 0)) return { weight: Math.max(weight, 1), counts, solved: true, steps };
    const st = nextStep(spec, s);
    if (!st) break;
    counts[st.tech] = (counts[st.tech] ?? 0) + 1;
    weight = Math.max(weight, TECH_INFO[st.tech].w);
    applyStep(spec, s, st);
    steps++;
    if (!consistent(s)) break;
  }
  return { weight: s.val.every((v) => v !== 0) ? Math.max(weight, 1) : 11, counts, solved: s.val.every((v) => v !== 0), steps };
}

export type Level = 'leicht' | 'mittel' | 'schwer' | 'experte' | 'teufel';
export const LEVELS: { id: Level; name: string }[] = [
  { id: 'leicht', name: 'Leicht' }, { id: 'mittel', name: 'Mittel' }, { id: 'schwer', name: 'Schwer' }, { id: 'experte', name: 'Experte' }, { id: 'teufel', name: 'Teufel' },
];
export const levelOfWeight = (w: number, killer = false): Level => (killer
  ? (w <= 3 ? 'leicht' : w <= 6 ? 'mittel' : w <= 8 ? 'schwer' : w <= 10 ? 'experte' : 'teufel')
  : (w <= 2 ? 'leicht' : w <= 5 ? 'mittel' : w <= 8 ? 'schwer' : w <= 10 ? 'experte' : 'teufel'));
export const levelIndex = (l: Level) => LEVELS.findIndex((x) => x.id === l);
