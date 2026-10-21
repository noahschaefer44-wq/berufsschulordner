import type { Kind } from './engine';

/** Insekten-Symbole, gezeichnet in einem Quadrat von etwa ±17 Einheiten. */
export function Glyph({ kind }: { kind: Kind }) {
  switch (kind) {
    case 'Q': return (
      <g className="gl">
        <ellipse className="wing" cx="-9" cy="-5" rx="8.5" ry="4.6" transform="rotate(-32 -9 -5)" />
        <ellipse className="wing" cx="9" cy="-5" rx="8.5" ry="4.6" transform="rotate(32 9 -5)" />
        <ellipse className="body" cx="0" cy="4" rx="7.2" ry="11" />
        <path className="stripe" d="M-6.6 2H6.6M-6 8H6M-4.4 13H4.4" />
        <circle className="body" cx="0" cy="-9" r="4.6" />
        <path className="crown" d="M-4.6 -13L-4 -19L-1.6 -15.6L0 -19.6L1.6 -15.6L4 -19L4.6 -13Z" />
      </g>
    );
    case 'B': return (
      <g className="gl">
        <path className="line" d="M-9 -6L-13 -9M9 -6L13 -9M-10 2L-14 2M10 2L14 2M-8 10L-12 14M8 10L12 14" />
        <ellipse className="body" cx="0" cy="3" rx="10.5" ry="13" />
        <path className="stripe" d="M0 -9V16" />
        <path className="body" d="M-4.5 -10L-2.2 -17.5L0 -12L2.2 -17.5L4.5 -10Z" />
      </g>
    );
    case 'S': return (
      <g className="gl">
        <path className="line" d="M-4 -3L-12 -10L-16 -4M-5 0L-15 0L-17 6M-4 3L-12 10L-14 15M-3 6L-7 14L-6 18M4 -3L12 -10L16 -4M5 0L15 0L17 6M4 3L12 10L14 15M3 6L7 14L6 18" />
        <circle className="body" cx="0" cy="-5" r="4.6" />
        <ellipse className="body" cx="0" cy="5.5" rx="6.4" ry="8" />
        <circle className="eye" cx="-1.8" cy="-6" r="1" /><circle className="eye" cx="1.8" cy="-6" r="1" />
      </g>
    );
    case 'A': return (
      <g className="gl">
        <path className="line" d="M-3 -7L-9 -13M3 -7L9 -13M-3 -1L-13 -3M3 -1L13 -3M-3 3L-11 11M3 3L11 11M-1.5 -16L-5 -19M1.5 -16L5 -19" />
        <circle className="body" cx="0" cy="-12" r="4" />
        <ellipse className="body" cx="0" cy="-2" rx="3.8" ry="5" />
        <ellipse className="body" cx="0" cy="10" rx="5.8" ry="7.4" />
      </g>
    );
    case 'G': return (
      <g className="gl">
        <path className="line" d="M3 4L10 -2L14 8L18 9M-3 6L-8 12L-6 17M2 -9L-3 -16M4 -9L8 -15" />
        <path className="body" d="M-13 6C-9 -2 3 -8 12 -5C8 2 -2 8 -13 6Z" />
        <circle className="body" cx="-13.5" cy="5" r="3.6" />
        <path className="stripe" d="M-8 2L0 -1M-3 3L4 0" />
        <circle className="eye" cx="-14.6" cy="4.2" r=".9" />
      </g>
    );
    case 'L': return (
      <g className="gl">
        <circle className="body ladybug" cx="0" cy="2" r="12.5" />
        <path className="stripe" d="M0 -10.5V14.5" />
        <circle className="dot" cx="-5.4" cy="-1.6" r="2.2" /><circle className="dot" cx="5.4" cy="-1.6" r="2.2" /><circle className="dot" cx="-5.6" cy="7" r="2" /><circle className="dot" cx="5.6" cy="7" r="2" />
        <path className="head" d="M-5 -10.5A5.5 4.2 0 0 1 5 -10.5Z" />
      </g>
    );
    default: return (
      <g className="gl">
        <ellipse className="wing" cx="-8" cy="-2" rx="9" ry="3.8" transform="rotate(-24 -8 -2)" />
        <ellipse className="wing" cx="8" cy="-2" rx="9" ry="3.8" transform="rotate(24 8 -2)" />
        <path className="line" d="M-2 4L-9 12L-11 18M2 4L9 12L11 18M-1 6L-4 16M1 6L4 16" />
        <ellipse className="body" cx="0" cy="3" rx="3.4" ry="9" />
        <circle className="body" cx="0" cy="-8.5" r="3.4" />
        <path className="line" d="M0 -11L0 -19" />
      </g>
    );
  }
}
