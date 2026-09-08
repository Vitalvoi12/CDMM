import type { CalendarEvent, Subject } from '../../types';
import { timeFromDate } from '../../utils/time';

interface TimelineEventProps {
  event: CalendarEvent;
  top: number;
  height: number;
  hourHeight?: number;
  subject?: Subject;
  onClick?: (e?: React.MouseEvent) => void;
  onDragStart?: (e: React.MouseEvent) => void;
  onResizeStart?: (e: React.MouseEvent) => void;
}

export function TimelineEvent({ event, top, height, hourHeight = 96, subject, onClick, onDragStart, onResizeStart }: TimelineEventProps) {
  const plan = event.kind === 'plan';
  const tiny = height < hourHeight * 0.25;
  const roomy = height >= hourHeight * 0.42;
  const tall = height >= hourHeight * 0.67;

  const baseStyle: React.CSSProperties = {
    top: `${top}px`,
    height: `${height}px`,
    backgroundColor: subject?.color ? `${subject.color}15` : undefined,
    border: plan ? '1px dashed var(--color-outline-variant)' : undefined,
  };

  const colorBar = subject?.color || "var(--color-on-surface-variant)";

  if (tiny) {
    return (
      <div
        className="absolute right-[2px] w-[calc(100%-1rem)] lg:w-[calc(100%-2rem)] ml-auto rounded overflow-hidden cursor-pointer group"
        style={baseStyle}
        onClick={onClick}
        onMouseDown={onDragStart}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-[6px] max-lg:w-[5px]"
          style={{ backgroundColor: colorBar }}
        />
        <div className="flex items-center h-full pl-3 min-w-0">
          <span className="font-label-sm text-label-sm max-lg:!text-[10px] max-lg:leading-none truncate font-semibold min-w-0" style={{ color: subject?.color || "var(--color-on-surface)" }}>
            {subject?.name || 'Unknown'}
          </span>
        </div>
      </div>
    );
  }

  if (!roomy) {
    return (
      <div
        className="absolute right-[2px] w-[calc(100%-1rem)] lg:w-[calc(100%-2rem)] ml-auto rounded overflow-hidden cursor-pointer group"
        style={baseStyle}
        onClick={onClick}
        onMouseDown={onDragStart}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-[6px] max-lg:w-[5px]"
          style={{ backgroundColor: colorBar }}
        />
        <div className="flex items-start justify-between h-full pl-3 pt-1 pr-3 gap-2 min-w-0">
          <span className="font-label-sm text-label-sm max-lg:!text-[10px] max-lg:leading-none truncate font-semibold min-w-0" style={{ color: subject?.color || "var(--color-on-surface)" }}>
            {subject?.name || 'Unknown'}
          </span>
          <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant tabular-nums flex-shrink-0">
            {timeFromDate(event.start)} - {timeFromDate(event.end)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute right-[2px] w-[calc(100%-1rem)] lg:w-[calc(100%-2rem)] ml-auto rounded overflow-hidden cursor-pointer group bg-background border border-outline-variant"
      style={{ ...baseStyle, backgroundColor: 'var(--color-background)' }}
      onClick={onClick}
      onMouseDown={onDragStart}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[6px] max-lg:w-[5px]"
        style={{ backgroundColor: colorBar }}
      />
      <div className="flex justify-between items-start p-3 max-lg:pl-3 max-lg:pr-2 max-lg:pt-1.5 max-lg:pb-1.5 max-lg:gap-2 min-w-0">
        <div className="flex flex-col items-start gap-1 max-lg:gap-0.5 min-w-0">
          <span className="font-label-sm text-label-sm max-lg:!text-[10px] max-lg:leading-none font-bold truncate" style={{ color: subject?.color || "var(--color-on-surface)" }}>
            {subject?.name || 'Unknown'}
          </span>
          {tall && event.description && (
            <p className="hidden lg:block font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
              {event.description}
            </p>
          )}
        </div>
        <span className="font-label-sm text-label-sm max-lg:!text-[8px] max-lg:leading-none text-on-surface-variant tabular-nums flex-shrink-0 ml-4">
          {timeFromDate(event.start)} - {timeFromDate(event.end)}
        </span>
      </div>
      {tall && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={onResizeStart}
        >
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-outline-variant rounded-full" />
        </div>
      )}
    </div>
  );
}