// Schachtel-Motive der Spielregal-Ansicht: Jedes Spiel hat seine eigene Bildsprache (Farben, Schrift, Material).

const Frame = ({ children, bg }: { children: React.ReactNode; bg: string }) => (
  <svg viewBox="0 0 120 160" className="gh-art" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <rect width="120" height="160" fill={bg} />
    {children}
  </svg>
);

export function MinenCover() {
  const tiles: React.ReactNode[] = [];
  const nums = ['', '1', '', '2', '1', '', '', '1', '3'];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const open = (x + y) % 2 === 0 || nums[y * 3 + x] !== '';
    tiles.push(
      <g key={`${x}${y}`} transform={`translate(${26 + x * 22} ${70 + y * 22})`}>
        <rect width="21" height="21" fill="#c0c0c0" />
        {open ? <rect width="21" height="21" fill="#c0c0c0" stroke="#808080" strokeWidth="1" /> : <><path d="M0 0 H21 V3 H3 V21 H0 Z" fill="#fff" /><path d="M21 3 V21 H3 V18 H18 V3 Z" fill="#808080" /></>}
        {nums[y * 3 + x] && <text x="10.5" y="16" textAnchor="middle" fontSize="14" fontWeight="700" fontFamily="Tahoma,Verdana,sans-serif" fill={['', '#0000ff', '#008000', '#ff0000'][Number(nums[y * 3 + x])]}>{nums[y * 3 + x]}</text>}
      </g>,
    );
  }
  return (
    <Frame bg="#008080">
      <rect x="14" y="22" width="92" height="118" fill="#c0c0c0" />
      <rect x="14" y="22" width="92" height="118" fill="none" stroke="#fff" strokeWidth="1.5" />
      <path d="M106 22 V140 H14" fill="none" stroke="#404040" strokeWidth="1.5" />
      <rect x="17" y="25" width="86" height="12" fill="#000080" />
      <text x="22" y="34.5" fontSize="8" fontWeight="700" fill="#fff" fontFamily="Tahoma,Verdana,sans-serif">Minenfeld</text>
      <rect x="20" y="42" width="80" height="22" fill="#c0c0c0" stroke="#808080" />
      <rect x="23" y="45" width="24" height="16" fill="#000" />
      <text x="26" y="58" fontSize="13" fontWeight="700" fill="#ff2a1a" fontFamily="monospace">010</text>
      <circle cx="60" cy="53" r="8" fill="#ff0" stroke="#000" />
      <circle cx="57" cy="51" r="1.2" /><circle cx="63" cy="51" r="1.2" /><path d="M56 55.5 Q60 59 64 55.5" stroke="#000" fill="none" />
      <rect x="73" y="45" width="24" height="16" fill="#000" />
      <text x="76" y="58" fontSize="13" fontWeight="700" fill="#ff2a1a" fontFamily="monospace">042</text>
      {tiles}
    </Frame>
  );
}

