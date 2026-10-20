import { useEffect, useState } from 'react';
import type { DeviceSignalSettings, SignalDevice, SignalKind, SignalMode, VibrationPattern } from '../../types';
import { settingsRepo } from '../../services/repositories';
import { subscribeSync, syncOnce } from '../../services/serverSync';
import { DEFAULT_SIGNALS, SIGNAL_KINDS, SIGNAL_MODES, VIBRATION_PATTERNS } from '../../services/signals';

const DEVICES: { id: SignalDevice; label: string }[] = [
  { id: 'phone', label: 'Phone' },
];

const selectClass =
  'w-full min-w-0 appearance-none cursor-pointer bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2 px-3 max-lg:min-h-[40px] max-lg:!text-[16px] font-body-md text-[14px] text-on-surface outline-none transition-colors';

function readSignals(): DeviceSignalSettings {
  return settingsRepo.get().signals ?? DEFAULT_SIGNALS;
}

/**
 * Signals of the Android app.
 * The choices sync like the theme, so they can be set from any device.
 */
export function DevicesPanel({ mobile }: { mobile: boolean }) {
  const [signals, setSignals] = useState(readSignals);

  useEffect(() => subscribeSync(() => setSignals(readSignals())), []);

  const change = (device: SignalDevice, key: SignalKind | 'pattern', value: SignalMode | VibrationPattern) => {
    const next = { ...signals, [device]: { ...signals[device], [key]: value } };
    setSignals(next);
    settingsRepo.setSignals(next);
    void syncOnce().catch(() => {
      // retried by the background sync
    });
  };


  const label = mobile
    ? 'm-lbl m-mut'
    : 'font-label-sm text-[12px] leading-[16px] text-on-surface-variant uppercase tracking-[0.16em]';
  const hint = mobile ? 'm-sm m-mut' : 'font-body-sm text-[13px] leading-[19px] text-on-surface-variant';
  const card = mobile
    ? 'flex flex-col gap-3 p-3'
    : 'bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-8 flex flex-col gap-4 max-w-xl';
  const cardStyle = mobile
    ? { border: '1px solid var(--color-outline-variant)', borderRadius: 12, background: 'var(--color-surface-container-lowest)' }
    : undefined;

  return (
    <>
      <div className={card} style={cardStyle}>
        {!mobile && <span className={label}>Signals</span>}
        <div className="grid items-center gap-x-2 gap-y-2" style={{ gridTemplateColumns: `minmax(0,1.2fr) repeat(${DEVICES.length}, minmax(0,1fr))` }}>
          <span />
          {DEVICES.map((d) => (
            <span key={d.id} className={label}>{d.label}</span>
          ))}
          {SIGNAL_KINDS.map(({ kind, label: name, hint: sub }) => (
            <SignalRow key={kind} name={name} sub={sub} hintClass={hint}>
              {DEVICES.map((d) => (
                <select
                  key={d.id}
                  aria-label={`${name}, ${d.label}`}
                  className={selectClass}
                  value={signals[d.id][kind]}
                  onChange={(e) => change(d.id, kind, e.target.value as SignalMode)}
                >
                  {SIGNAL_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              ))}
            </SignalRow>
          ))}
          <SignalRow name="Vibration" sub="Pattern of every buzz" hintClass={hint}>
            {DEVICES.map((d) => (
              <select
                key={d.id}
                aria-label={`Vibration pattern, ${d.label}`}
                className={selectClass}
                value={signals[d.id].pattern}
                onChange={(e) => change(d.id, 'pattern', e.target.value as VibrationPattern)}
              >
                {VIBRATION_PATTERNS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            ))}
          </SignalRow>
        </div>
        <span className={hint}>Both = vibrate and sound. Used by the CDMM Android app.</span>
      </div>
    </>
  );
}

function SignalRow({ name, sub, hintClass, children }: { name: string; sub: string; hintClass: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex flex-col min-w-0">
        <span className="text-on-surface text-[14px] leading-[18px]">{name}</span>
        <span className={hintClass}>{sub}</span>
      </div>
      {children}
    </>
  );
}
