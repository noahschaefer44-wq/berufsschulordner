// Schachtel-Motive der Spielregal-Ansicht: Jedes Spiel hat seine eigene Bildsprache (Farben, Schrift, Material).

const Frame = ({ children, bg }: { children: React.ReactNode; bg: string }) => (
  <svg viewBox="0 0 120 160" className="gh-art" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <rect width="120" height="160" fill={bg} />
    {children}
  </svg>
);

export function BlockCover() {
  const P = (x: number, y: number, c: string, cells: [number, number][]) => cells.map(([dx, dy], k) => <rect key={`${x}${y}${k}`} x={x + dx * 14} y={y + dy * 14} width="13" height="13" fill={c} rx="1.5" />);
  return (
    <Frame bg="#0e1116">
      <rect x="12" y="14" width="96" height="132" fill="#12161d" stroke="#2a313d" />
      {[1, 2, 3, 4, 5, 6, 7].map((i) => <line key={i} x1={12 + i * 12} y1="14" x2={12 + i * 12} y2="146" stroke="#1b212b" />)}
      {Array.from({ length: 10 }, (_, i) => <line key={i} x1="12" y1={14 + (i + 1) * 12} x2="108" y2={14 + (i + 1) * 12} stroke="#1b212b" />)}
      {P(16, 40, '#35b6d9', [[0, 0], [1, 0], [2, 0], [3, 0]])}
      {P(16, 54, '#e8c13c', [[0, 0], [1, 0], [0, 1], [1, 1]])}
      {P(58, 82, '#a35bd0', [[1, 0], [0, 1], [1, 1], [2, 1]])}
      {P(16, 96, '#e85a4f', [[0, 0], [1, 0], [1, 1], [2, 1]])}
      {P(58, 110, '#4aa86a', [[1, 0], [2, 0], [0, 1], [1, 1]])}
      {P(16, 124, '#e0873a', [[2, 0], [0, 1], [1, 1], [2, 1]])}
      {P(72, 124, '#4f6fe0', [[0, 0], [0, 1], [1, 1], [2, 1]])}
      <text x="60" y="152" textAnchor="middle" fontSize="7" fontFamily="'JetBrains Mono',monospace" fill="#6f7b8c">40 LINES</text>
    </Frame>
  );
}

export function KartenCover() {
  return (
    <Frame bg="#0b5d33">
      <defs><radialGradient id="fz" cx="50%" cy="40%" r="75%"><stop offset="0" stopColor="#14814a" /><stop offset="1" stopColor="#063a20" /></radialGradient></defs>
      <rect width="120" height="160" fill="url(#fz)" />
      <g transform="translate(36 98) rotate(-14)"><rect x="-22" y="-34" width="44" height="64" rx="4" fill="#fbf8ef" stroke="#c9c2ad" /><text x="-16" y="-16" fontSize="14" fontWeight="700" fontFamily="'Playfair Display',Georgia,serif" fill="#15130f">A</text><text x="0" y="12" textAnchor="middle" fontSize="30" fill="#15130f">♠</text></g>
      <g transform="translate(78 96) rotate(11)"><rect x="-22" y="-34" width="44" height="64" rx="4" fill="#fbf8ef" stroke="#c9c2ad" /><text x="-16" y="-16" fontSize="14" fontWeight="700" fontFamily="'Playfair Display',Georgia,serif" fill="#b3261e">Q</text><text x="0" y="12" textAnchor="middle" fontSize="30" fill="#b3261e">♥</text></g>
      <rect x="16" y="14" width="30" height="42" rx="3" fill="#1d3f8f" stroke="#fff" strokeWidth="1.5" /><path d="M20 18 H42 V52 H20 Z" fill="none" stroke="#c9d3f0" strokeWidth=".8" />
      <text x="60" y="150" textAnchor="middle" fontSize="9" fontFamily="'Playfair Display',Georgia,serif" fontStyle="italic" fill="#e6dcb6">Patience</text>
    </Frame>
  );
}

