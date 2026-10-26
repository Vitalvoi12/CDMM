interface PickerCardProps {
  label: string;
  /** What the card shows (e.g. "11:30", "11 Oct"). */
  display: string;
  type: 'time' | 'date';
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Small note under the value, e.g. "+1 day". */
  note?: string;
}

/**
 * A big tappable value (Starts / Ends / Date) over a transparent native
 * input, so a tap opens the system's own time or date wheel.
 */
export function PickerCard({ label, display, type, value, onChange, className = '', note }: PickerCardProps) {
  return (
    <label className={`m-card relative flex flex-col text-left ${className}`} style={{ padding: '8px 14px', background: 'var(--color-surface-container-low)' }}>
      <span className="m-lbl m-mut">{label}</span>
      <span className="m-h2 m-num">{display}</span>
      {note && <span className="m-sm m-mut">{note}</span>}
      {/* 16px, or iOS zooms the page when the hidden field takes focus. */}
      <input
        type={type}
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 w-full h-full opacity-0 text-[16px] cursor-pointer"
      />
    </label>
  );
}
