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

export interface RemoteQuery {
  items: RemoteItem[];
  /** Number of DAV:<response> elements returned by the server. */
  responses: number;
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

/**
 * The calendar collection we push events into and query events from.
 * - When the calendar setting names a calendar, it's <serverUrl>/<calendar>.
 * - When set to 'default' (the URL already points at a collection), it's the
 *   configured URL itself.
 */
function collectionUrl(settings: UserSettings): string {
  const base = baseUrl(settings) || settings.calDav.serverUrl.trim().replace(/\/+$/, '');
  const name = settings.calDav.calendar;
  return name && name !== 'default' ? `${base.replace(/\/+$/, '')}/${encodeURIComponent(name)}` : base;
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

export interface CalendarInfo {
  href: string;
  displayName: string;
}

export interface DiscoveryResult {
  /** True when the configured URL already points directly at a calendar. */
  isCalendar: boolean;
  calendars: CalendarInfo[];
}

function hasCalendarResourceType(resp: Element): boolean {
  for (const el of resp.getElementsByTagName('*')) {
    if (el.localName === 'calendar') return true;
  }
  return false;
}

/** PROPFIND Depth:1 on the configured URL; returns child calendars (or self if it's a calendar). */
export async function discoverCalendars(settings: UserSettings): Promise<DiscoveryResult> {
  const body =
    `<?xml version="1.0"?>` +
    `<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">` +
    `<D:prop><D:resourcetype/><D:displayname/></D:prop>` +
    `</D:propfind>`;
  const res = await davRequest(settings, 'PROPFIND', body, { Depth: '1', 'Content-Type': 'application/xml' });
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Malformed multistatus response');
  }
  const responses = Array.from(doc.getElementsByTagNameNS('DAV:', 'response'));
  const first = responses[0];
  const isCalendar = !!first && hasCalendarResourceType(first);
  const calendars: CalendarInfo[] = responses
    .filter(hasCalendarResourceType)
    .map((resp) => {
      let href = '';
      let displayName = '';
      for (const el of resp.getElementsByTagName('*')) {
        const ln = el.localName;
        if (ln === 'href' && !href) href = el.textContent?.trim() || '';
        else if (ln === 'displayname' && !displayName) displayName = el.textContent?.trim() || '';
        if (href && displayName) break;
      }
      return { href, displayName };
    })
    .filter((c) => c.href);
  return { isCalendar, calendars };
}

/** Create a new calendar under the configured URL (MKCOL with caldav resourcetype). */
export async function createCalDavCalendar(settings: UserSettings, name: string): Promise<string> {
  const safeName = encodeURIComponent(name.replace(/[/\\]/g, '-'));
  const base = baseUrl(settings);
  const target = `${base}/${safeName}/`;
  const body =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">` +
    `<D:set><D:prop>` +
    `<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>` +
    `<D:displayname>${name.replace(/[<>&"]/g, '')}</D:displayname>` +
    `</D:prop></D:set>` +
    `</D:mkcol>`;
  const res = await fetch(target, {
    method: 'MKCOL',
    headers: headers(settings, { 'Content-Type': 'application/xml', Depth: '0' }),
    body,
    credentials: 'omit',
  });
  if (res.status >= 300) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new Error(
      `CalDAV MKCOL failed: HTTP ${res.status} ${res.statusText}${detail && detail.trim() ? ` — ${detail.trim()}` : ''}`
    );
  }
  return target;
}