export function GoCover() {
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < 7; i++) {
    lines.push(<line key={`v${i}`} x1={20 + i * 13} y1="40" x2={20 + i * 13} y2="118" stroke="#3b2a12" strokeWidth=".8" />);
    lines.push(<line key={`h${i}`} x1="20" y1={40 + i * 13} x2="98" y2={40 + i * 13} stroke="#3b2a12" strokeWidth=".8" />);
  }
  const stone = (x: number, y: number, w: boolean) => (
    <g key={`${x}${y}`}>
      <circle cx={20 + x * 13 + 1.2} cy={40 + y * 13 + 1.6} r="6.2" fill="rgba(0,0,0,.28)" />
      <circle cx={20 + x * 13} cy={40 + y * 13} r="6.2" fill={w ? '#f3f1ea' : '#16171a'} stroke={w ? '#bdb8a8' : '#000'} strokeWidth=".5" />
      <circle cx={20 + x * 13 - 1.8} cy={40 + y * 13 - 2} r="1.7" fill={w ? '#fff' : '#4a4d57'} opacity=".7" />
    </g>
  );
  return (
    <Frame bg="#e8dcc1">
      <rect x="10" y="30" width="100" height="98" fill="#d9ad5b" stroke="#a97f33" strokeWidth="1.5" />
      {lines}
      {[[2, 2, false], [3, 2, true], [2, 3, true], [3, 3, false], [4, 4, false], [1, 4, true], [4, 1, true], [5, 3, false], [3, 5, true]].map(([x, y, w]) => stone(x as number, y as number, w as boolean))}
      <text x="60" y="20" textAnchor="middle" fontSize="13" fontFamily="'Shippori Mincho',serif" fontWeight="700" fill="#2a1d0a">碁 Go</text>
      <circle cx="98" cy="144" r="6" fill="#b3261e" /><text x="60" y="148" textAnchor="middle" fontSize="7" fontFamily="'Shippori Mincho',serif" fill="#3b2a12">9×9 · 13×13 · 19×19</text>
    </Frame>
  );
}

export function GammonCover() {
  const tris: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    tris.push(<polygon key={`a${i}`} points={`${14 + i * 15},34 ${28 + i * 15},34 ${21 + i * 15},82`} fill={i % 2 ? '#d9b46b' : '#8a2b1b'} />);
    tris.push(<polygon key={`b${i}`} points={`${14 + i * 15},126 ${28 + i * 15},126 ${21 + i * 15},78`} fill={i % 2 ? '#8a2b1b' : '#d9b46b'} />);
  }
  const ch = (x: number, y: number, w: boolean) => (
    <g key={`${x}${y}`}><circle cx={x + 1} cy={y + 1.5} r="6.6" fill="rgba(0,0,0,.4)" /><circle cx={x} cy={y} r="6.6" fill={w ? '#f6efdc' : '#241913'} stroke={w ? '#b9a679' : '#000'} strokeWidth=".6" /></g>
  );
  return (
    <Frame bg="#241309">
      <rect x="8" y="28" width="104" height="104" fill="#4a2815" stroke="#c9a24b" strokeWidth="2" />
      {tris}
      <rect x="57" y="28" width="6" height="104" fill="#2a170d" />
      {[ch(21, 41, true), ch(21, 55, true), ch(96, 120, false), ch(96, 106, false), ch(36, 119, true), ch(81, 41, false), ch(81, 55, false)]}
      <g transform="translate(40 80) rotate(-12)"><rect x="-9" y="-9" width="18" height="18" rx="3" fill="#f7f0df" stroke="#8d7a4a" /><circle cx="-4" cy="-4" r="1.8" fill="#2a1d10" /><circle cx="4" cy="4" r="1.8" fill="#2a1d10" /></g>
      <g transform="translate(70 76) rotate(14)"><rect x="-9" y="-9" width="18" height="18" rx="3" fill="#f7f0df" stroke="#8d7a4a" /><circle cx="0" cy="0" r="1.8" fill="#2a1d10" /><circle cx="-4" cy="-4" r="1.8" fill="#2a1d10" /><circle cx="4" cy="4" r="1.8" fill="#2a1d10" /></g>
      <text x="60" y="18" textAnchor="middle" fontSize="12" fontFamily="'Cinzel',serif" fontWeight="700" letterSpacing="1.5" fill="#c9a24b">BACKGAMMON</text>
      <text x="60" y="150" textAnchor="middle" fontSize="8" fontFamily="'Lora',serif" fontStyle="italic" fill="#d7bf8a">Würfel · Doppelwürfel · Match</text>
    </Frame>
  );
}

