import type { ReactNode } from 'react';

/** Wii-U-GamePad-Rahmen um das Tippfeld der Spiele. */
export default function Pad({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="wu-pad" aria-label="GamePad – hier tippst du">
      <div className="wu-pad-top"><i /><span>{title}</span><i /></div>
      <div className="wu-pad-screen">{children}</div>
    </div>
  );
}

/** Glänzender Lebens-/Energiebalken. */
export function Gauge({ value, color = '#2fc96f', label }: { value: number; color?: string; label?: string }) {
  return (
    <div className="wu-gauge" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: `linear-gradient(180deg, color-mix(in srgb, ${color} 60%, #fff), ${color})` }} />
    </div>
  );
}
