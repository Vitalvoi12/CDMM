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
        return formatFullDate(currentDate);
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
    <header className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <button
          onClick={onPrev}
          className="p-1 text-on-background hover:bg-surface-container-low transition-colors rounded"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>
        <h1 className="font-headline-lg text-headline-lg text-on-background tracking-tight">
          {getViewTitle()}
        </h1>
        <button
          onClick={onNext}
          className="p-1 text-on-background hover:bg-surface-container-low transition-colors rounded"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
      </div>
      <button
        onClick={onToday}
        className="px-4 py-2 bg-surface-container-lowest border border-outline-variant text-on-background font-label-md text-label-md rounded hover:bg-surface-container-low transition-colors uppercase tracking-widest"
      >
        Today
      </button>
    </header>
  );
}
