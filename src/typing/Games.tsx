import { useState } from 'react';
import Arcade from './Arcade';
import Belt from './Belt';
import Duell from './Duell';
import Memory from './Memory';
import RaceGame from './RaceGame';
import Rocket from './Rocket';
import { useData } from './store';

type G = 'hub' | 'race' | 'rain' | 'duell' | 'rakete' | 'band' | 'merk';

/** Spiele-Bereich im Wii-U-Stil (heller, bunter Look nur hier). */
export default function Games() {
  const d = useData();
  const [game, setGame] = useState<G>('hub');
  const back = () => setGame('hub');
  if (game === 'race') return <RaceGame onExit={back} />;
  if (game === 'rain') return <Arcade onExit={back} />;
  if (game === 'duell') return <Duell onExit={back} />;
  if (game === 'rakete') return <Rocket onExit={back} />;
  if (game === 'band') return <Belt onExit={back} />;
  if (game === 'merk') return <Memory onExit={back} />;
  const tile = (id: G, cls: string, ico: string, title: string, sub: string, stat: string) => (
    <button className={'wu-tile ' + cls} onClick={() => setGame(id)}>
      <span className="wu-ico">{ico}</span><b>{title}</b><small>{sub}</small><em>{stat}</em>
    </button>
  );
  return (
    <div className="wu-screen">
      <h2 className="wu-title">Spiele</h2>
      <p className="wu-sub">Tippe schneller, um in den Spielen vorne zu sein.</p>
      <div className="wu-tiles">
        {tile('race', 'race', '🏎️', 'Tipp-Grand-Prix', 'Kart-Rennen gegen Mia, Ben und Lea. Dein Tippen ist der Motor!', `${d.races} Rennen · ${d.wins} Siege`)}
        {tile('duell', 'duel', '🐉', 'Monster-Duell', 'Jeder Anschlag ist ein Treffer. Besiege immer stärkere Monster.', `Bestes Level ${d.hi.duell ?? 0}`)}
        {tile('rakete', 'rocket', '🚀', 'Raketenstart', 'Tippen ist dein Treibstoff. Wie hoch kommst du?', `Rekord ${d.hi.rakete ?? 0} m`)}
        {tile('band', 'belt', '🧱', 'Fließband', 'Kacheln rollen heran – tippe sie, bevor sie herausfallen.', `Bestwert ${d.hi.band ?? 0}`)}
        {tile('merk', 'mem', '🧠', 'Merk-Modus', 'Satz kurz ansehen, dann aus dem Gedächtnis tippen.', `Bestes: Runde ${d.hi.merk ?? 0}`)}
        {tile('rain', 'rain', '☁️', 'Wort-Regen', 'Wörter fallen vom Himmel – tippe sie, bevor sie landen.', `Bestwert ${d.arcade}`)}
      </div>
    </div>
  );
}