export function SchiffCover() {
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) cells.push(<rect key={`${i}${j}`} x={14 + i * 11.5} y={34 + j * 11.5} width="11.5" height="11.5" fill="none" stroke="rgba(70,255,150,.28)" strokeWidth=".6" />);
  return (
    <Frame bg="#04110b">
      <rect x="10" y="30" width="100" height="100" fill="#06261a" stroke="#46ff9c" strokeWidth="1.2" />
      {cells}
      <path d="M26 57 h34 l5 5.5 l-5 5.5 h-34 z" fill="#2f9a6a" stroke="#0d3a26" />
      <path d="M71 82 h5 l0 28 l-5 0 z" fill="#2f9a6a" stroke="#0d3a26" />
      <circle cx="37" cy="103" r="4" fill="none" stroke="#9fe8c4" strokeWidth="1.2" /><circle cx="86" cy="45" r="4" fill="none" stroke="#9fe8c4" strokeWidth="1.2" />
      <g fill="#ff5a36"><circle cx="48" cy="62.5" r="3.8" /><circle cx="73.5" cy="90" r="3.8" /></g>
      <path d="M60 80 L110 62" stroke="rgba(70,255,150,.55)" strokeWidth="3" />
      <text x="60" y="19" textAnchor="middle" fontSize="12" fontFamily="'Share Tech Mono',monospace" fontWeight="700" letterSpacing="2" fill="#46ff9c">SEESCHLACHT</text>
      <text x="60" y="148" textAnchor="middle" fontSize="8" fontFamily="'Share Tech Mono',monospace" fill="#7fb698">FLOTTENKOMMANDO</text>
    </Frame>
  );
}

export function PokerCover() {
  return (
    <Frame bg="#0a0610">
      <ellipse cx="60" cy="88" rx="52" ry="42" fill="#2a1f66" stroke="#ff2e88" strokeWidth="4" />
      <ellipse cx="60" cy="88" rx="44" ry="34" fill="none" stroke="rgba(255,255,255,.14)" />
      <g transform="translate(46 80) rotate(-12)"><rect x="-14" y="-20" width="28" height="40" rx="3" fill="#fbf8ef" /><text x="-9" y="-6" fontSize="13" fontFamily="'Playfair Display',Georgia,serif" fontWeight="700" fill="#15130f">A</text><text x="0" y="11" textAnchor="middle" fontSize="17" fill="#15130f">♠</text></g>
      <g transform="translate(70 78) rotate(10)"><rect x="-14" y="-20" width="28" height="40" rx="3" fill="#fbf8ef" /><text x="-9" y="-6" fontSize="13" fontFamily="'Playfair Display',Georgia,serif" fontWeight="700" fill="#b3261e">K</text><text x="0" y="11" textAnchor="middle" fontSize="17" fill="#b3261e">♥</text></g>
      <g><circle cx="38" cy="112" r="6" fill="#ff2e88" stroke="#fff" strokeWidth="1.4" /><circle cx="48" cy="114" r="6" fill="#20e3d0" stroke="#fff" strokeWidth="1.4" /><circle cx="82" cy="114" r="6" fill="#ffd36a" stroke="#fff" strokeWidth="1.4" /></g>
      <text x="60" y="26" textAnchor="middle" fontSize="22" fontFamily="'Bebas Neue',sans-serif" letterSpacing="3" fill="#ff2e88">POKER</text>
      <text x="60" y="148" textAnchor="middle" fontSize="8" fontFamily="'IBM Plex Sans',sans-serif" letterSpacing="1" fill="#a894c9">TEXAS HOLD’EM · OMAHA</text>
    </Frame>
  );
}

export function CodeCover() {
  const peg = (x: number, y: number, c1: string, c2: string, k: string) => <g key={k}><circle cx={x + .8} cy={y + 1.4} r="8" fill="rgba(0,0,0,.3)" /><circle cx={x} cy={y} r="8" fill={c2} /><circle cx={x - 2} cy={y - 2.5} r="5" fill={c1} opacity=".85" /></g>;
  const rows: [string, string][][] = [[['#ff7a6b', '#c4271a'], ['#7fb0ff', '#1f55c4'], ['#ffe27a', '#d19a0e'], ['#7fdc8c', '#1f8a3a']], [['#7fdc8c', '#1f8a3a'], ['#7fdc8c', '#1f8a3a'], ['#c79bff', '#6a35b8'], ['#ff7a6b', '#c4271a']]];
  return (
    <Frame bg="#e7e3d8">
      <rect x="10" y="26" width="100" height="108" rx="10" fill="#f4f1e8" stroke="#c8c3b4" />
      <rect x="16" y="32" width="88" height="16" rx="5" fill="#1c1b19" />
      <text x="22" y="44" fontSize="9" fontFamily="'IBM Plex Mono',monospace" fontWeight="700" fill="#ff8a3d" letterSpacing="2">? ? ? ?</text>
      {rows.map((r, i) => <g key={i}>{r.map(([a, b], j) => peg(28 + j * 18, 66 + i * 26, a, b, `${i}${j}`))}{[0, 1, 2, 3].map((k) => <circle key={k} cx={104 - (k % 2) * 6} cy={60 + i * 26 + Math.floor(k / 2) * 6} r="2.2" fill={k < 2 - i ? '#1a1a18' : k < 3 ? '#fafaf5' : '#cfcabb'} stroke="#55524a" strokeWidth=".5" />)}</g>)}
      <g>{[0, 1, 2, 3].map((j) => <circle key={j} cx={28 + j * 18} cy={118} r="7.5" fill="#d9d4c6" stroke="#b7b2a2" />)}</g>
      <circle cx="104" cy="34" r="3.2" fill="#ff6a13" />
      <text x="60" y="17" textAnchor="middle" fontSize="10" fontFamily="'IBM Plex Mono',monospace" fontWeight="700" fill="#2a2a27">CODE-KNACKER</text>
      <text x="60" y="150" textAnchor="middle" fontSize="8" fontFamily="'IBM Plex Sans',sans-serif" fill="#77746a">Mastermind · Bullen &amp; Kühe</text>
    </Frame>
  );
}

