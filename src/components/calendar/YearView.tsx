import { useMemo } from 'react';
import { dateKey, getMonthGrid } from '../../utils/time';

/**
 * Single-letter weekday headers: a month mini-grid inside a year is far too
 * narrow for "Mon", and the repeats read correctly because the row is
 * positioned under the week it names.
 */
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface YearViewProps {
  date: Date;
  /** Jump to the day view for the tapped day — the month view's own handler. */
  onDateSelect: (date: Date) => void;
}

/**
 * The year as twelve plain month calendars — month name, weekday row, day
 * numbers. Nothing else: no study totals, no activity bars, no events.
 *
 * Every day is a button that hands its date back, so the year is a way in
 * rather than a picture: tap a number and the day view opens on it, the same
 * as tapping a cell in the month view.
 *
 * The days come from `getMonthGrid`, the same helper the month view uses, so
 * the Monday-first padding and the leap years cannot drift apart between the
 * two views.
 */
export function YearView({ date, onDateSelect }: YearViewProps) {
  const todayKey = dateKey(new Date());
  const year = date.getFullYear();

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const monthDate = new Date(year, i, 1);
        return {
          monthDate,
          name: monthDate.toLocaleDateString('en-US', { month: 'long' }),
          cells: getMonthGrid(monthDate),
        };
      }),
    [year]
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto animate-view-enter">
      {/* Two months per row everywhere, so on a phone the day cell lands at
          ~22px. That is well under the ~44px a comfortable tap wants, and the
          width is what binds — seven columns simply do not divide a phone any
          further. So the mobile card runs a step down in chrome (p-2, gap-2,
          type one step down) to buy back what the two columns cost, and `py-1`
          on the day buys height, the other half of a tap target. The desktop
          keeps its roomy p-5/gap-6 at three columns. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-6">
        {months.map(({ monthDate, name, cells }) => (
          <div
            key={monthDate.getMonth()}
            className="bg-surface-container-lowest border border-outline-variant rounded-xl p-2 lg:p-5"
          >
            <div className="mb-1 lg:mb-4 font-label-md text-label-md lg:font-headline-md lg:text-headline-md text-on-surface uppercase tracking-widest truncate">
              {name}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 lg:gap-y-1">
              {DOW.map((d, i) => (
                <span
                  key={i}
                  className="text-center font-label-sm text-label-sm lg:font-label-md lg:text-label-md text-on-surface-variant opacity-60"
                >
                  {d}
                </span>
              ))}
              {cells.map((d, i) =>
                // Empty cells are real spans: skipping them would shift every
                // later day one column left and break the weekday alignment.
                d ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onDateSelect(d)}
                    // The cell shows a bare number, which a screen reader would
                    // announce as a list of nameless numbers — spell the date out.
                    aria-label={`${name} ${d.getDate()}, ${year}`}
                    // Tailwind's preflight already zeroes padding and border on every
                    // element, so the only padding here is the mobile py-1 that
                    // widens the tap target.
                    className={`py-1 lg:py-0 text-center font-body-sm text-body-sm lg:font-body-md lg:text-body-md tabular-nums rounded-md transition-colors hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      dateKey(d) === todayKey
                        ? 'text-primary font-bold'
                        : 'text-on-surface'
                    }`}
                  >
                    {d.getDate()}
                  </button>
                ) : (
                  <span key={i} aria-hidden="true" />
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}