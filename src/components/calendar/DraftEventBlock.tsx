interface DraftEventBlockProps {
  top: number;
  height: number;
  /** Range being dragged, in minutes since midnight. */
  startMinutes: number;
  endMinutes: number;
  isMobile?: boolean;
  /** Horizontal placement — matches the event blocks of the host view. */
  className?: string;
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Ghost block painted while the user press-drags to create an event. */
export function DraftEventBlock({ top, height, startMinutes, endMinutes, isMobile = false, className = 'left-0 right-[6px]' }: DraftEventBlockProps) {
  const boxHeight = Math.max(height - 2, 2);
  return (
    <div
      className={`absolute pointer-events-none overflow-hidden rounded-md border border-dashed border-primary bg-primary/20 flex flex-wrap items-center justify-center content-center gap-x-1 px-1 text-center ${className}`}
      style={{ top: `${top}px`, height: `${boxHeight}px`, zIndex: 30 }}
    >
      {/* Two spans so narrow (week) columns wrap onto two centred lines
          instead of truncating the end time. */}
      <span className={`font-['Inter'] font-semibold text-on-surface tabular-nums whitespace-nowrap ${isMobile ? 'text-[12px] leading-[15px]' : 'text-[16px] leading-5'}`}>
        {hhmm(startMinutes)} –
      </span>
      <span className={`font-['Inter'] font-semibold text-on-surface tabular-nums whitespace-nowrap ${isMobile ? 'text-[12px] leading-[15px]' : 'text-[16px] leading-5'}`}>
        {hhmm(endMinutes)}
      </span>
    </div>
  );
}
