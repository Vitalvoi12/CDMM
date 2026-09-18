import { formatFullDate, addDays, startOfWeek } from '../../utils/time';

interface DateHeaderProps {
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  view: string;
}

export function DateHeader({ currentDate, onPrev, onNext, onToday, view }: DateHeaderProps) {
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
    <header className="flex items-center justify-between mb-4 max-lg:mb-2 flex-shrink-0">
      <div className="flex items-center gap-4 min-w-0">
        <button
          onClick={onPrev}
          className="p-1 text-on-background hover:bg-surface-container-low transition-colors rounded flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[20px] max-lg:text-[18px]">chevron_left</span>
        </button>
        <h1 className="font-headline-lg text-headline-lg max-lg:!text-[17px] max-lg:leading-tight text-on-background tracking-tight truncate">
          {getViewTitle()}
        </h1>
        <button
          onClick={onNext}
          className="p-1 text-on-background hover:bg-surface-container-low transition-colors rounded flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[20px] max-lg:text-[18px]">chevron_right</span>
        </button>
      </div>
      <button
        onClick={onToday}
        className="px-4 py-2 max-lg:px-3 max-lg:py-1 max-lg:!text-[11px] max-lg:tracking-normal bg-surface-container-lowest border border-outline-variant text-on-background font-label-md text-label-md rounded hover:bg-surface-container-low transition-colors uppercase tracking-widest flex-shrink-0"
      >
        Today
      </button>
    </header>
  );
}
