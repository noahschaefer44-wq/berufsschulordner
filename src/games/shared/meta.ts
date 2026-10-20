// Verzeichnis aller Spiele, Erfolge und Geheimnisse der Spielhalle.

export interface GameMeta {
  id: string;
  name: string;
  tagline: string;
  /** Spielgattung für die Anzeige */
  genre: string;
}

export const GAMES: GameMeta[] = [
  { id: 'minen', name: 'Minenfeld', tagline: 'Räume das Feld, ohne zu raten.', genre: 'Logik' },
  { id: 'sudoku', name: 'Rätselheft', tagline: 'Sudoku in sieben Varianten, mit Technik-Schule.', genre: 'Logik' },
  { id: 'bild', name: 'Bildrätsel', tagline: 'Nonogramme lösen, zeichnen, aus Fotos machen.', genre: 'Logik' },
  { id: 'lager', name: 'Lagerhaus', tagline: 'Kisten schieben – mit Editor und Löser.', genre: 'Denken' },
  { id: 'block', name: 'Blockfall', tagline: 'Fallende Steine, vom Anfänger bis zum Duell.', genre: 'Arcade' },
  { id: 'karten', name: 'Patience', tagline: 'Klondike, FreeCell, Spider, Pyramide, TriPeaks.', genre: 'Karten' },
  { id: 'go', name: 'Go', tagline: 'Das Brettspiel der Steine – lernen, spielen, meistern.', genre: 'Brettspiel' },
];

export interface Achievement { game: string; key: string; name: string; desc: string }
export const ACHIEVEMENTS: Achievement[] = [];
export const addAchievements = (list: Achievement[]) => { for (const a of list) if (!ACHIEVEMENTS.some((x) => x.game === a.game && x.key === a.key)) ACHIEVEMENTS.push(a); };

export interface Secret { id: string; game: string; code: string; title: string; riddle: string; effect: string }
export const SECRETS: Secret[] = [];
export const addSecrets = (list: Secret[]) => { for (const s of list) if (!SECRETS.some((x) => x.id === s.id)) SECRETS.push(s); };
