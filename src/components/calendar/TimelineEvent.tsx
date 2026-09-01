import type { CalendarEvent, Subject } from '../../types';
import { timeFromDate } from '../../utils/time';

interface TimelineEventProps {
  event: CalendarEvent;
  top: number;
  height: number;
  hourHeight?: number;
  subject?: Subject;
  onClick?: () => void;
  onDragStart?: (e: React.MouseEvent) => void;
  onResizeStart?: (e: React.MouseEvent) => void;
}

export function TimelineEvent({ event, top, height, hourHeight = 96, subject, onClick, onDragStart, onResizeStart }: TimelineEventProps) {
  const full = height >= hourHeight;
  const medium = height >= hourHeight * 0.42;
  const tiny = height >= hourHeight * 0.25;

  const baseStyle: React.CSSProperties = {
    top: `${top}px`,
    height: `${height}px`,
    backgroundColor: subject?.color ? `${subject.color}15` : undefined,
    borderLeft: `3px solid ${subject?.color || '#999'}`,
  };

  if (!tiny) {
    return (
      <div
        className="absolute right-0 w-[calc(100%-1rem)] lg:w-[calc(100%-2rem)] ml-auto rounded overflow-hidden cursor-pointer group"
        style={baseStyle}
        onClick={onClick}
        onMouseDown={onDragStart}
      >
        <div className="flex items-center h-full px-2 min-w-0">
          <span className="font-label-sm text-label-sm max-lg:!text-[10px] max-lg:leading-none truncate font-semibold min-w-0" style={{ color: subject?.color || '#111' }}>
            {subject?.name || 'Unknown'}
          </span>
        </div>
      </div>
    );
  }

  if (!medium) {
    return (
      <div
        className="absolute right-0 w-[calc(100%-1rem)] lg:w-[calc(100%-2rem)] ml-auto rounded overflow-hidden cursor-pointer group"
        style={baseStyle}
        onClick={onClick}
        onMouseDown={onDragStart}
      >
        <div className="flex items-center h-full px-2 gap-2 min-w-0">
          <span className="font-label-sm text-label-sm max-lg:!text-[10px] max-lg:leading-none truncate font-semibold min-w-0" style={{ color: subject?.color || '#111' }}>
            {subject?.name || 'Unknown'}
          </span>
          <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant tabular-nums flex-shrink-0">
            {timeFromDate(event.start)}
          </span>
        </div>
      </div>
    );
  }

  if (!full) {
    return (
      <div
        className="absolute right-0 w-[calc(100%-1rem)] lg:w-[calc(100%-2rem)] ml-auto rounded overflow-hidden cursor-pointer group"
        style={baseStyle}
        onClick={onClick}
        onMouseDown={onDragStart}
      >
        <div className="flex items-center justify-between h-full px-3 gap-2 min-w-0">
          <span className="font-label-sm text-label-sm max-lg:!text-[10px] max-lg:leading-none truncate font-semibold min-w-0" style={{ color: subject?.color || '#111' }}>
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
      className="absolute right-0 w-[calc(100%-1rem)] lg:w-[calc(100%-2rem)] ml-auto bg-surface-container-low border border-outline-variant rounded hover:border-primary transition-colors cursor-pointer group"
      style={{ top: `${top}px`, height: `${height}px` }}
      onClick={onClick}
      onMouseDown={onDragStart}
    >
      <div className="flex justify-between items-start p-4 max-lg:p-2 max-lg:gap-2 min-w-0">
        <div className="min-w-0">
          <span
            className="inline-block px-2 py-1 max-lg:px-1.5 max-lg:py-0 max-lg:!text-[8px] max-lg:leading-none max-lg:tracking-normal max-lg:mb-1 rounded text-on-surface font-label-sm text-label-sm uppercase tracking-widest mb-2"
            style={{ backgroundColor: subject?.color ? `${subject.color}20` : undefined, color: subject?.color }}
          >
            {subject?.name || 'Unknown'}
          </span>
          <h3 className="font-headline-md text-headline-md max-lg:!text-[11px] max-lg:leading-tight text-on-background break-words">{event.title}</h3>
        </div>
        <span className="font-label-sm text-label-sm max-lg:!text-[8px] max-lg:leading-none text-on-surface-variant tabular-nums flex-shrink-0 ml-4">
          {timeFromDate(event.start)} - {timeFromDate(event.end)}
        </span>
      </div>
      {event.description && (
        <p className="px-4 max-lg:hidden mb-5 font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
          {event.description}
        </p>
      )}
      <div
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={onResizeStart}
      >
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-outline-variant rounded-full" />
      </div>
    </div>
  );
}
