// Siebensegmentanzeige und Smiley im Stil der klassischen Fenster-Oberfläche.

const SEG: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '',
};
// Segmentlage in einem 13×23-Feld
const PATHS: Record<string, string> = {
  a: 'M2 1 L11 1 L9.5 3 L3.5 3 Z',
  b: 'M12 2 L12 10.5 L10 9.5 L10 4 Z',
  c: 'M12 12.5 L12 21 L10 19 L10 13.5 Z',
  d: 'M2 22 L11 22 L9.5 20 L3.5 20 Z',
  e: 'M1 12.5 L1 21 L3 19 L3 13.5 Z',
  f: 'M1 2 L1 10.5 L3 9.5 L3 4 Z',
  g: 'M2 11.5 L3.5 10.2 L9.5 10.2 L11 11.5 L9.5 12.8 L3.5 12.8 Z',
};

export function Led({ value, digits = 3, label }: { value: number; digits?: number; label: string }) {
  const max = Math.pow(10, digits) - 1;
  const v = Math.max(-(Math.pow(10, digits - 1) - 1), Math.min(max, Math.round(value)));
  const text = (v < 0 ? '-' + String(-v).padStart(digits - 1, '0') : String(v).padStart(digits, '0')).slice(-digits);
  return (
    <div className="mn-led" role="img" aria-label={`${label}: ${v}`}>
      {text.split('').map((ch, i) => (
        <svg key={i} viewBox="0 0 13 23" className="mn-digit" aria-hidden="true">
          {Object.entries(PATHS).map(([k, d]) => <path key={k} d={d} fill={SEG[ch]?.includes(k) ? '#ff2a1a' : '#4a0a05'} />)}
        </svg>
      ))}
    </div>
  );
}

export type FaceKind = 'smile' | 'ooh' | 'dead' | 'cool';
export function Face({ kind }: { kind: FaceKind }) {
  return (
    <svg viewBox="0 0 24 24" className="mn-face" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#ffff00" stroke="#000" strokeWidth="1.2" />
      {kind === 'cool' ? (
        <>
          <path d="M4 9 H20 V11.5 Q20 14 17 14 Q14 14 13.5 11.5 H10.5 Q10 14 7 14 Q4 14 4 11.5 Z" fill="#000" />
          <path d="M7 17 Q12 20.5 17 17" stroke="#000" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </>
      ) : kind === 'dead' ? (
        <>
          <path d="M6.5 8.5 L10 12 M10 8.5 L6.5 12 M14 8.5 L17.5 12 M17.5 8.5 L14 12" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M7 18 Q12 14.5 17 18" stroke="#000" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </>
      ) : kind === 'ooh' ? (
        <>
          <circle cx="8.5" cy="10" r="1.7" fill="#000" /><circle cx="15.5" cy="10" r="1.7" fill="#000" />
          <ellipse cx="12" cy="17" rx="2.4" ry="3" fill="#000" />
        </>
      ) : (
        <>
          <circle cx="8.5" cy="10" r="1.6" fill="#000" /><circle cx="15.5" cy="10" r="1.6" fill="#000" />
          <path d="M6.5 14.5 Q12 20 17.5 14.5" stroke="#000" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
