import { useEffect, useRef, useState } from 'react';
import { SOURCES, sourceText } from './gen';
import Pad, { Gauge } from './Pad';
import { Mii } from './RaceGame';
import { beep, winSound } from './sound';
import TextRun from './TextRun';
import { update, useData } from './store';

const MONSTERS = [
  { e: '👾', n: 'Glitch-Alien' }, { e: '🐉', n: 'Feuerdrache' }, { e: '🧟', n: 'Büro-Zombie' }, { e: '🦖', n: 'Tipp-Rex' },
  { e: '🤖', n: 'Mega-Roboter' }, { e: '🐙', n: 'Tintenkrake' }, { e: '👹', n: 'Mahnungs-Oni' }, { e: '🦑', n: 'Riesenkalmar' },
];
const ME = { name: 'Du', color: '#00a9e0', skin: '#ffd9bd', hair: '#5a3a22' };

/** Monster-Duell: Jedes getippte Zeichen verletzt das Monster. Das Monster greift regelmäßig an – tippst du zu langsam, verlierst du. */
export default function Duell({ onExit }: { onExit: () => void }) {
  const d = useData();
  const [phase, setPhase] = useState<'start' | 'fight' | 'over'>('start');
  const [source, setSource] = useState('mix');
  const [level, setLevel] = useState(1);
  const [text, setText] = useState('');
  const [hp, setHp] = useState(100);
  const [mon, setMon] = useState(1);
  const [hit, setHit] = useState(0);
  const [log, setLog] = useState('');
  const st = useRef({ hp: 100, lastAtk: 0, stun: 0, errs: 0, idx: 0, kills: 0, chars: 0, start: 0 });

  function newMonster(lv: number, keepHp?: number) {
    setText(sourceText(source, 70 + lv * 22).slice(0, 90 + lv * 26).replace(/\s+\S*$/, ''));
    setLevel(lv); setMon(1);
    st.current.lastAtk = performance.now(); st.current.stun = 0; st.current.errs = 0; st.current.idx = 0;
    if (keepHp !== undefined) { st.current.hp = keepHp; setHp(keepHp); }
  }
  function start() {
    st.current = { hp: 100, lastAtk: performance.now(), stun: 0, errs: 0, idx: 0, kills: 0, chars: 0, start: performance.now() };
    setHp(100); setPhase('fight'); setLog('');
    newMonster(1, 100);
  }

  // Angriffe des Monsters
  useEffect(() => {
    if (phase !== 'fight') return;
    const id = setInterval(() => {
      const s = st.current, now = performance.now();
      const period = Math.max(1800, 4800 - level * 260);
      if (now < s.stun) return;
      if (now - s.lastAtk >= period) {
        s.lastAtk = now;
        const dmg = 8 + level * 1.6;
        s.hp = Math.max(0, s.hp - dmg);
        setHp(s.hp); setHit((n) => n + 1); setLog('Das Monster greift an!'); beep(140, 0.25, 'sawtooth');
        if (s.hp <= 0) end();
      }
    }, 120);
    return () => clearInterval(id);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function end() {
    setPhase('over');
    const reached = level;
    update((x) => { x.hi = { ...x.hi, duell: Math.max(x.hi.duell ?? 0, reached) }; });
    winSound();
  }

  if (phase === 'start') {
    return (
      <div className="wu-screen">
        <button className="wu-back" onClick={onExit}>‹ Spiele</button>
        <h2 className="wu-title">Monster-Duell</h2>
        <p className="wu-sub">Jedes richtige Zeichen verletzt das Monster. Es greift regelmäßig an, Fehler kosten dich Energie. Besiegst du es, kommt ein stärkeres. 20 Treffer in Folge betäuben es kurz.</p>
        <div className="wu-panel"><div className="wu-field"><span>Texte</span><select value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>
        <div className="wu-stats"><span>Bestes Level: {d.hi.duell ?? 0}</span></div>
        <button className="wu-go" onClick={start}>Kampf beginnen</button>
      </div>
    );
  }
  if (phase === 'over') {
    return (
      <div className="wu-screen">
        <h2 className="wu-title">Besiegt!</h2>
        <div className="wu-big">Level {level}</div>
        <p className="wu-sub">{st.current.kills} Monster erledigt · Bestes Level: {Math.max(d.hi.duell ?? 0, level)}</p>
        <button className="wu-go" onClick={start}>Nochmal</button>
        <button className="wu-ghost" onClick={onExit}>Zu den Spielen</button>
      </div>
    );
  }
  const m = MONSTERS[(level - 1) % MONSTERS.length];
  return (
    <div className="wu-screen duel">
      <div className="wu-bar"><button className="wu-back" onClick={() => setPhase('start')}>✕ Aufgeben</button><b>Level {level}</b><span className="wu-lap">{st.current.kills} besiegt</span></div>
      <div className="wu-arena">
        <div className="wu-fighter">
          <Mii d={ME} size={72} />
          <Gauge value={hp / 100} color={hp > 40 ? '#2fc96f' : '#ff4d57'} label="Deine Energie" />
          <small>Energie {Math.round(hp)}</small>
        </div>
        <div className="wu-vs">VS</div>
        <div className="wu-fighter monster">
          <span className={'wu-monster' + (hit % 2 ? ' atk' : '')} key={'m' + level} style={{ transform: `scale(${0.7 + mon * 0.3})`, opacity: 0.45 + mon * 0.55 }}>{m.e}</span>
          <Gauge value={mon} color="#ff9a1f" label="Monster-Energie" />
          <small>{m.n}</small>
        </div>
      </div>
      {log && <div className="wu-log">{log}</div>}
      <Pad title="Tippe, um anzugreifen!">
        <TextRun
          key={level + text}
          text={text}
          mode="duell"
          recordKeys
          hideResult
          onProgress={(p) => {
            const s = st.current;
            if (p.idx > s.idx) { s.chars += p.idx - s.idx; }
            s.idx = p.idx;
            setMon(1 - p.idx / p.len);
            if (p.errs > s.errs) { s.hp = Math.max(0, s.hp - 3); setHp(s.hp); setLog('Fehler – Autsch!'); if (s.hp <= 0) end(); }
            s.errs = p.errs;
            if (p.streak > 0 && p.streak % 20 === 0) { s.stun = performance.now() + 2200; setLog('Treffer-Serie! Monster betäubt.'); }
          }}
          onFinish={() => {
            const s = st.current;
            s.kills += 1;
            beep(784, 0.3);
            const heal = Math.min(100, s.hp + 18);
            setLog(`${m.n} besiegt! +18 Energie`);
            setTimeout(() => newMonster(level + 1, heal), 700);
          }}
          onRestart={() => newMonster(level)}
        />
      </Pad>
    </div>
  );
}
