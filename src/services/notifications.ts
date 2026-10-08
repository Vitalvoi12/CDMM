import type { CalendarEvent, TodoTask } from '../types';
import { eventRepo, subscribeRepoChanges, todoRepo } from './repositories';
import { subscribeSync } from './serverSync';
import { apiFetch } from './auth';

/** Reminder choices offered in the event editor (minutes before start). */
export const NOTIFY_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Don't notify" },
  { value: 0, label: 'At the start' },
  { value: 5, label: '5 min before' },
  { value: 10, label: '10 min before' },
  { value: 15, label: '15 min before' },
  { value: 30, label: '30 min before' },
  { value: 60, label: '1 hour before' },
];

/** Which reminders already fired, shared by every tab: key → fire time (ms). */
const FIRED_KEY = 'cdmm.notified';
/**
 * How late a reminder may still fire. Background tabs throttle timers to about
 * once a minute, and the app may be opened shortly after the moment — a few
 * minutes late is still useful, a stale "starts in 15 min" an hour later is not.
 */
const GRACE_MS = 5 * 60_000;
/** Longest sleep between checks, so clock jumps and sleep/wake are caught. */
const MAX_SLEEP_MS = 60_000;

export type NotifyPermission = NotificationPermission | 'unsupported';

export function notificationPermission(): NotifyPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** Running as an installed Home Screen app on iPhone/iPad. */
export function isIosPwa(): boolean {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac; the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return ios && standalone;
}

/**
 * Ask for permission. Must be called synchronously from a tap/click handler:
 * iOS ignores the request otherwise (a select's change event is not enough).
 */
export async function requestNotificationPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  let result: NotificationPermission;
  try {
    result = await Notification.requestPermission();
  } catch {
    result = Notification.permission;
  }
  if (result === 'granted') void ensurePushSubscription();
  return result;
}

/**
 * Registered at boot so reminders can go through the service worker — the
 * only way to show a notification on Android, where `new Notification()`
 * throws, and the one that lets a click focus an existing window.
 */
export function registerNotificationWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
    // no worker (http, private mode): fall back to page notifications
  });
}

/** This device's push endpoint once the server has it; reminders then come by push. */
const PUSH_ENDPOINT_KEY = 'cdmm.pushEndpoint';

export function pushEndpoint(): string | null {
  try {
    return localStorage.getItem(PUSH_ENDPOINT_KEY);
  } catch {
    return null;
  }
}

function setPushEndpoint(endpoint: string | null): void {
  try {
    if (endpoint) localStorage.setItem(PUSH_ENDPOINT_KEY, endpoint);
    else localStorage.removeItem(PUSH_ENDPOINT_KEY);
  } catch {
    // storage unavailable — page reminders keep working
  }
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((v, i) => v === b[i]);
}

let subscribing: Promise<boolean> | null = null;

/**
 * Subscribe this device to Web Push and hand the subscription to the server,
 * which then sends reminders even while the app is closed. Safe to call often:
 * it reuses the existing subscription and just re-registers it.
 */
export function ensurePushSubscription(): Promise<boolean> {
  if (!subscribing) {
    subscribing = doSubscribe().finally(() => {
      subscribing = null;
    });
  }
  return subscribing;
}

async function doSubscribe(): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  if (!('serviceWorker' in navigator) || typeof PushManager === 'undefined') return false;
  try {
    const keyRes = await apiFetch('/api/push/key');
    if (!keyRes.ok) return false;
    const { key } = (await keyRes.json()) as { key: string };
    const appKey = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // A subscription made for another server key can never be used — replace it.
    if (sub && !sameKey(sub.options.applicationServerKey, appKey)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
    const res = await apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    if (!res.ok) return false;
    setPushEndpoint(sub.endpoint);
    return true;
  } catch {
    return false;
  }
}