export function SudokuCover() {
  const lines: React.ReactNode[] = [];
  for (let i = 0; i <= 9; i++) {
    const t = i % 3 === 0;
    lines.push(<line key={`v${i}`} x1={15 + i * 10} y1="38" x2={15 + i * 10} y2="128" stroke="#1b1a17" strokeWidth={t ? 1.6 : 0.5} />);
    lines.push(<line key={`h${i}`} x1="15" y1={38 + i * 10} x2="105" y2={38 + i * 10} stroke="#1b1a17" strokeWidth={t ? 1.6 : 0.5} />);
  }
  const given: [number, number, string][] = [[0, 0, '5'], [1, 0, '3'], [4, 0, '7'], [0, 1, '6'], [3, 1, '1'], [4, 1, '9'], [5, 1, '5'], [1, 2, '9'], [2, 2, '8'], [7, 2, '6']];
  return (
    <Frame bg="#f1ebdc">
      <text x="15" y="24" fontSize="13" fontFamily="'Source Serif 4',Georgia,serif" fontWeight="700" fill="#1b1a17">Rätselheft</text>
      <line x1="15" y1="28" x2="105" y2="28" stroke="#1b1a17" strokeWidth="1.2" />
      {lines}
      {given.map(([x, y, n]) => <text key={`${x}${y}`} x={20 + x * 10} y={46 + y * 10} textAnchor="middle" fontSize="8" fontFamily="'Source Serif 4',Georgia,serif" fontWeight="600" fill="#1b1a17">{n}</text>)}
      <text x="50" y="76" textAnchor="middle" fontSize="8" fontFamily="'Source Serif 4',Georgia,serif" fill="#1f4e9c" fontStyle="italic">4</text>
      <text x="60" y="96" textAnchor="middle" fontSize="8" fontFamily="'Source Serif 4',Georgia,serif" fill="#1f4e9c" fontStyle="italic">2</text>
      <circle cx="40" cy="66" r="6" fill="none" stroke="#b3261e" strokeWidth="1.3" />
      <text x="15" y="146" fontSize="6" fontFamily="'Source Serif 4',Georgia,serif" fill="#6b655a">Nr. 142 · Mittel</text>
    </Frame>
  );
}

export function BildCover() {
  return (
    <Frame bg="#f4f1e8">
      <rect x="10" y="12" width="62" height="64" fill="#d6222a" />
      <rect x="76" y="12" width="34" height="30" fill="#f7d417" />
      <rect x="76" y="46" width="34" height="62" fill="#fff" />
      <rect x="10" y="80" width="30" height="68" fill="#fff" />
      <rect x="44" y="112" width="66" height="36" fill="#1f49a3" />
      <rect x="44" y="80" width="28" height="28" fill="#fff" />
      <g fill="none" stroke="#111" strokeWidth="3">
        <path d="M10 12 H110 V148 H10 Z" /><path d="M72 12 V108 M10 78 H110 M40 78 V148 M44 110 H110 M76 44 H110" />
      </g>
      <g fill="#111"><rect x="48" y="84" width="6" height="6" /><rect x="56" y="84" width="6" height="6" /><rect x="48" y="92" width="6" height="6" /><rect x="62" y="100" width="6" height="6" /></g>
      <text x="82" y="68" fontSize="9" fontWeight="800" fontFamily="Jost,Futura,sans-serif" fill="#111">3 1</text>
      <text x="82" y="82" fontSize="9" fontWeight="800" fontFamily="Jost,Futura,sans-serif" fill="#111">2 2</text>
    </Frame>
  );
}

export function LagerCover() {
  return (
    <Frame bg="#2a2a28">
      <defs><pattern id="hz" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="14" fill="#f5c400" /><rect x="7" width="7" height="14" fill="#1a1a1a" /></pattern></defs>
      <rect x="0" y="0" width="120" height="22" fill="url(#hz)" />
      <rect x="0" y="138" width="120" height="22" fill="url(#hz)" />
      <g stroke="#1a1a1a" strokeWidth="2">
        <rect x="22" y="52" width="40" height="40" fill="#b8793a" /><path d="M22 52 L62 92 M62 52 L22 92" stroke="#7a4d1f" />
        <rect x="62" y="92" width="40" height="40" fill="#c9893f" /><path d="M62 92 L102 132 M102 92 L62 132" stroke="#7a4d1f" />
      </g>
      <circle cx="82" cy="72" r="13" fill="none" stroke="#f5c400" strokeWidth="3" strokeDasharray="4 3" />
      <circle cx="42" cy="112" r="9" fill="#f5c400" /><rect x="36" y="118" width="12" height="9" fill="#1a1a1a" />
      <text x="60" y="153" textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="'Barlow Condensed',sans-serif" fill="#f5c400" letterSpacing="2">LAGERHAUS</text>
    </Frame>
  );
}

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
