import { useId, type CSSProperties } from 'react';

export function TaskProgress({ value = 0 }: { value?: number }) {
  const progress = Math.max(0, Math.min(100, value));
  return (
    <span className="flex items-center gap-2 mt-1 w-full max-w-48 no-underline">
      <span role="progressbar" aria-label="Task progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="block h-1 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
        <span className="block h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </span>
      <span className="text-[11px] leading-4 tabular-nums text-on-surface-variant">{progress}%</span>
    </span>
  );
}

export function TaskProgressField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const id = useId();
  const change = (raw: string) => onChange(Math.round(Math.max(0, Math.min(100, Number(raw) || 0))));
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-label-sm text-label-sm lg:text-caption uppercase tracking-[0.16em] text-on-surface-variant max-lg:m-lbl">
        Progress
      </label>
      <div className="grid h-11 grid-cols-[minmax(0,1fr)_4.5rem] gap-2 lg:h-10">
        <div className="min-w-0 rounded-xl border border-outline-variant bg-surface-container-low px-3 focus-within:border-primary">
          <input
            id={id}
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(e) => change(e.target.value)}
            style={{ '--task-progress': `${value}%` } as CSSProperties}
            className="task-progress-slider block h-full w-full cursor-pointer rounded-lg focus-visible:outline-primary"
          />
        </div>
        <span className="flex items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-low px-2.5 text-on-surface-variant focus-within:border-primary">
          <input
            type="number"
            aria-label="Progress percentage"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(e) => change(e.target.value)}
            className="task-progress-number h-full w-full min-w-0 bg-transparent text-right text-base tabular-nums text-on-surface outline-none lg:text-[13px]"
          />
          <span aria-hidden="true" className="text-[13px]">%</span>
        </span>
      </div>
    </div>
  );
}