/** Ask the server to push a test message to every subscribed device. */
export async function sendTestPush(): Promise<{ devices: number; delivered: number } | null> {
  try {
    const res = await apiFetch('/api/push/test', { method: 'POST' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function showNotification(title: string, options: NotificationOptions): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  const opts: NotificationOptions = { icon: '/logo.png', badge: '/logo.png', ...options };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, opts);
      return true;
    }
  } catch {
    // fall through to the page notification
  }
  try {
    const n = new Notification(title, opts);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "Starts in 1 d 2 h 5 min" — custom leads can be any number of minutes. */
function leadText(minutes: number): string {
  if (minutes === 0) return 'Starting now';
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const parts = [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean);
  return `Starts in ${parts.join(' ')}`;
}

/**
 * Identity of one reminder. Moving the event or changing the lead makes a new
 * key, so a rescheduled event reminds again instead of staying "already sent".
 */
function reminderKey(e: CalendarEvent, lead: number): string {
  return `${e.id}|${e.start}|${lead}`;
}

/** Every reminder lead of an event: the first plus any extras, no repeats. */
export function eventLeads(e: Pick<CalendarEvent, 'notifyBefore' | 'notifyExtra'>): number[] {
  if (typeof e.notifyBefore !== 'number' || e.notifyBefore < 0) return [];
  return [...new Set([e.notifyBefore, ...(e.notifyExtra ?? [])])];
}

function loadFired(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveFired(fired: Record<string, number>): void {
  // Forget reminders older than two days; nothing can fire for them again.
  const cutoff = Date.now() - 2 * 86_400_000;
  for (const k of Object.keys(fired)) if (fired[k] < cutoff) delete fired[k];
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
  } catch {
    // storage unavailable — worst case a reminder repeats in another tab
  }
}

/** Every event reminder, one entry per lead. Same keys as the server. */
function eventReminders(): { key: string; at: number; lead: number; event: CalendarEvent }[] {
  const out: { key: string; at: number; lead: number; event: CalendarEvent }[] = [];
  for (const e of eventRepo.getAll()) {
    for (const lead of eventLeads(e)) {
      out.push({ key: reminderKey(e, lead), at: new Date(e.start).getTime() - lead * 60_000, lead, event: e });
    }
  }
  return out;
}

/** Reminders of open tasks. Same key as the server's push scheduler. */
function todoReminders(): { key: string; at: number; task: TodoTask }[] {
  const out: { key: string; at: number; task: TodoTask }[] = [];
  for (const t of todoRepo.getAll()) {
    if (t.completed) continue;
    for (const r of t.reminders ?? []) {
      const at = Date.parse(r.at);
      if (!Number.isFinite(at)) continue;
      out.push({ key: `todo|${t.id}|${new Date(at).toISOString()}`, at, task: t });
    }
  }
  return out;
}

function todoBody(t: TodoTask): string {
  if (!t.dueDate) return 'Task reminder';
  const d = new Date(t.dueDate);
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Task reminder · due ${day}${t.dueHasTime ? ` ${fmtTime(d)}` : ''}`;
}

let timer: ReturnType<typeof setTimeout> | null = null;

function check(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const now = Date.now();
  const events = eventReminders();
  const todos = todoReminders();

  // With push, the server delivers the reminder (also when the app is
  // closed); showing it here as well would make it appear twice.
  if (notificationPermission() === 'granted' && !pushEndpoint()) {
    // Re-read right before writing so a second tab that just fired the same
    // reminder is seen; the shared `tag` collapses any remaining duplicate.
    const fired = loadFired();
    let changed = false;
    for (const r of events) {
      if (r.at > now || now - r.at > GRACE_MS || fired[r.key]) continue;
      fired[r.key] = r.at;
      changed = true;
      const start = new Date(r.event.start);
      const end = new Date(r.event.end);
      void showNotification(r.event.title || 'Event', {
        body: `${leadText(r.lead)} · ${fmtTime(start)}–${fmtTime(end)}`,
        tag: `cdmm-${r.key}`,
        data: { url: '/' },
      });
    }
    for (const r of todos) {
      if (r.at > now || now - r.at > GRACE_MS || fired[r.key]) continue;
      fired[r.key] = r.at;
      changed = true;
      void showNotification(r.task.title || 'Task', {
        body: todoBody(r.task),
        tag: `cdmm-${r.key}`,
        data: { url: '/todo' },
      });
    }
    if (changed) saveFired(fired);
  }

  // Sleep until the next reminder is due, but never longer than a minute.
  let next = now + MAX_SLEEP_MS;
  for (const r of [...events, ...todos]) if (r.at > now && r.at < next) next = r.at;
  timer = setTimeout(check, Math.max(250, next - now));
}

let started = false;

/** Start the reminder loop once per page; it follows every event and task change. */
export function startEventNotifications(): void {
  if (started) return;
  started = true;
  // Re-register on every launch: refreshes the server's copy (time zone,
  // rotated endpoint) and picks up a permission granted in browser settings.
  void ensurePushSubscription();
  subscribeRepoChanges(check);
  subscribeSync(check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  check();
}
