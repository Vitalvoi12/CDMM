import { useSyncExternalStore } from 'react';

/**
 * Keyboard shortcuts: one registry for the keys the pages listen to, with
 * per-device overrides (Settings → Shortcuts).
 *
 * Keys are KeyboardEvent.code values — the physical key — so a shortcut
 * stays on the same key in any layout (R is still R on the Russian layout,
 * where it types "к").
 */

export type ShortcutGroup = 'global' | 'calendar' | 'todo' | 'builtin';

export type ShortcutId =
  | 'go-calendar'
  | 'go-todo'
  | 'go-stats'
  | 'go-subjects'
  | 'session'
  | 'session-start'
  | 'period'
  | 'view-day'
  | 'view-3day'
  | 'view-week'
  | 'view-month'
  | 'view-year'
  | 'filter-real'
  | 'filter-plan'
  | 'filter-all'
  | 'new-event'
  | 'new-task'
  | 'edit-note'
  | 'todo-new'
  | 'undo'
  | 'redo'
  | 'escape'
  | 'nudge';

/** One key combination as shown in Settings: modifier names, then the key's code. */
export type Combo = string[];

export interface ShortcutDef {
  id: ShortcutId;
  label: string;
  group: ShortcutGroup;
  /** Default keys (codes). For fixed shortcuts, the combos shown in Settings. */
  defaults: Combo[];
  /** Built in: shown, never changed. */
  fixed?: boolean;
  /** Separator between combos in Settings: "or" (default) or "/" (a pair). */
  pair?: boolean;
  /** What the key does, for conflict messages: "T already opens Todo …". */
  does?: string;
  /** Short name, for "… and leave Todo without a key?". */
  short?: string;
  /** Extra line under the row in Settings. */
  hint?: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'go-calendar', group: 'global', label: 'Open Calendar', defaults: [['KeyC']], does: 'opens Calendar', short: 'Calendar' },
  { id: 'go-todo', group: 'global', label: 'Open Todo', defaults: [['KeyT']], does: 'opens Todo', short: 'Todo' },
  { id: 'go-stats', group: 'global', label: 'Open Statistics', defaults: [['KeyS']], does: 'opens Statistics', short: 'Statistics' },
  { id: 'go-subjects', group: 'global', label: 'Open Subjects', defaults: [], does: 'opens Subjects', short: 'Subjects' },
  { id: 'session', group: 'global', label: 'Start a session, or finish the running one', defaults: [['KeyF']], does: 'starts or finishes a session', short: 'starting a session' },
  { id: 'session-start', group: 'global', label: 'Change when the running session started', defaults: [['KeyB']], does: 'changes when the session started', short: 'the session start' },

  { id: 'period', group: 'calendar', label: 'Previous / next period', defaults: [['ArrowLeft'], ['ArrowRight']], fixed: true, pair: true },
  { id: 'view-day', group: 'calendar', label: 'Day view', defaults: [['KeyD']], does: 'opens the day view', short: 'Day view' },
  { id: 'view-3day', group: 'calendar', label: '3-day view', defaults: [['Digit3']], does: 'opens the 3-day view', short: '3-day view' },
  { id: 'view-week', group: 'calendar', label: 'Week view', defaults: [['KeyW']], does: 'opens the week view', short: 'Week view' },
  { id: 'view-month', group: 'calendar', label: 'Month view', defaults: [['KeyM']], does: 'opens the month view', short: 'Month view' },
  { id: 'view-year', group: 'calendar', label: 'Year view', defaults: [], does: 'opens the year view', short: 'Year view' },
  { id: 'filter-real', group: 'calendar', label: 'Show real sessions only', defaults: [['KeyR']], does: 'shows real sessions only', short: 'the Real filter' },
  { id: 'filter-plan', group: 'calendar', label: 'Show planned events only', defaults: [['KeyP']], does: 'shows planned events only', short: 'the Plan filter' },
  { id: 'filter-all', group: 'calendar', label: 'Show real and plan together', defaults: [['KeyA']], does: 'shows real and plan together', short: 'the All filter' },
  { id: 'new-event', group: 'calendar', label: 'New event', defaults: [['KeyN']], does: 'creates an event', short: 'New event' },
  { id: 'new-task', group: 'calendar', label: 'New task in the day’s checklist', defaults: [['KeyV']], does: 'adds a checklist task', short: 'the checklist task' },
  { id: 'edit-note', group: 'calendar', label: 'Edit the day’s note', defaults: [['KeyI']], does: 'edits the day’s note', short: 'the note' },

  { id: 'todo-new', group: 'todo', label: 'New task', defaults: [['KeyN'], ['KeyA']], does: 'creates a task', short: 'New task' },

  { id: 'undo', group: 'builtin', label: 'Undo', defaults: [['Ctrl', 'KeyZ']], fixed: true },
  { id: 'redo', group: 'builtin', label: 'Redo', defaults: [['Ctrl', 'Shift', 'KeyZ'], ['Ctrl', 'KeyY']], fixed: true },
  { id: 'escape', group: 'builtin', label: 'Close the window or editor', defaults: [['Escape']], fixed: true },
  { id: 'nudge', group: 'builtin', label: 'Move a session start by 5 minutes', defaults: [['ArrowUp'], ['ArrowDown']], fixed: true, pair: true, hint: 'In the window that changes a session’s start.' },
];

