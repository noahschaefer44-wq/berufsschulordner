import { describe, expect, it } from 'vitest';
import { LESSONS, resolveTask } from '../src/games/go/lessons';
import { correctMoves, problemState } from '../src/games/go/problems';

describe('Go-Lektionen', () => {
  it('alle Aufgaben lassen sich auflösen und lösen', () => {
    let tasks = 0;
    for (const l of LESSONS) for (const st of l.steps) {
      if (st.t !== 'task') continue;
      tasks++;
      const p = resolveTask(st);
      expect(p, l.id).not.toBeNull();
      const { state, anchor } = problemState(p!);
      expect(correctMoves(p!, state, anchor).length, l.id).toBeGreaterThan(0);
    }
    expect(tasks).toBeGreaterThan(10);
  });
  it('Diagramme sind quadratisch', () => {
    for (const l of LESSONS) for (const st of l.steps) if (st.t === 'text' && st.diagram) {
      const n = st.diagram.rows.length;
      for (const r of st.diagram.rows) expect(r.length).toBe(n);
    }
  });
});
