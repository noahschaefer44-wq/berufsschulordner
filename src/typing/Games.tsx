import { useState } from 'react';
import Arcade from './Arcade';
import RaceGame from './RaceGame';
import { useData } from './store';

/** Spiele-Bereich im Wii-U-Stil (heller, bunter Look nur hier). */
export default function Games() {
  const d = useData();
  const [game, setGame] = useState<'hub' | 'race' | 'rain'>('hub');
  if (game === 'race') return <RaceGame onExit={() => setGame('hub')} />;
  if (game === 'rain') return <Arcade onExit={() => setGame('hub')} />;
  return (
    <div className="wu-screen">
      <h2 className="wu-title">Spiele</h2>
      <p className="wu-sub">Tippe schneller, um in den Spielen vorne zu sein.</p>
      <div className="wu-tiles">
        <button className="wu-tile race" onClick={() => setGame('race')}>
          <span className="wu-ico">🏎️</span>
          <b>Tipp-Grand-Prix</b>
          <small>Kart-Rennen gegen Mia, Ben und Lea. Dein Tippen ist der Motor!</small>
          <em>{d.races} Rennen · {d.wins} Siege</em>
        </button>
        <button className="wu-tile rain" onClick={() => setGame('rain')}>
          <span className="wu-ico">☁️</span>
          <b>Wort-Regen</b>
          <small>Wörter fallen vom Himmel – tippe sie, bevor sie landen.</small>
          <em>Bestwert {d.arcade}</em>
        </button>
      </div>
    </div>
  );
}
