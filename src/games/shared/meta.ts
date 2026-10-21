// Verzeichnis aller Spiele, Erfolge und Geheimnisse der Spielhalle.

export interface GameMeta {
  id: string;
  name: string;
  tagline: string;
  /** Spielgattung für die Anzeige */
  genre: string;
}

export const GAMES: GameMeta[] = [
  { id: 'wabe', name: 'Wabe', tagline: 'Ein Spiel ohne Brett: Insekten-Plättchen, Schwarm-Regeln, Königin einschließen.', genre: 'Strategie' },
  { id: 'kalaha', name: 'Kalaha', tagline: 'Mancala: Kalah, Oware und Lawine – mit Vorschau, Coach und Aufgaben.', genre: 'Brettspiel' },
  { id: 'wikinger', name: 'Wikingerschach', tagline: 'Hnefatafl: König gegen Räuber – drei Bretter, KI, Skalde und Aufgaben.', genre: 'Brettspiel' },
  { id: 'mauer', name: 'Mauerbau', tagline: 'Wettlauf mit Mauern: Quoridor mit KI, Coach, Aufgaben und Labyrinth.', genre: 'Brettspiel' },
  { id: 'go', name: 'Go', tagline: 'Das Brettspiel der Steine – lernen, spielen, meistern.', genre: 'Brettspiel' },
  { id: 'gammon', name: 'Backgammon', tagline: 'Würfel, Doppelwürfel und Match – mit Coach und Eröffnungsbuch.', genre: 'Brettspiel' },
  { id: 'poker', name: 'Poker', tagline: 'Hold’em, Omaha, Short Deck – Bots mit Charakter, Trainer und Turniere.', genre: 'Karten' },
  { id: 'schiff', name: 'Seeschlacht', tagline: 'Schiffe versenken: Salven, Nebel, Radar – mit Kampagne.', genre: 'Strategie' },
  { id: 'code', name: 'Code-Knacker', tagline: 'Mastermind: knacken, verstecken, Duell – gegen einen Knuth-Löser.', genre: 'Denken' },
  { id: 'snake', name: 'Schlange', tagline: 'Snake mit Kampagne, KI-Duell, Editor und Power-ups.', genre: 'Arcade' },
  { id: 'block', name: 'Blockfall', tagline: 'Fallende Steine, vom Anfänger bis zum Duell.', genre: 'Arcade' },
  { id: 'karten', name: 'Patience', tagline: 'Klondike, FreeCell, Spider, Pyramide, TriPeaks.', genre: 'Karten' },
];

export interface Achievement { game: string; key: string; name: string; desc: string }
export const ACHIEVEMENTS: Achievement[] = [];
export const addAchievements = (list: Achievement[]) => { for (const a of list) if (!ACHIEVEMENTS.some((x) => x.game === a.game && x.key === a.key)) ACHIEVEMENTS.push(a); };

export interface Secret { id: string; game: string; code: string; title: string; riddle: string; effect: string }
export const SECRETS: Secret[] = [];
export const addSecrets = (list: Secret[]) => { for (const s of list) if (!SECRETS.some((x) => x.id === s.id)) SECRETS.push(s); };
