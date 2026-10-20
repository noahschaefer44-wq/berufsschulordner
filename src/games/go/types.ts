import type { Color, GoState, Rules } from './engine';

export interface Mv { idx: number; color: Color }

export interface Setup {
  opp: 'ki' | 'zwei';
  variant: 'normal' | 'atari' | 'torus';
  level: number;
  /** Farbe des Menschen; 0 = beide (Zwei Spieler) */
  human: Color | 0;
  rules: Rules;
  handicap: number;
  /** Weiterspielen aus einer Stellung */
  resume?: { states: GoState[]; moves: Mv[]; handicapPts: number[] };
}
