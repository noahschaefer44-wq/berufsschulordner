import { useEffect, useMemo, useState } from 'react';
import type { Mv } from './engine';
import { type Turn, autoFrom, nextMoves, pickMove, sourcesOf, step, targetsFrom } from './turn';

/** Bedienung eines Zugs mit Klicks: Stein wählen → Ziel wählen; Doppelklick bewegt mit dem größten Würfel. */
export function useTurnControl(turn: Turn | null, setTurn: (t: Turn) => void, enabled: boolean, onMove?: (m: Mv) => void) {
  const [sel, setSel] = useState<number | null>(null);
  const n = turn?.played.length ?? -1;
  useEffect(() => { setSel(null); }, [n, turn?.start]);

  const sources = useMemo(() => (turn && enabled ? sourcesOf(turn) : []), [turn, enabled]);
  // Steht nur eine Quelle zur Wahl (z. B. Bar), gilt sie als gewählt
  const effSel = sel ?? (sources.length === 1 && sources[0] === 25 ? 25 : null);
  const targets = useMemo(() => (turn && enabled && effSel !== null ? targetsFrom(turn, effSel) : []), [turn, enabled, effSel]);

  const doMove = (m: Mv | null) => { if (m && turn) { setTurn(step(turn, m)); onMove?.(m); setSel(null); } };

  const onPoint = (q: number) => {
    if (!turn || !enabled) return;
    if (effSel !== null && targets.includes(q)) { doMove(pickMove(turn, effSel, q)); return; }
    if (sources.includes(q)) { setSel(effSel === q && sel !== null ? null : q); return; }
    // Direkt auf ein Ziel tippen, wenn nur ein Stein dorthin kann
    const ms = nextMoves(turn).filter((m) => m.to === q);
    if (ms.length && new Set(ms.map((m) => m.from)).size === 1) { doMove(pickMove(turn, ms[0].from, q)); return; }
    setSel(null);
  };
  const onDouble = (q: number) => { if (turn && enabled && sources.includes(q)) doMove(autoFrom(turn, q)); };

  return { selected: effSel, targets, sources, onPoint, onDouble };
}
