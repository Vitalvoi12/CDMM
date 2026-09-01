import type { UserSettings } from '../types';
import { parseIcs, serializeVCalendar } from './ics';

export interface CalDavTestResult {
  ok: boolean;
  message: string;
}

export interface RemoteItem {
  href: string;
  etag: string;
  ics: string;
}

const CALDAV_PREFIX = '/caldav/';

function b64url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * CalDAV servers don't send CORS headers, so browsers can't call them
 * directly. Same-origin requests pass through untouched; cross-origin ones
 * are routed via the Vite dev proxy at `/caldav/<b64 origin>/<path>`.
 */
function toRequestUrl(serverUrl: string): string {
  if (typeof window === 'undefined' || !window.location) return serverUrl;
  try {
    const u = new URL(serverUrl);
    const origin = `${u.protocol}//${u.host}`;
    if (window.location.origin === origin) return serverUrl;
    return `${window.location.origin}${CALDAV_PREFIX}${b64url(origin)}${u.pathname}${u.search}`;
  } catch {
    return serverUrl;
  }
}

function baseUrl(settings: UserSettings): string {
  let url = settings.calDav.serverUrl.trim();
  if (!url) return '';
  if (url.endsWith('/')) url = url.slice(0, -1);
  return toRequestUrl(url);
}

function originOf(serverUrl: string): string {
  try {
    const u = new URL(serverUrl.trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return serverUrl.trim();
  }
}

/** Convert a DAV href (full URL or server-relative path) into a fetchable URL. */
export function resolveHref(settings: UserSettings, href: string): string {
  if (/^https?:\/\//.test(href)) return toRequestUrl(href);
  if (href.startsWith('/')) return toRequestUrl(originOf(settings.calDav.serverUrl) + href);
  return toRequestUrl(baseUrl(settings) + '/' + href);
}

function headers(settings: UserSettings, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/xml, text/calendar, */*',
    ...extra,
  };
  const user = settings.calDav.username || '';
  const pass = settings.calDav.password || '';
  if (user || pass) {
    h.Authorization = `Basic ${btoa(unescape(encodeURIComponent(`${user}:${pass}`)))}`;
  }
  return h;
}

async function davRequest(
  settings: UserSettings,
  method: string,
  body?: string,
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  const url = baseUrl(settings);
  if (!url) throw new Error('Server URL is empty');
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: headers(settings, extraHeaders),
      body,
      credentials: 'omit',
    });
  } catch (err) {
    throw new Error(
      `Network error: could not reach CalDAV server (${err instanceof Error ? err.message : 'unreachable'}). Check the URL and your internet connection.`
    );
  }
  if (res.status >= 300) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new Error(
      `DAV ${method} failed: HTTP ${res.status} ${res.statusText}${detail && detail.trim() ? ` — ${detail.trim()}` : ''}`
    );
  }
  return res;
}

export async function testCalDavConnection(settings: UserSettings): Promise<CalDavTestResult> {
  try {
    const body =
      `<?xml version="1.0"?>` +
      `<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">` +
      `<D:prop><D:resourcetype/><D:displayname/><C:supported-calendar-component-set/></D:prop>` +
      `</D:propfind>`;
    const res = await davRequest(settings, 'PROPFIND', body, { Depth: '0', 'Content-Type': 'application/xml' });
    if (res.status === 207 || res.status === 200) {
      return { ok: true, message: 'Connection successful' };
    }
    return { ok: false, message: `Server responded HTTP ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, message: message.includes('HTTP') ? message : `Network error: ${message}` };
  }
}

export async function fetchCalDavEvents(settings: UserSettings, range?: { start: Date; end: Date }): Promise<RemoteItem[]> {
  const timeRange = range
    ? `<C:time-range start="${range.start.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}" end="${range.end.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}"/>`
    : '';
  const body =
    `<?xml version="1.0"?>` +
    `<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">` +
    `<D:propfind><D:prop><D:getetag/><C:calendar-data/></D:prop></D:propfind>` +
    `<C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">${timeRange}</C:comp-filter></C:comp-filter></C:filter>` +
    `</C:calendar-query>`;
  const res = await davRequest(settings, 'REPORT', body, {
    Depth: '1',
    'Content-Type': 'application/xml',
  });
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const items: RemoteItem[] = [];
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Malformed multistatus response');
  }
  const responses = doc.getElementsByTagNameNS('DAV:', 'response');
  for (const resp of Array.from(responses)) {
    const href = resp.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent?.trim() || '';
    const etag = resp.getElementsByTagNameNS('DAV:', 'getetag')[0]?.textContent?.trim() || '';
    const cd = resp.getElementsByTagNameNS('urn:ietf:params:xml:ns:caldav', 'calendar-data')[0]?.textContent || '';
    if (href && cd) {
      items.push({ href, etag, ics: cd });
    }
  }
  return items;
}

export async function putCalDavEvent(settings: UserSettings, ics: string, uid: string, targetHref?: string): Promise<void> {
  const href = targetHref
    ? resolveHref(settings, targetHref)
    : `${baseUrl(settings)}${settings.calDav.calendar === 'default' ? '' : '/' + settings.calDav.calendar}/${encodeURIComponent(uid)}.ics`;
  const res = await fetch(href, {
    method: 'PUT',
    headers: headers(settings, { 'Content-Type': 'text/calendar; charset=utf-8' }),
    body: ics,
    credentials: 'omit',
  });
  if (res.status >= 300) {
    throw new Error(`CalDAV PUT failed: HTTP ${res.status} ${res.statusText}`.trim());
  }
}

export async function deleteCalDavEvent(settings: UserSettings, href: string): Promise<void> {
  const res = await fetch(resolveHref(settings, href), {
    method: 'DELETE',
    headers: headers(settings),
    credentials: 'omit',
  });
  if (res.status >= 300) {
    throw new Error(`CalDAV DELETE failed: HTTP ${res.status} ${res.statusText}`.trim());
  }
}

export function eventToIcs(event: {
  uid: string;
  title: string;
  description?: string;
  start: string;
  end: string;
}): string {
  return serializeVCalendar([
    {
      uid: event.uid,
      summary: event.title,
      description: event.description,
      dtStart: event.start,
      dtEnd: event.end,
    },
  ]);
}

export function eventsFromIcs(ics: string): ReturnType<typeof parseIcs> {
  return parseIcs(ics);
}