export function SnakeCover() {
  const cells = [[3, 4], [4, 4], [5, 4], [6, 4], [6, 5], [6, 6], [5, 6], [4, 6], [4, 7], [4, 8]];
  const sq = (x: number, y: number, k: string, head = false) => <rect key={k} x={16 + x * 11} y={38 + y * 11} width="9.6" height="9.6" fill={head ? '#18220f' : '#26331d'} />;
  return (
    <Frame bg="#223e6e">
      <rect x="8" y="24" width="104" height="112" rx="14" fill="#34588f" />
      <rect x="16" y="32" width="88" height="86" fill="#b9c99b" stroke="#0e1a12" strokeWidth="3" />
      {cells.map(([x, y], i) => sq(x, y, `c${i}`, i === cells.length - 1))}
      <rect x="85" y="49" width="8" height="8" fill="#26331d" /><rect x="88" y="46" width="2" height="3" fill="#26331d" />
      <rect x="38" y="108" width="44" height="12" rx="6" fill="#7d92b8" opacity="0" />
      <rect x="40" y="123" width="40" height="8" rx="4" fill="#7d92b8" />
      <text x="60" y="17" textAnchor="middle" fontSize="13" fontFamily="'Silkscreen',monospace" fontWeight="700" letterSpacing="1.5" fill="#c8e07a">SCHLANGE</text>
      <text x="60" y="150" textAnchor="middle" fontSize="7.5" fontFamily="'IBM Plex Mono',monospace" fill="#9fb8ae">Kampagne · Duell · Editor</text>
    </Frame>
  );
}

export function MauerCover() {
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cells.push(<rect key={`${r}${c}`} x={14 + c * 18.4} y={22 + r * 18.4} width="15" height="15" fill="#164486" stroke="rgba(205,225,255,.55)" strokeWidth=".6" />);
  return (
    <Frame bg="#0f2f66">
      <defs><pattern id="mg" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="rgba(190,215,255,.1)" strokeWidth=".5" /></pattern></defs>
      <rect width="120" height="160" fill="url(#mg)" />
      <text x="60" y="14" textAnchor="middle" fontSize="8" fontFamily="'Barlow Condensed',sans-serif" fontWeight="700" letterSpacing="1.6" fill="#e7f0ff">MAUERBAU</text>
      {cells}
      <rect x="14" y="58.8" width="33" height="3.4" fill="#f4f1e6" stroke="#bdb9a6" strokeWidth=".4" />
      <rect x="51.8" y="77.2" width="33" height="3.4" fill="#ff8a3d" stroke="#b9560f" strokeWidth=".4" />
      <rect x="69.8" y="22" width="3.4" height="33" fill="#f4f1e6" stroke="#bdb9a6" strokeWidth=".4" />
      <rect x="33" y="40.4" width="3.4" height="33" fill="#ff8a3d" stroke="#b9560f" strokeWidth=".4" />
      <circle cx="60.7" cy="29.5" r="6" fill="#ff8a3d" stroke="#b9560f" strokeWidth="1.2" />
      <circle cx="42.3" cy="103" r="6" fill="#f4f1e6" stroke="#bdb9a6" strokeWidth="1.2" />
      <path d="M42.3 97 V84 H60.7 V35.5" fill="none" stroke="#f4f1e6" strokeWidth="1" strokeDasharray="1.5 3" strokeLinecap="round" />
      <rect x="64" y="128" width="46" height="22" fill="none" stroke="#e7f0ff" strokeWidth="1" />
      <text x="68" y="138" fontSize="5" fontFamily="'Courier Prime',monospace" fill="#9db8e6">Zeichnung Nr. 9</text>
      <text x="68" y="146" fontSize="5" fontFamily="'Architects Daughter',cursive" fill="#e7f0ff">Maßstab 1:1</text>
    </Frame>
  );
}