async function reportOn(settings: UserSettings, url: string, range?: { start: Date; end: Date }): Promise<RemoteQuery> {
  const timeRange = range
    ? `<C:time-range start="${range.start.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}" end="${range.end.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}"/>`
    : '';
  const body =
    `<?xml version="1.0"?>` +
    `<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">` +
    `<D:propfind><D:prop><D:getetag/><C:calendar-data/></D:prop></D:propfind>` +
    `<C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">${timeRange}</C:comp-filter></C:comp-filter></C:filter>` +
    `</C:calendar-query>`;
  const res = await fetch(toRequestUrl(url), {
    method: 'REPORT',
    headers: headers(settings, { Depth: '1', 'Content-Type': 'application/xml' }),
    body,
    credentials: 'omit',
  });
  if (res.status >= 300) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new Error(
      `CalDAV REPORT failed: HTTP ${res.status} ${res.statusText}${detail && detail.trim() ? ` — ${detail.trim()}` : ''}`
    );
  }
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const items: RemoteItem[] = [];
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Malformed multistatus response');
  }
  const responses = doc.getElementsByTagNameNS('DAV:', 'response');
  for (const resp of Array.from(responses)) {
    let href = '';
    let etag = '';
    let cd = '';
    for (const el of resp.getElementsByTagName('*')) {
      const ln = el.localName;
      if (ln === 'href' && !href) href = el.textContent?.trim() || '';
      else if (ln === 'getetag' && !etag) etag = el.textContent?.trim() || '';
      else if (ln === 'calendar-data' && !cd) cd = el.textContent || '';
      if (href && etag && cd) break;
    }
    if (href && cd) {
      items.push({ href, etag, ics: cd });
    }
  }
  console.debug(`[caldav] REPORT ${toRequestUrl(url)} -> ${res.status}, ${responses.length} responses, ${items.length} kept`);
  return { items, responses: responses.length };
}

/**
 * Fetch remote calendar events. The query runs against the resolved calendar
 * collection (see collectionUrl). Because the configured URL may point at a
 * calendar home rather than a collection, an empty result triggers a fallback
 * that discovers child calendar collections and queries each of them.
 */
export async function fetchCalDavEvents(settings: UserSettings, range?: { start: Date; end: Date }): Promise<RemoteQuery> {
  const targets: string[] = [];
  try {
    const url = collectionUrl(settings);
    if (url) targets.push(url);
  } catch {
    /* fall through to discovery */
  }
  if (targets.length === 0) {
    const unit = settings.calDav.serverUrl.trim().replace(/\/+$/, '');
    if (unit) targets.push(unit);
  }

  const all: RemoteItem[] = [];
  let totalResponses = 0;
  const seen = new Set<string>();
  const add = (query: RemoteQuery) => {
    totalResponses += query.responses;
    for (const item of query.items) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      all.push(item);
    }
  };

  let directError: unknown = null;
  for (const target of targets) {
    try {
      add(await reportOn(settings, target, range));
    } catch (err) {
      directError = directError || err;
    }
  }

  if (all.length === 0) {
    try {
      const disc = await discoverCalendars(settings);
      for (const c of disc.calendars) {
        try {
          const url = /^https?:\/\//.test(c.href)
            ? c.href
            : originOf(settings.calDav.serverUrl) + (c.href.startsWith('/') ? c.href : '/' + c.href);
          add(await reportOn(settings, url, range));
        } catch {
          /* skip collections that fail */
        }
      }
    } catch (err) {
      directError = directError || err;
    }
  }

  if (all.length === 0 && directError) {
    throw directError instanceof Error ? directError : new Error('CalDAV REPORT failed');
  }
  return { items: all, responses: totalResponses };
}

export async function putCalDavEvent(
  settings: UserSettings,
  ics: string,
  uid: string,
  targetHref?: string
): Promise<{ href: string; etag: string }> {
  const href = targetHref
    ? resolveHref(settings, targetHref)
    : `${collectionUrl(settings)}/${encodeURIComponent(uid)}.ics`;
  const res = await fetch(href, {
    method: 'PUT',
    headers: headers(settings, { 'Content-Type': 'text/calendar; charset=utf-8' }),
    body: ics,
    credentials: 'omit',
  });
  if (res.status >= 300) {
    throw new Error(`CalDAV PUT failed: HTTP ${res.status} ${res.statusText}`.trim());
  }
  const etag = res.headers.get('etag') || '';
  return { href, etag };
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

/**
 * Confirm a resource really exists server-side (PROPFIND Depth:0 on its exact
 * href). Returns true when the resource exists, false when it's gone (404),
 * and null when the outcome is unknown (network/auth/other errors) — callers
 * must NOT delete locally in that case.
 */
export async function probeCalDavEvent(settings: UserSettings, href: string): Promise<boolean | null> {
  try {
    const res = await fetch(resolveHref(settings, href), {
      method: 'PROPFIND',
      headers: headers(settings, { Depth: '0' }),
      credentials: 'omit',
    });
    if (res.status === 404) return false;
    if (res.status === 207 || res.status === 200) return true;
    return null;
  } catch {
    return null;
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