import { useEffect, useState } from 'react';
import type { DeviceSignalSettings, SignalDevice, SignalKind, SignalMode, VibrationPattern } from '../../types';
import { settingsRepo } from '../../services/repositories';
import { subscribeSync, syncOnce } from '../../services/serverSync';
import { apiFetch } from '../../services/auth';
import { DEFAULT_SIGNALS, SIGNAL_KINDS, SIGNAL_MODES, VIBRATION_PATTERNS } from '../../services/signals';

const DEVICES: { id: SignalDevice; label: string }[] = [
  { id: 'phone', label: 'Phone' },
  { id: 'watch', label: 'Watch' },
];

const selectClass =
  'w-full min-w-0 appearance-none cursor-pointer bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2 px-3 max-lg:min-h-[40px] max-lg:!text-[16px] font-body-md text-[14px] text-on-surface outline-none transition-colors';

function readSignals(): DeviceSignalSettings {
  return settingsRepo.get().signals ?? DEFAULT_SIGNALS;
}

/**
 * Signals of the Android app and the Wear OS watch, plus pairing a watch.
 * The choices sync like the theme, so they can be set from any device.
 */
export function DevicesPanel({ mobile }: { mobile: boolean }) {
  const [signals, setSignals] = useState(readSignals);
  const [code, setCode] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairMessage, setPairMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => subscribeSync(() => setSignals(readSignals())), []);

  const change = (device: SignalDevice, key: SignalKind | 'pattern', value: SignalMode | VibrationPattern) => {
    const next = { ...signals, [device]: { ...signals[device], [key]: value } };
    setSignals(next);
    settingsRepo.setSignals(next);
    void syncOnce().catch(() => {
      // retried by the background sync
    });
  };

  const pair = async () => {
    setPairing(true);
    setPairMessage(null);
    try {
      const res = await apiFetch('/api/pair/confirm', { method: 'POST', body: JSON.stringify({ code }) });
      if (res.ok) {
        setCode('');
        setPairMessage({ ok: true, text: 'Watch paired. It signs in within a few seconds.' });
      } else {
        setPairMessage({ ok: false, text: res.status === 429 ? 'Too many tries, wait a minute.' : 'Wrong or expired code.' });
      }
    } catch {
      setPairMessage({ ok: false, text: 'Could not reach the server.' });
    } finally {
      setPairing(false);
    }
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
        <div className="grid items-center gap-x-2 gap-y-2" style={{ gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr)' }}>
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
        <span className={hint}>Both = vibrate and sound. Used by the CDMM Android app and the Wear OS watch app.</span>
      </div>

      <div className={card} style={cardStyle}>
        <span className={label}>Pair a watch</span>
        <span className={hint}>Open CDMM on the watch and type the 6-digit code it shows.</span>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) void pair();
          }}
        >
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            aria-label="Watch code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={`${selectClass} !w-[120px] flex-none tracking-[0.2em] text-center cursor-text`}
          />
          <button
            type="submit"
            disabled={code.length !== 6 || pairing}
            className={
              mobile
                ? 'm-btn'
                : 'px-6 py-2.5 rounded-full bg-primary text-on-primary font-label-md text-[13px] leading-[18px] uppercase tracking-[0.1em] disabled:opacity-50 hover:opacity-90 transition-opacity'
            }
          >
            {pairing ? 'Pairing…' : 'Pair'}
          </button>
        </form>
        {pairMessage && (
          <span role={pairMessage.ok ? 'status' : 'alert'} className={hint} style={{ color: pairMessage.ok ? 'var(--color-now)' : 'var(--color-error)' }}>
            {pairMessage.text}
          </span>
        )}
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
