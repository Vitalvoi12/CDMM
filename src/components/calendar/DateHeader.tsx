import { formatFullDate, addDays, startOfWeek } from '../../utils/time';

interface DateHeaderProps {
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  view: string;
  /** Middle slot (e.g. the view switcher) — centered between title and Today. */
  center?: React.ReactNode;
  /** Right slot (e.g. the event filter) — just left of the Today button. */
  right?: React.ReactNode;
}

export function DateHeader({ currentDate, onPrev, onNext, onToday, view, center, right }: DateHeaderProps) {
  const getViewTitle = () => {
    switch (view) {
      case 'day':
        return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      case '3day': {
        const end = addDays(currentDate, 2);
        return `${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${formatFullDate(end)}`;
      }
      case 'week': {
        const ws = startOfWeek(currentDate);
        const we = addDays(ws, 6);
        const sameMonth = ws.getMonth() === we.getMonth();
        if (sameMonth) {
          return `${ws.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { day: 'numeric', year: 'numeric' })}`;
        }
        return `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${formatFullDate(we)}`;
      }
      case 'month':
        return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      case 'year':
        return String(currentDate.getFullYear());
      default:
        return formatFullDate(currentDate);
    }
  };

  return (
    <header className="flex items-center gap-4 mb-5 max-lg:mb-2 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          onClick={onPrev}
          aria-label="Previous"
          className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors rounded-lg flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[16px] max-lg:text-[14px]">chevron_left</span>
        </button>
        <h1 className="font-headline-md text-headline-md max-lg:!text-[14px] max-lg:leading-tight text-on-surface tracking-tight truncate">
          {getViewTitle()}
        </h1>
        <button
          onClick={onNext}
          aria-label="Next"
          className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors rounded-lg flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[16px] max-lg:text-[14px]">chevron_right</span>
        </button>
      </div>
      {center && (
        <div className="flex-shrink-0 max-lg:hidden">
          {center}
        </div>
      )}
      <div className="flex-1 max-lg:hidden" />
      {right && (
        <div className="flex-shrink-0 max-lg:hidden">
          {right}
        </div>
      )}
      <button
        onClick={onToday}
        className="px-5 py-2 max-lg:px-3 max-lg:py-1 max-lg:!text-[9px] bg-transparent border border-outline-variant text-on-surface-variant font-label-md text-label-md rounded-lg hover:text-on-surface hover:border-outline transition-colors uppercase tracking-[0.12em] flex-shrink-0"
      >
        Today
      </button>
    </header>
  );
}
