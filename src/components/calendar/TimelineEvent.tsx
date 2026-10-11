import type { CalendarEvent, Subject } from '../../types';
import { timeFromDate } from '../../utils/time';
import { contrastOn, eventFillColor, isDarkTheme, pageBackground } from '../../utils/color';
import { canResizeEvent, eventLayout, eventResizeZone } from '../../utils/eventDensity';

interface TimelineEventProps {
  event: CalendarEvent;
  top: number;
  height: number;
  subject?: Subject;
  onClick?: (e?: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent<HTMLElement>) => void;
  onDragStart?: (e: React.MouseEvent) => void;
  onResizeStart?: (e: React.MouseEvent) => void;
  isMobile?: boolean;
  /** Live time range shown while dragging/resizing (ISO strings); defaults to the event's own. */
  displayStart?: string;
  displayEnd?: string;
  /** Horizontal lane for overlapping blocks (see layoutOverlapLanes). */
  lane?: { left: number; width: number; z: number };
}

export function TimelineEvent({ event, top, height, subject, onClick, onTouchStart, onDragStart, onResizeStart, isMobile = false, lane, displayStart, displayEnd }: TimelineEventProps) {
  const plan = event.kind === 'plan';
  const excludedFromStats = event.countInStats === false;
  const statsTitle = excludedFromStats ? 'Excluded from statistics' : undefined;

  const color = eventFillColor(event, subject, 'var(--color-on-surface-variant)');
  // A block planned from a Checklist task also names the task.
  const taskText = event.taskId && subject ? event.description : undefined;
  const baseName = subject?.name || event.title || 'Untitled';
  const displayName = taskText ? `${baseName} · ${taskText}` : baseName;
  // Apple-Calendar look: solid muted fill with a brighter spine on the
  // left. Real events mute the subject color; plans keep full fill.
  const fill = eventFillColor(event, subject);
  // Dark themes: text in the page-background color; light themes: contrast.
  const fgStyle = plan ? { color: isDarkTheme() ? pageBackground() : contrastOn(fill) } : undefined;

  const mutedFill = `color-mix(in srgb, ${color} 42%, var(--color-surface-dim))`;
  const spineColor = plan ? 'rgb(255 255 255 / 0.28)' : color;

  // Leave a couple of pixels before the event's nominal end so back-to-back
  // events do not visually merge. Every layout decision below is made against
  // the height that is actually painted, not the nominal one.
  const boxHeight = Math.max(height - 2, 2);
  // Top-aligned whenever the block has room for it; centred only when it does
  // not. Resizing is available at ANY length, so the handle never depends on
  // this decision (that coupling made 1-hour blocks un-resizable).
  const layout = eventLayout(boxHeight, isMobile);

  // Height-adaptive corners: short/compressed boxes get visibly smaller radii,
  // while taller boxes can keep the reference radius. Mobile caps lower.
  const shellRadiusPx = `${Math.max(2, Math.min(isMobile ? 4 : 7, boxHeight / 6))}px`;
  const spineStyle: React.CSSProperties = {
    backgroundColor: spineColor,
    borderTopLeftRadius: shellRadiusPx,
    borderBottomLeftRadius: shellRadiusPx,
  };

  const baseStyle: React.CSSProperties = {
    top: `${top}px`,
    height: `${boxHeight}px`,
    backgroundColor: plan ? fill : mutedFill,
    borderRadius: shellRadiusPx,
  };

  const laneStyle: React.CSSProperties | undefined = lane
    ? { left: `${lane.left}%`, width: `calc(${lane.width}% - 6px)`, zIndex: lane.z }
    : undefined;
  const shellStyle: React.CSSProperties = { ...baseStyle, ...laneStyle };

  const shellBase =
    'absolute overflow-hidden cursor-pointer max-lg:[touch-action:pan-y] max-lg:select-none group ring-1 ring-inset ring-black/30 outline outline-1 outline-white/20';
  const shellClass = lane
    ? `${shellBase} w-auto`
    : `${shellBase} right-[6px] w-[calc(100%-1.25rem)] lg:w-[calc(100%-2.25rem)] ml-auto`;

  const spineClass = 'absolute left-0 top-0 bottom-0 w-[3px]';

  // Grab strip for the bottom resize handle. Rendered for every density: only
  // its geometry adapts to the box height.
  const zone = eventResizeZone(boxHeight, isMobile);
  const resizeHandle = canResizeEvent(boxHeight, isMobile) ? (
    <div
      className="absolute left-0 right-0 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
      style={{ bottom: 0, height: `${zone.height}px`, marginBottom: `${zone.offset}px` }}
      onMouseDown={onResizeStart}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1 bg-outline-variant rounded-full" />
    </div>
  ) : null;

  const timeRange = `${timeFromDate(displayStart ?? event.start)} - ${timeFromDate(displayEnd ?? event.end)}`;

  return (
    <div
      className={shellClass}
      style={shellStyle}
      data-event-id={event.id}
      title={statsTitle}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={onDragStart}
    >
      <div className={spineClass} style={spineStyle} />
      <div
        className="flex flex-col items-start h-full pl-3 pr-2 min-w-0"
        style={{
          paddingTop: `${layout.padTop}px`,
          justifyContent: layout.align === 'center' ? 'center' : 'flex-start',
        }}
      >
        <span
          className="font-['Inter'] text-[12px] leading-[16px] max-lg:!text-[8px] max-lg:leading-none truncate font-semibold tracking-tight min-w-0 max-w-full text-on-surface"
          style={fgStyle}
        >
          {displayName}
        </span>
        {layout.showTime && (
          <span
            className="font-body-sm text-body-sm max-lg:!text-[7px] max-lg:leading-none text-on-surface-variant tabular-nums truncate max-w-full mt-0.5"
            style={fgStyle}
          >
            {timeRange}
          </span>
        )}
      </div>
      {resizeHandle}
    </div>
  );
}
