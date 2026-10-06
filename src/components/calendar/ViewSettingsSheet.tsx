import type { CalendarView, EventFilter } from '../../types';
import { useEscapeOverlay } from '../../services/overlays';

interface ViewSettingsSheetProps {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  dayPanel: 'timeline' | 'stats' | 'tasks';
  onDayPanelChange: (panel: 'timeline' | 'stats' | 'tasks') => void;
  eventFilter: EventFilter;
  onEventFilterChange: (filter: EventFilter) => void;
  onClose: () => void;
}

/**
 * Views the mobile layout can render. Week stays out — its seven day columns
 * cannot be read on a phone. The month and year grids fit, and their days open
 * the day view, so the phone gets the same overview-to-detail path as a PC.
 */
const MOBILE_VIEWS = ['day', '3day', 'month', 'year'] as const;

const VIEW_LABELS: Record<(typeof MOBILE_VIEWS)[number], string> = {
  day: 'Day',
  '3day': '3D',
  month: 'Month',
  year: 'Year',
};

function pill(active: boolean): string {
  return `px-4 py-2 rounded-full font-label-sm text-label-sm uppercase tracking-[0.12em] transition-colors whitespace-nowrap ${
    active
      ? 'bg-secondary-container text-on-secondary-container'
      : 'text-on-surface-variant hover:text-on-surface'
  }`;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]">
        {label}
      </span>
      <div className="flex gap-1 border border-outline-variant rounded-full p-1 bg-surface-container-low self-start">
        {children}
      </div>
    </div>
  );
}

/**
 * Mobile-only bottom sheet replacing the three toolbar pill rows
 * (view, day panel, event filter). Opens from the tune icon next to Today.
 */
export function ViewSettingsSheet({
  view,
  onViewChange,
  dayPanel,
  onDayPanelChange,
  eventFilter,
  onEventFilterChange,
  onClose,
}: ViewSettingsSheetProps) {
  useEscapeOverlay(onClose);

  return (
    <div className="fixed inset-0 z-[100] lg:hidden animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="View settings"
        className="absolute inset-x-0 bottom-0 bg-surface-container-lowest rounded-t-2xl border-t border-outline-variant p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-elev-3 flex flex-col gap-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md !text-[16px] text-on-surface">
            View settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close view settings"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <Section label="View">
          {MOBILE_VIEWS.map((v) => (
            <button key={v} type="button" onClick={() => onViewChange(v)} className={pill(view === v)}>
              {VIEW_LABELS[v]}
            </button>
          ))}
        </Section>

        {view === 'day' && (
          <Section label="Panel">
            {(['timeline', 'stats', 'tasks'] as const).map((p) => (
              <button key={p} type="button" onClick={() => onDayPanelChange(p)} className={pill(dayPanel === p)}>
                {p === 'timeline' ? 'Day' : p === 'stats' ? 'Stat' : 'Tasks'}
              </button>
            ))}
          </Section>
        )}

        <Section label="Show">
          {(['real', 'plan', 'all'] as const).map((f) => (
            <button key={f} type="button" onClick={() => onEventFilterChange(f)} className={pill(eventFilter === f)}>
              {f === 'real' ? 'Real' : f === 'plan' ? 'Plan' : 'All'}
            </button>
          ))}
        </Section>
      </div>
    </div>
  );
}