export const GROUPS: { id: ShortcutGroup; title: string; scope: string; where: string }[] = [
  { id: 'global', title: 'Everywhere', scope: 'On every page', where: 'on every page' },
  { id: 'calendar', title: 'Calendar', scope: 'On the calendar page', where: 'on the calendar page' },
  { id: 'todo', title: 'Todo', scope: 'On the todo page', where: 'on the todo page' },
  { id: 'builtin', title: 'Built in', scope: 'Always on', where: 'everywhere' },
];

const BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function shortcutDef(id: ShortcutId): ShortcutDef {
  return BY_ID.get(id)!;
}

// ---- Per-device settings -------------------------------------------------

const STORAGE_KEY = 'cdmm.shortcuts';

export interface ShortcutSettings {
  /** Changed keys only, by shortcut id; [] = no key. */
  keys: Partial<Record<ShortcutId, string[]>>;
  /** Letters, digits and arrows without a modifier. */
  singleKey: boolean;
  /** Key labels next to the sidebar's menu items. */
  hints: boolean;
}

const DEFAULT_SETTINGS: ShortcutSettings = { keys: {}, singleKey: true, hints: false };

function load(): ShortcutSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
    const keys: ShortcutSettings['keys'] = {};
    for (const [id, codes] of Object.entries(raw.keys ?? {})) {
      const def = BY_ID.get(id as ShortcutId);
      if (def && !def.fixed && Array.isArray(codes)) keys[def.id] = codes.filter((c): c is string => typeof c === 'string');
    }
    return {
      keys,
      singleKey: raw.singleKey !== false,
      hints: raw.hints === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let settings: ShortcutSettings = load();
const listeners = new Set<() => void>();

function save(next: ShortcutSettings): void {
  settings = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — the change lasts until reload
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current settings; re-renders when they change. */
export function useShortcutSettings(): ShortcutSettings {
  return useSyncExternalStore(subscribe, () => settings);
}

export function setSingleKeyShortcuts(on: boolean): void {
  save({ ...settings, singleKey: on });
}

export function setKeyHints(on: boolean): void {
  save({ ...settings, hints: on });
}

/** Default keys of an editable shortcut, as plain codes. */
function defaultCodes(id: ShortcutId): string[] {
  return shortcutDef(id).defaults.map((c) => c[c.length - 1]);
}

/** Keys (codes) that trigger the shortcut on this device. */
export function shortcutKeys(id: ShortcutId, s: ShortcutSettings = settings): string[] {
  return s.keys[id] ?? defaultCodes(id);
}

export function isChanged(id: ShortcutId, s: ShortcutSettings = settings): boolean {
  const cur = s.keys[id];
  if (!cur) return false;
  const def = defaultCodes(id);
  return cur.length !== def.length || cur.some((c) => !def.includes(c));
}

export function anyChanged(s: ShortcutSettings = settings): boolean {
  return SHORTCUTS.some((d) => isChanged(d.id, s)) || s.singleKey !== DEFAULT_SETTINGS.singleKey || s.hints !== DEFAULT_SETTINGS.hints;
}

/** Set the shortcut's keys; back to the defaults drops the override. */
export function setShortcutKeys(id: ShortcutId, codes: string[]): void {
  const keys = { ...settings.keys, [id]: codes };
  if (!isChanged(id, { ...settings, keys })) delete keys[id];
  save({ ...settings, keys });
}

export function resetShortcut(id: ShortcutId): void {
  const keys = { ...settings.keys };
  delete keys[id];
  save({ ...settings, keys });
}

export function resetAllShortcuts(): void {
  save(DEFAULT_SETTINGS);
}

/**
 * Shortcuts that may not share a key with one in `group`: the same group,
 * and global against every page group. Page groups may share keys with each
 * other (N is New event on the calendar and New task on the todo page).
 */
function clashes(a: ShortcutGroup, b: ShortcutGroup): boolean {
  if (a === 'builtin' || b === 'builtin') return false;
  return a === b || a === 'global' || b === 'global';
}

/** The shortcut that already uses `code` where `id` would use it, if any. */
export function findConflict(id: ShortcutId, code: string, s: ShortcutSettings = settings): ShortcutDef | undefined {
  const group = shortcutDef(id).group;
  return SHORTCUTS.find((d) => d.id !== id && !d.fixed && clashes(group, d.group) && shortcutKeys(d.id, s).includes(code));
}

/** Give `code` to `id` alone, taking it from the shortcut it clashed with. */
export function replaceShortcutKey(id: ShortcutId, code: string, from: ShortcutId): void {
  const keys = { ...settings.keys, [from]: shortcutKeys(from).filter((c) => c !== code), [id]: [code] };
  for (const k of [id, from]) if (!isChanged(k, { ...settings, keys })) delete keys[k];
  save({ ...settings, keys });
}

/** Keys a shortcut can be set to: letters, digits and punctuation. */
export function isAssignableCode(code: string): boolean {
  return /^(Key[A-Z]|Digit[0-9]|Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash|Backquote)$/.test(code);
}

// ---- Matching --------------------------------------------------------------

/**
 * The key's code, or one made up from e.key for keyboards that send no
 * usable code (some on-screen keyboards), so letters and digits still match.
 */
function eventCode(e: KeyboardEvent): string {
  if (/^(Key[A-Z]|Digit[0-9])$/.test(e.code)) return e.code;
  const k = e.key;
  if (/^[a-z]$/i.test(k)) return `Key${k.toUpperCase()}`;
  if (/^[0-9]$/.test(k)) return `Digit${k}`;
  return e.code;
}

/** Whether single-key shortcuts (letters, digits, arrows) are on. */
export function singleKeysOn(): boolean {
  return settings.singleKey;
}

/**
 * Whether the key press triggers the shortcut. Only single keys: a press
 * with Ctrl, Cmd or Alt never matches (Shift is ignored, as before).
 */
export function matchShortcut(e: KeyboardEvent, id: ShortcutId): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || !settings.singleKey) return false;
  return shortcutKeys(id).includes(eventCode(e));
}

// ---- Labels ----------------------------------------------------------------

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: '\'',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
};

/** "KeyT" → "T", "Digit3" → "3", "Ctrl" → "⌘" on macOS. */
export function keyLabel(code: string): string {
  if (code === 'Ctrl') return IS_MAC ? '⌘' : 'Ctrl';
  if (code === 'Shift') return IS_MAC ? '⇧' : 'Shift';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return NAMES[code] ?? code;
}

/** The shortcut's keys for a tooltip ("N or A"), or '' with none set. */
export function shortcutHint(id: ShortcutId): string {
  return shortcutKeys(id).map(keyLabel).join(' or ');
}
