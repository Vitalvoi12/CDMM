import type { CalendarEvent, Subject } from '../../types';
import { timeFromDate } from '../../utils/time';
import { contrastOn, eventFillColor, isDarkTheme, pageBackground } from '../../utils/color';

interface TimelineEventProps {
  event: CalendarEvent;
  top: number;
  height: number;
  hourHeight?: number;
  subject?: Subject;
  onClick?: (e?: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent<HTMLElement>) => void;
  onDragStart?: (e: React.MouseEvent) => void;
  onResizeStart?: (e: React.MouseEvent) => void;
  isMobile?: boolean;
}

export function TimelineEvent({ event, top, height, hourHeight = 96, subject, onClick, onTouchStart, onDragStart, onResizeStart, isMobile = false }: TimelineEventProps) {
  const plan = event.kind === 'plan';
  const tiny = height < hourHeight * 0.25;
  const roomy = height >= hourHeight * 0.42;
  // 30-minute events (height ≈ hourHeight/2) must stay resizable, so the
  // handle appears well below the old 2/3-hour cutoff.
  const resizable = height >= hourHeight * 0.3;

  const color = subject?.color || 'var(--color-on-surface-variant)';
  const displayName = subject?.name || event.title || 'Untitled';
  // Planned events are a solid fill — custom color for subject-less events,
  // otherwise the subject color. Foreground picked for contrast.
  const fill = eventFillColor(event, subject);
  // Dark themes: text in the page-background color; light themes: contrast.
  const fgStyle = plan ? { color: isDarkTheme() ? pageBackground() : contrastOn(fill) } : undefined;

  // Apple-Calendar look: solid muted fill with a brighter spine on the
  // left. Real events mute the subject color; plans keep full fill.
  const mutedFill = `color-mix(in srgb, ${color} 42%, var(--color-surface-dim))`;
  const spineColor = plan ? 'rgb(255 255 255 / 0.28)' : color;

  // Height-adaptive corners: short/compressed boxes get visibly smaller radii,
  // while taller boxes can keep the reference radius. Mobile caps lower.
  const shellRadius = Math.max(2, Math.min(isMobile ? 4 : 7, height / 6));
  const shellRadiusPx = `${shellRadius}px`;
  // Leave a couple of pixels before the event's nominal end so back-to-back
  // events do not visually merge.
  const visualHeight = Math.max(height - 2, 2);
  const spineStyle: React.CSSProperties = {
    backgroundColor: spineColor,
    borderTopLeftRadius: shellRadiusPx,
    borderBottomLeftRadius: shellRadiusPx,
  };

  const baseStyle: React.CSSProperties = plan
    ? {
        top: `${top}px`,
        height: `${visualHeight}px`,
        backgroundColor: fill,
        borderRadius: shellRadiusPx,
      }
    : {
        top: `${top}px`,
        height: `${visualHeight}px`,
        backgroundColor: mutedFill,
        borderRadius: shellRadiusPx,
      };

  const shellClass =
    'absolute right-[6px] w-[calc(100%-1.25rem)] lg:w-[calc(100%-2.25rem)] ml-auto overflow-hidden cursor-pointer max-lg:[touch-action:none] max-lg:select-none group';

  const spineClass = 'absolute left-0 top-0 bottom-0 w-[3px]';

  if (tiny) {
    return (
      <div className={shellClass} style={baseStyle} onClick={onClick} onTouchStart={onTouchStart} onContextMenu={(e) => e.preventDefault()} onMouseDown={onDragStart}>
        <div className={spineClass} style={spineStyle} />
        <div className="flex items-center h-full pl-3 min-w-0">
          <span className="font-['Inter'] text-[12px] leading-[16px] max-lg:!text-[8px] max-lg:leading-none truncate font-semibold tracking-tight min-w-0 text-on-surface" style={fgStyle}>
            {displayName}
          </span>
        </div>
      </div>
    );
  }

  if (!roomy) {
    return (
      <div className={shellClass} style={baseStyle} onClick={onClick} onTouchStart={onTouchStart} onContextMenu={(e) => e.preventDefault()} onMouseDown={onDragStart}>
        <div className={spineClass} style={spineStyle} />
        <div className="flex flex-col items-start justify-center h-full pl-3 pr-2 min-w-0">
          <span className="font-['Inter'] text-[12px] leading-[16px] max-lg:!text-[8px] max-lg:leading-none truncate font-semibold tracking-tight min-w-0 max-w-full text-on-surface" style={fgStyle}>
            {displayName}
          </span>
          <span className="font-body-sm text-body-sm max-lg:!text-[7px] max-lg:leading-none text-on-surface-variant tabular-nums truncate max-w-full" style={fgStyle}>
            {timeFromDate(event.start)} - {timeFromDate(event.end)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass} style={baseStyle} onClick={onClick} onTouchStart={onTouchStart} onContextMenu={(e) => e.preventDefault()} onMouseDown={onDragStart}>
      <div className={spineClass} style={spineStyle} />
      <div className="flex flex-col items-start p-2.5 pl-3 max-lg:pl-3 max-lg:pr-2 max-lg:pt-1.5 max-lg:pb-1.5 min-w-0">
        <span className="font-['Inter'] text-[12px] leading-[16px] max-lg:!text-[8px] max-lg:leading-none font-semibold tracking-tight truncate max-w-full text-on-surface" style={fgStyle}>
          {displayName}
        </span>
        <span className="font-body-sm text-body-sm max-lg:!text-[7px] max-lg:leading-none text-on-surface-variant tabular-nums truncate max-w-full mt-0.5" style={fgStyle}>
          {timeFromDate(event.start)} - {timeFromDate(event.end)}
        </span>
      </div>
      {resizable && (
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
