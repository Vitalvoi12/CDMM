import { useCallback, useEffect, useState } from 'react';
import { Toggle } from '../common/Toggle';
import { useEscapeOverlay } from '../../services/overlays';
import {
  GROUPS,
  SHORTCUTS,
  anyChanged,
  findConflict,
  isAssignableCode,
  isChanged,
  keyLabel,
  replaceShortcutKey,
  resetAllShortcuts,
  resetShortcut,
  setKeyHints,
  setShortcutKeys,
  setSingleKeyShortcuts,
  shortcutKeys,
  useShortcutSettings,
  type Combo,
  type ShortcutDef,
  type ShortcutId,
} from '../../services/shortcuts';

/** A key press waiting for "Replace": it already belongs to `other`. */
interface Pending {
  id: ShortcutId;
  code: string;
  other: ShortcutDef;
}

const TEXT_BUTTON =
  'font-label-sm text-[11px] leading-[13px] font-bold uppercase tracking-[0.1em] text-on-surface-variant hover:text-on-surface px-1.5 py-1 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';

function Combos({ combos, pair, fixed }: { combos: Combo[]; pair?: boolean; fixed?: boolean }) {
  return (
    <>
      {combos.map((combo, i) => (
        <span key={combo.join('+')} className="flex items-center gap-1">
          {i > 0 && <span className="text-on-surface-variant text-[11px] px-0.5">{pair ? '/' : 'or'}</span>}
          {combo.map((k) => (
            <span key={k} className={`kbd ${fixed ? '!bg-transparent !text-on-surface-variant' : ''}`}>
              {keyLabel(k)}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}

/**
 * Settings → Shortcuts (desktop): every keyboard shortcut by where it works,
 * each editable key recorded by pressing it. Saved on this device.
 */
export function ShortcutsPanel() {
  const settings = useShortcutSettings();
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const stopRecording = useCallback(() => setRecording(null), []);

  const assign = useCallback((id: ShortcutId, code: string) => {
    setRecording(null);
    if (shortcutKeys(id).length === 1 && shortcutKeys(id)[0] === code) return;
    const other = findConflict(id, code);
    if (other) setPending({ id, code, other });
    else setShortcutKeys(id, [code]);
  }, []);

  // While recording, every key press belongs to the recorder (capture phase,
  // so it never reaches a shortcut). Esc is left to the overlay stack below.
  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        setShortcutKeys(recording, []);
        setRecording(null);
        return;
      }
      if (isAssignableCode(e.code)) assign(recording, e.code);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, assign]);

  return (
    <div className="mb-20 flex flex-col gap-6 max-w-2xl">
      <div className="flex items-end justify-between gap-4 lg:sticky lg:top-0 lg:z-10 lg:bg-background lg:pt-12 lg:pb-2">
        <div className="flex flex-col gap-1">
          <h1 className="font-headline-lg text-[30px] leading-[36px] text-on-surface">Shortcuts</h1>
          <p className="font-body-sm text-[13px] leading-[19px] text-on-surface-variant">
            Keys follow their position on the keyboard, so they work in any layout. Saved on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRecording(null);
            setPending(null);
            resetAllShortcuts();
          }}
          disabled={!anyChanged(settings)}
          className={`${TEXT_BUTTON} flex-shrink-0 flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none`}
        >
          <span className="material-symbols-outlined text-[14px] leading-none" aria-hidden="true">restart_alt</span>
          Reset all
        </button>
      </div>

      <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Toggle label="Single-key shortcuts" checked={settings.singleKey} onChange={setSingleKeyShortcuts} />
          <p className="font-body-sm text-[12px] leading-[17px] text-on-surface-variant px-1">
            Letters, digits and arrows. They never fire while you type in a field or a window is open.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Toggle label="Show key hints" checked={settings.hints} onChange={setKeyHints} />
          <p className="font-body-sm text-[12px] leading-[17px] text-on-surface-variant px-1">
            Small key labels next to the menu items, so the keys are easy to learn.
          </p>
        </div>
      </section>

      {GROUPS.map((group) => {
        const rows = SHORTCUTS.filter((s) => s.group === group.id);
        const dim = group.id !== 'builtin' && !settings.singleKey;
        return (
          <section
            key={group.id}
            aria-label={group.title}
            className={`bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 px-8 pt-6 pb-2 transition-opacity ${dim ? 'opacity-45' : ''}`}
          >
            <div className="flex items-baseline justify-between gap-4 mb-1">
              <h2 className="font-label-sm text-[12px] leading-[16px] font-bold text-on-surface-variant uppercase tracking-[0.16em]">{group.title}</h2>
              <span className="font-body-sm text-[12px] leading-[16px] text-on-surface-variant">{group.scope}</span>
            </div>
            {rows.map((row, i) => (
              <ShortcutRow
                key={row.id}
                def={row}
                first={i === 0}
                keys={shortcutKeys(row.id, settings)}
                changed={isChanged(row.id, settings)}
                recording={recording === row.id}
                pending={pending?.id === row.id ? pending : null}
                onRecord={() => {
                  setPending(null);
                  setRecording(row.id);
                }}
                onStopRecording={stopRecording}
                onReset={() => resetShortcut(row.id)}
                onReplace={() => {
                  if (!pending) return;
                  replaceShortcutKey(pending.id, pending.code, pending.other.id);
                  setPending(null);
                }}
                onCancelConflict={() => setPending(null)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

interface ShortcutRowProps {
  def: ShortcutDef;
  first: boolean;
  keys: string[];
  changed: boolean;
  recording: boolean;
  pending: Pending | null;
  onRecord: () => void;
  onStopRecording: () => void;
  onReset: () => void;
  onReplace: () => void;
  onCancelConflict: () => void;
}

function ShortcutRow({ def, first, keys, changed, recording, pending, onRecord, onStopRecording, onReset, onReplace, onCancelConflict }: ShortcutRowProps) {
  const keyText = keys.map(keyLabel).join(' or ');
  const defaultText = def.defaults.map((c) => keyLabel(c[c.length - 1])).join(' or ') || 'no key';
  const other = pending?.other;
  const otherLeft = other ? shortcutKeys(other.id).filter((c) => c !== pending.code) : [];
  const group = other && GROUPS.find((g) => g.id === other.group);

  return (
    <div className={first ? '' : 'border-t border-outline-variant'}>
      <div className="flex items-center gap-4 min-h-[2.8rem] py-1.5">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-body-md text-[14px] leading-[20px] text-on-surface">{def.label}</span>
          {changed && <span title="Changed from the default" className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
        </div>

        {changed && !recording && !pending && (
          <button type="button" onClick={onReset} title={`Back to ${defaultText}`} className={TEXT_BUTTON}>
            Reset
          </button>
        )}

        {def.fixed ? (
          <span className="flex items-center gap-1 p-1" title="Built in, can't be changed">
            <Combos combos={def.defaults} pair={def.pair} fixed />
            <span className="material-symbols-outlined text-[14px] leading-none text-on-surface-variant ml-1" aria-hidden="true">lock</span>
          </span>
        ) : recording ? (
          <>
            <RecordingEscape onCancel={onStopRecording} />
            <span className="font-body-sm text-[12px] leading-[16px] text-on-surface-variant">Esc cancels · Backspace clears</span>
            <span className="kbd-recording h-[1.9rem] px-3 inline-flex items-center border border-primary rounded-[0.6rem] font-label-sm text-[12px] font-semibold text-primary" role="status">
              Press a key…
            </span>
            <button type="button" onClick={onStopRecording} className={TEXT_BUTTON}>
              Cancel
            </button>
          </>
        ) : pending ? (
          <span className="h-[1.9rem] px-1 inline-flex items-center border border-error rounded-[0.6rem]">
            <span className="kbd !border-error">{keyLabel(pending.code)}</span>
          </span>
        ) : keys.length > 0 ? (
          <button
            type="button"
            onClick={onRecord}
            title="Change the key"
            aria-label={`${def.label}: ${keyText}. Change`}
            className="flex items-center gap-1 p-1 rounded-[0.6rem] border border-transparent hover:border-outline hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Combos combos={keys.map((k) => [k])} pair={def.pair} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onRecord}
            title="Pick a key"
            aria-label={`${def.label}: no key. Change`}
            className="flex items-center p-1 rounded-[0.6rem] border border-transparent hover:border-outline hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="h-6 px-2.5 inline-flex items-center border border-dashed border-outline rounded-[0.4rem] font-body-sm text-[12px] text-on-surface-variant">
              Not set
            </span>
          </button>
        )}
      </div>

      {pending && other && (
        <div role="alert" className="flex items-center gap-3 mb-2.5 px-3 py-2.5 rounded-[0.6rem] bg-error-container">
          <span className="material-symbols-outlined text-[16px] leading-none text-error" aria-hidden="true">error</span>
          <span className="flex-1 min-w-0 font-body-sm text-[13px] leading-[19px] text-on-error-container">
            {keyLabel(pending.code)} already {other.does} {group?.where}.{' '}
            {otherLeft.length === 0
              ? `Use ${keyLabel(pending.code)} here and leave ${other.short} without a key?`
              : `Use ${keyLabel(pending.code)} here and keep ${otherLeft.map(keyLabel).join(' or ')} for ${other.short}?`}
          </span>
          <button type="button" onClick={onReplace} className={`${TEXT_BUTTON} !text-on-error-container`}>
            Replace
          </button>
          <button type="button" onClick={onCancelConflict} className={TEXT_BUTTON}>
            Cancel
          </button>
        </div>
      )}
      {def.hint && <p className="font-body-sm text-[12px] leading-[17px] text-on-surface-variant -mt-1 mb-2.5">{def.hint}</p>}
    </div>
  );
}

/** While recording, Esc cancels it — through the overlay stack, so it closes nothing else. */
function RecordingEscape({ onCancel }: { onCancel: () => void }) {
  useEscapeOverlay(onCancel);
  return null;
}

