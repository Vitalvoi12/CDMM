import { useMemo, useState } from 'react';
import { StatTile } from '../stats/StatParts';
import { formatDuration, getMonthGrid } from '../../utils/time';
import type { YearOverview, YearOverviewDay, YearOverviewMonth } from '../../utils/yearOverview';

/** Monday-first, as getMonthGrid lays the days out. */
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Shade = 'focus' | 'plan';
const SHADE_KEY = 'cdmm.yearShade';

function readShade(): Shade {
  try {
    return localStorage.getItem(SHADE_KEY) === 'plan' ? 'plan' : 'focus';
  } catch {
    return 'focus';
  }
}

/** Whole hours past the first hour ("27h"), minutes below it ("45m"). */
function hrs(minutes: number): string {
  return minutes < 60 ? `${Math.round(minutes)}m` : `${Math.round(minutes / 60)}h`;
}

/** "2026-10-12" → "Oct 12". */
function md(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "Oct 12 · 4h 10m, 3 sessions · plan 5h" — the day's title and aria-label. */
function dayTitle(d: YearOverviewDay): string {
  if (d.isFuture) return `${md(d.date)}${d.plan > 0 ? ` · ${formatDuration(d.plan)} planned` : ''}`;
  const study = d.real > 0 ? `${formatDuration(d.real)}, ${plural(d.sessions, 'session')}` : 'no study';
  return `${md(d.date)} · ${study}${d.plan > 0 ? ` · plan ${formatDuration(d.plan)}` : ''}`;
}

function dayClass(d: YearOverviewDay, shade: Shade): string {
  const cls = ['yr-day'];
  if (d.isFuture) {
    cls.push('fut');
    if (d.plan > 0) cls.push('pl');
  } else {
    const level = shade === 'plan' ? d.planLevel : d.focusLevel;
    cls.push(level === null ? 'np' : `l${level}`);
  }
  if (d.isToday) cls.push('today');
  return cls.join(' ');
}

interface YearViewProps {
  date: Date;
  overview: YearOverview;
  /** Open the day view on the clicked day — the month view's own handler. */
  onDateSelect: (date: Date) => void;
}

/**
 * Desktop year: the year as a study overview. Seven numbers on top, twelve
 * month calendars tinted by focus (or by how much of the plan was kept), and
 * on the right the year by month and by subject. Every figure comes from
 * buildYearOverview, computed once per year and data change by the page.
 */
export function YearView({ date, overview, onDateSelect }: YearViewProps) {
  const year = date.getFullYear();
  const [shade, setShadeState] = useState<Shade>(readShade);
  const setShade = (s: Shade) => {
    setShadeState(s);
    try {
      localStorage.setItem(SHADE_KEY, s);
    } catch {
      // private mode / blocked storage: the choice lasts for this visit only
    }
  };

  const { totals, months } = overview;
  const now = new Date();
  const curMonth = now.getFullYear() === year ? now.getMonth() : -1;
  // A month is ahead when none of its days has come yet.
  const isAhead = (m: YearOverviewMonth) => m.pastDays === 0;

  // Subject order and colours for the stacked bars: the year's leaders first.
  const order = useMemo(
    () => ({
      ids: overview.subjects.map((s) => s.subjectId),
      color: new Map(overview.subjects.map((s) => [s.subjectId, s.color])),
      name: new Map(overview.subjects.map((s) => [s.subjectId, s.name])),
    }),
    [overview]
  );

  const mixOf = (m: YearOverviewMonth) =>
    order.ids
      .filter((id) => (m.bySubject[id] ?? 0) > 0)
      .map((id) => ({ id, minutes: m.bySubject[id], color: order.color.get(id) ?? '#8A857C', name: order.name.get(id) ?? 'Subject' }));

  const daysByMonth = useMemo(() => {
    const out: YearOverviewDay[][] = Array.from({ length: 12 }, () => []);
    for (const d of overview.days) out[Number(d.date.slice(5, 7)) - 1].push(d);
    return out;
  }, [overview]);

  // ---- tiles ----
  const t = totals;
  const keptPct = t.planMinutes > 0 ? Math.round((t.keptMinutes / t.planMinutes) * 100) : null;
  const tiles: { value: string; label: string; hint: string; title?: string }[] = [
    {
      value: t.focusMinutes > 0 ? hrs(t.focusMinutes) : '—',
      label: 'Focus this year',
      hint: t.activeDays > 0 ? `${formatDuration(t.avgPerActiveDay)} per active day` : 'no study yet',
      title: 'Real focus time that counts toward statistics',
    },
    {
      value: t.activeDays > 0 ? String(t.activeDays) : '—',
      label: 'Active days',
      hint: t.pastDays > 0 ? `of ${t.pastDays} so far` : 'nothing yet',
    },
    {
      value: t.sessions > 0 ? String(t.sessions) : '—',
      label: 'Sessions',
      hint: t.sessions > 0 ? `${formatDuration(t.avgSession)} on average` : 'none yet',
    },
    {
      value: keptPct !== null ? `${keptPct}%` : '—',
      label: 'Plan kept',
      hint: t.planMinutes > 0 ? `${hrs(t.keptMinutes)} of ${hrs(t.planMinutes)} planned` : 'no plan yet',
      title: 'Planned time that was actually studied',
    },
    {
      value: t.bestDay ? formatDuration(t.bestDay.minutes) : '—',
      label: 'Best day',
      hint: t.bestDay ? md(t.bestDay.date) : 'none yet',
    },
    {
      value: t.longestStreak.days > 0 ? plural(t.longestStreak.days, 'day') : '—',
      label: 'Longest streak',
      hint: t.longestStreak.from && t.longestStreak.to ? `${md(t.longestStreak.from)} – ${md(t.longestStreak.to)}` : 'none yet',
    },
    {
      value: t.currentStreak.days > 0 ? plural(t.currentStreak.days, 'day') : '—',
      label: 'Current streak',
      hint: t.currentStreak.since ? `since ${md(t.currentStreak.since)}` : curMonth >= 0 ? 'starts with today’s session' : 'this year only',
    },
  ];

  // ---- by month ----
  const maxV = Math.max(0, ...months.map((m) => Math.max(m.real, m.plan)));
  const pct = (v: number) => (maxV > 0 ? (v / maxV) * 100 : 0);
  const best = months.reduce<YearOverviewMonth | null>((a, m) => (m.real > 0 && (!a || m.real > a.real) ? m : a), null);
  const next = curMonth >= 0 && curMonth < 11 ? months[curMonth + 1] : null;
  const monthNote = [
    best ? `Best month: ${MONTHS[best.month]}, ${hrs(best.real)}.` : '',
    next && next.plan > 0 ? `${MONTHS[next.month]} already has ${formatDuration(next.plan)} planned.` : '',
  ]
    .filter(Boolean)
    .join(' ') || (t.pastDays === 0 ? 'Nothing yet: this year is still ahead.' : 'No study logged this year.');

  const leader = overview.subjects[0]?.minutes ?? 0;

  return (
    <div className="@container flex-1 min-h-0 overflow-y-auto animate-view-enter">
      <div className="flex flex-col gap-6 pb-10">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-x-7 gap-y-4">
          {tiles.map((tile, i) => (
            <div key={tile.label} title={tile.title}>
              <StatTile value={tile.value} label={tile.label} hint={tile.hint} delay={i * 30} />
            </div>
          ))}
        </div>

        <div className="flex flex-col @min-[60rem]:flex-row gap-6 items-start">
          {/* Twelve months */}
          <section aria-label="Months" className="w-full min-w-0 @min-[60rem]:flex-1 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-caption text-on-surface-variant">Colour days by</span>
                <div className="seg sm" role="tablist" aria-label="Colour days by">
                  <button type="button" role="tab" aria-selected={shade === 'focus'} onClick={() => setShade('focus')}>
                    Focus time
                  </button>
                  <button type="button" role="tab" aria-selected={shade === 'plan'} onClick={() => setShade('plan')}>
                    Plan kept
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="text-meta text-on-surface-variant">{shade === 'plan' ? 'Missed' : 'Less'}</span>
                {[0, 1, 2, 3, 4].map((l) => (
                  <span key={l} className={`yr-swatch l${l}`} />
                ))}
                <span className="text-meta text-on-surface-variant">{shade === 'plan' ? 'Kept' : 'More'}</span>
                <span className="w-px h-[0.9rem] bg-outline-variant mx-2" />
                <span className="yr-swatch pl" />
                <span className="text-meta text-on-surface-variant">planned ahead</span>
              </div>
            </div>

            <div className="grid grid-cols-3 @min-[60rem]:grid-cols-4 gap-3.5">
              {months.map((m) => {
                const ahead = isAhead(m);
                const mix = ahead ? [] : mixOf(m);
                const mixTotal = mix.reduce((a, x) => a + x.minutes, 0);
                const days = daysByMonth[m.month];
                const name = MONTHS[m.month];
                return (
                  <section
                    key={m.month}
                    aria-label={name}
                    className={`min-w-0 rounded-[0.8rem] border bg-surface-container-lowest px-3.5 pt-3 pb-3.5 flex flex-col gap-2 ${
                      m.month === curMonth ? 'border-on-surface-variant' : 'border-outline-variant'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-control text-on-surface truncate">{name}</h3>
                      <span className={`text-meta tabular-nums whitespace-nowrap ${ahead ? 'text-on-surface-variant' : 'text-on-surface'}`}>
                        {ahead ? (m.plan > 0 ? `${hrs(m.plan)} planned` : '—') : m.real > 0 ? hrs(m.real) : '—'}
                      </span>
                    </div>
                    <div
                      title={mix.map((x) => `${x.name} ${hrs(x.minutes)}`).join(' · ') || undefined}
                      className="flex gap-px h-1 rounded-[2px] overflow-hidden bg-surface-container-high"
                    >
                      {mix.map((x) => (
                        <span key={x.id} className="h-full" style={{ width: `${(x.minutes / mixTotal) * 100}%`, background: x.color }} />
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-[2px]">
                      {DOW.map((d, i) => (
                        <span key={i} aria-hidden="true" className="text-center text-[9px] leading-[12px] font-semibold text-on-surface-variant">
                          {d}
                        </span>
                      ))}
                      {getMonthGrid(new Date(year, m.month, 1)).map((cell, i) => {
                        // Empty cells keep the weekday columns aligned.
                        if (!cell) return <span key={i} aria-hidden="true" />;
                        const d = days[cell.getDate() - 1];
                        const title = dayTitle(d);
                        return (
                          <button
                            key={i}
                            type="button"
                            className={dayClass(d, shade)}
                            title={title}
                            aria-label={title}
                            onClick={() => onDateSelect(cell)}
                          >
                            {cell.getDate()}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex justify-between gap-1 text-[11px] leading-[14px] text-on-surface-variant tabular-nums whitespace-nowrap min-h-[14px]">
                      <span>{m.pastDays > 0 ? `${m.activeDays} of ${m.pastDays} days` : ''}</span>
                      <span>{m.planPast > 0 ? `${Math.round((m.kept / m.planPast) * 100)}% of plan` : ''}</span>
                    </div>
                  </section>
                );
              })}
            </div>
          </section>

          {/* Right column; under the months on a narrower screen */}
          <aside className="w-full min-w-0 grid grid-cols-2 gap-6 items-start @min-[60rem]:flex @min-[60rem]:flex-col @min-[60rem]:items-stretch @min-[60rem]:w-[22rem] @min-[72rem]:w-[24rem] @min-[60rem]:flex-none">
            <section aria-label="By month" className="min-w-0 bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-5.5 flex flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-section text-on-surface">By month</h2>
                <span className="text-meta text-on-surface-variant flex items-center gap-1.5">
                  <span className="w-[0.7rem] h-[0.7rem] rounded-[2px] shadow-[inset_0_0_0_1px_var(--color-on-surface-variant)]" />
                  plan
                </span>
              </div>
              <div role="img" aria-label={`Focus per month in ${year}, against the plan`} className="flex items-end gap-1 h-36">
                {months.map((m) => {
                  const ahead = isAhead(m);
                  const mix = ahead ? [] : mixOf(m);
                  const name = MONTHS[m.month];
                  return (
                    <div
                      key={m.month}
                      title={`${name}: ${
                        ahead ? (m.plan > 0 ? `${hrs(m.plan)} planned` : 'nothing yet') : `${hrs(m.real)} of ${hrs(m.plan)} planned`
                      }`}
                      className="relative flex-1 h-full flex items-end"
                    >
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-t-[3px] shadow-[inset_0_0_0_1px_var(--color-on-surface-variant)] opacity-55"
                        style={{ height: `${pct(m.plan)}%` }}
                      />
                      <div
                        className={`relative w-full flex flex-col-reverse rounded-t-[3px] overflow-hidden ${m.month === curMonth ? '' : 'opacity-85'}`}
                        style={{ height: `${pct(m.real)}%` }}
                      >
                        {mix.map((x) => (
                          <span key={x.id} style={{ height: `${(x.minutes / m.real) * 100}%`, background: x.color }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1" aria-hidden="true">
                {months.map((m) => (
                  <span
                    key={m.month}
                    className={`flex-1 text-center text-[10.5px] leading-[13px] font-semibold ${
                      m.month === curMonth ? 'text-on-surface' : 'text-on-surface-variant'
                    }`}
                  >
                    {MONTHS[m.month][0]}
                  </span>
                ))}
              </div>
              <p className="text-meta text-on-surface-variant">{monthNote}</p>
            </section>

            <section aria-label="Subjects this year" className="min-w-0 bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-5.5 flex flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-section text-on-surface">Subjects this year</h2>
                <span className="text-meta text-on-surface-variant">goal met</span>
              </div>
              {overview.subjects.length === 0 ? (
                <p className="text-meta text-on-surface-variant">No study logged this year.</p>
              ) : (
                overview.subjects.map((s) => (
                  <div key={s.subjectId}>
                    <div className="flex items-baseline gap-2.5 mb-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 self-center" style={{ background: s.color }} />
                      <span className="text-body font-medium text-on-surface truncate flex-1 min-w-0">{s.name}</span>
                      <span className="text-control text-on-surface tabular-nums">{s.minutes > 0 ? hrs(s.minutes) : '—'}</span>
                      <span className="text-meta text-on-surface-variant tabular-nums w-[2.6rem] text-right">
                        {s.minutes > 0 ? `${Math.round(s.share * 100)}%` : '—'}
                      </span>
                      <span
                        className={`text-meta tabular-nums w-[3.4rem] text-right ${s.goalMinutes > 0 && s.weeksElapsed > 0 ? 'text-on-surface' : 'text-on-surface-variant'}`}
                        title={s.goalMinutes > 0 ? `Weekly goal ${formatDuration(s.goalMinutes)} met in ${s.weeksGoalMet} of ${s.weeksElapsed} weeks` : 'No weekly goal'}
                      >
                        {s.goalMinutes > 0 && s.weeksElapsed > 0 ? `${s.weeksGoalMet} / ${s.weeksElapsed}` : '—'}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-surface-container-high overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${leader > 0 ? (s.minutes / leader) * 100 : 0}%`, background: s.color }} />
                    </div>
                  </div>
                ))
              )}
              <p className="text-meta text-on-surface-variant">Goal met: weeks this year the subject reached its weekly goal.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
