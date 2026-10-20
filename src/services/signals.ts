import type { DeviceSignals, DeviceSignalSettings, SignalKind, SignalMode, VibrationPattern } from '../types';

export const SIGNAL_KINDS: { kind: SignalKind; label: string; hint: string }[] = [
  { kind: 'reminder', label: 'Event reminders', hint: 'The reminders set on an event' },
  { kind: 'start', label: 'Event starts', hint: 'Every event, at its start' },
  { kind: 'end', label: 'Event ends', hint: 'Every event, at its end' },
  { kind: 'todo', label: 'Task reminders', hint: 'The reminders set on a task' },
];

export const SIGNAL_MODES: { value: SignalMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'vibrate', label: 'Vibrate' },
  { value: 'sound', label: 'Sound' },
  { value: 'both', label: 'Both' },
];

export const VIBRATION_PATTERNS: { value: VibrationPattern; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'long', label: 'Long' },
  { value: 'double', label: 'Double' },
  { value: 'triple', label: 'Triple' },
];

/** Same defaults as the server (server/glance.mjs) and the Android app. */
export const DEFAULT_SIGNALS: DeviceSignalSettings = {
  phone: { reminder: 'both', start: 'off', end: 'off', todo: 'both', pattern: 'double' },
};

function device(raw: unknown, fallback: DeviceSignals): DeviceSignals {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...fallback };
  for (const { kind } of SIGNAL_KINDS) {
    if (SIGNAL_MODES.some((m) => m.value === src[kind])) out[kind] = src[kind] as SignalMode;
  }
  if (VIBRATION_PATTERNS.some((p) => p.value === src.pattern)) out.pattern = src.pattern as VibrationPattern;
  return out;
}

/** Remote settings arrive untrusted — fill gaps with the defaults. */
export function normalizeSignals(raw: unknown): DeviceSignalSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { phone: device(r.phone, DEFAULT_SIGNALS.phone) };
}
