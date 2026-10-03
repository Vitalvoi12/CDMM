import { Segmented } from './Segmented';
import { PERIOD_PRESETS, type PeriodPreset } from '../../utils/analytics';

interface PeriodSelectProps {
  preset: PeriodPreset;
  onChange: (preset: PeriodPreset) => void;
  customFrom: string;
  customTo: string;
  onCustomChange: (from: string, to: string) => void;
}

/**
 * The one period control of the screen. Every block below reads the range it
 * produces, so there is never a second, contradicting filter on the page.
 */
export function PeriodSelect({
  preset,
  onChange,
  customFrom,
  customTo,
  onCustomChange,
}: PeriodSelectProps) {
  const inputClass =
    'px-3 py-1.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface font-body-sm text-body-sm normal-case tracking-normal [color-scheme:light] dark:[color-scheme:dark]';

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <Segmented
        options={PERIOD_PRESETS.map((p) => ({ id: p.id, label: p.label }))}
        value={preset}
        onChange={onChange}
        ariaLabel="Statistics period"
      />
      {preset === 'custom' && (
        <div className="flex gap-2 items-center animate-fade-in">
          <label className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.12em]">
            From
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => {
                if (e.target.value) onCustomChange(e.target.value, customTo);
              }}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.12em]">
            To
            <input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => {
                if (e.target.value) onCustomChange(customFrom, e.target.value);
              }}
              className={inputClass}
            />
          </label>
        </div>
      )}
    </div>
  );
}
