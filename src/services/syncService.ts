import type { CalendarEvent, Subject, UserSettings } from '../types';
import { eventRepo, tombstoneRepo } from './repositories';
import { fetchCalDavEvents, putCalDavEvent, deleteCalDavEvent } from './caldavClient';
import { parseIcs } from './ics';

export interface SyncResult {
  created: number;
  updated: number;
  imported: number;
  deleted: number;
  errors: number;
  message: string;
}

export interface SyncCallbacks {
  settings: UserSettings;
  subjects: Subject[];
  resolveSubjectId: (title: string, event: { start: string; end: string }, fallbackId: string) => string;
}

export function resolveSubjectFromIcs(
  vevent: { summary?: string; xSubject?: string },
  subjects: Subject[],
  fallbackId: string
): string {
  if (vevent.xSubject && subjects.some((s) => s.id === vevent.xSubject)) {
    return vevent.xSubject;
  }
  const name = vevent.summary?.trim().toLowerCase() || '';
  const byName = subjects.find((s) => s.name.toLowerCase() === name);
  if (byName) return byName.id;
  return fallbackId;
}

export function eventToCalDavIcs(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudyCore//Study Tracker//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART:${new Date(event.start).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTEND:${new Date(event.end).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `SUMMARY:${event.title}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${event.description}`);
  lines.push(`X-STUDYCORE-SUBJECT:${event.subjectId}`);
  lines.push(`X-STUDYCORE-LOCALID:${event.id}`);
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function sameEvent(a: CalendarEvent, b: { title: string; description?: string; start: string; end: string; subjectId: string }): boolean {
  return (
    a.title === b.title &&
    (a.description || undefined) === (b.description || undefined) &&
    a.start === b.start &&
    a.end === b.end &&
    a.subjectId === b.subjectId
  );
}

/**
 * Bidirectional reconcile with tombstones and etag-based deletion detection.
 *
 * - Remote events with etags that no longer match a local event's uid are
 *   imported / updated.
 * - Locally tombstoned uids are DELETEd from the server so other devices see
 *   the removal.
 * - Local events previously synced (have an etag) whose uid is no longer on
 *   the server were deleted elsewhere -> removed locally too.
 * - Local events never uploaded (no etag) are pushed.
 */
export async function syncAll(settings: UserSettings, subjects: Subject[]): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, imported: 0, deleted: 0, errors: 0, message: '' };

  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  const to = new Date();
  to.setFullYear(to.getFullYear() + 3);

  let remote: Awaited<ReturnType<typeof fetchCalDavEvents>>;
  try {
    remote = await fetchCalDavEvents(settings, { start: from, end: to });
  } catch (err) {
    result.errors++;
    result.message = err instanceof Error ? err.message : 'Sync failed';
    return result;
  }

  const local = eventRepo.getAll();
  const localByUid = new Map<string, CalendarEvent>();
  local.forEach((e) => localByUid.set(e.uid, e));

  const remoteByUid = new Map<string, Array<{ href: string; etag: string; ics: string }>>();
  for (const item of remote) {
    const vevents = parseIcs(item.ics).filter((v) => v.uid);
    for (const v of vevents ?? []) {
      const arr = remoteByUid.get(v.uid) || [];
      arr.push(item);
      remoteByUid.set(v.uid, arr);
    }
  }
  const remoteItemByUid = new Map<string, { href: string; etag: string; ics: string }>();
  for (const [uid, arr] of remoteByUid) {
    remoteItemByUid.set(uid, arr[0]);
  }

  const fallbackId = subjects[0]?.id || 'unknown';

  // 1) Apply tombstones: delete on server if still present, drop local copy.
  for (const uid of tombstoneRepo.getAll()) {
    const remoteItem = remoteItemByUid.get(uid);
    if (remoteItem) {
      try {
        await deleteCalDavEvent(settings, remoteItem.href);
        result.deleted++;
      } catch {
        result.errors++;
      }
      remoteItemByUid.delete(uid);
    }
    if (localByUid.has(uid)) {
      const ev = localByUid.get(uid)!;
      eventRepo.delete(ev.id);
      localByUid.delete(uid);
    }
    tombstoneRepo.remove(uid);
  }

  // 2) Push local events not on the server (skip tombstoned).
  for (const ev of localByUid.values()) {
    if (tombstoneRepo.has(ev.uid)) continue;
    const remoteItem = remoteItemByUid.get(ev.uid);
    const needPush = !remoteItem || remoteItem.etag !== ev.etag;
    if (needPush) {
      try {
        const ics = eventToCalDavIcs(ev);
        await putCalDavEvent(settings, ics, ev.uid, ev.href);
        if (remoteItem) {
          result.updated++;
        } else {
          result.created++;
        }
      } catch {
        result.errors++;
      }
    }
    remoteItemByUid.delete(ev.uid);
  }

  // 3) Import remaining remote events not seen locally.
  for (const [uid, item] of remoteItemByUid) {
    let parsed: ReturnType<typeof parseIcs>[number] | null = null;
    try {
      const vevents = parseIcs(item.ics);
      parsed = vevents?.find((v) => v.uid === uid) || vevents?.[0] || null;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      result.errors++;
      continue;
    }
    const existing = localByUid.get(uid);
    if (existing) {
      const mapped = {
        title: parsed.summary || 'Imported event',
        description: parsed.description,
        start: new Date(parsed.dtStart).toISOString(),
        end: new Date(parsed.dtEnd).toISOString(),
        subjectId: resolveSubjectFromIcs(parsed, subjects, existing.subjectId),
      };
      if (!sameEvent(existing, mapped) || existing.etag !== item.etag) {
        eventRepo.update(existing.id, { ...mapped, href: item.href, etag: item.etag });
        result.updated++;
      }
      continue;
    }
    const vevent = parsed;
    const subjectId = resolveSubjectFromIcs(vevent, subjects, fallbackId);
    const localId =
      vevent.xLocalId && eventRepo.getById(vevent.xLocalId)
        ? vevent.xLocalId
        : `caldav-${Date.now()}-${Math.round(Math.random() * 10000)}`;
    eventRepo.create({
      id: localId,
      uid,
      title: vevent.summary || 'Imported event',
      description: vevent.description,
      start: new Date(vevent.dtStart).toISOString(),
      end: new Date(vevent.dtEnd).toISOString(),
      subjectId,
      href: item.href,
      etag: item.etag,
    });
    result.imported++;
  }

  // 4) Local events that were synced (etag) but are no longer on the server
  //    were deleted on another device -> drop them locally.
  const finalLocal = eventRepo.getAll();
  for (const ev of finalLocal) {
    if (ev.etag && !remoteByUid.has(ev.uid)) {
      eventRepo.delete(ev.id);
      result.deleted++;
    }
  }

  result.message = [
    result.created ? `${result.created} pushed` : '',
    result.updated ? `${result.updated} updated` : '',
    result.imported ? `${result.imported} imported` : '',
    result.deleted ? `${result.deleted} removed` : '',
  ].filter(Boolean).join(', ') || 'All up to date';

  return result;
}

/** @deprecated Use syncAll for full bidirectional sync. */
export async function pullFromCalDav(settings: UserSettings, subjects: Subject[]): Promise<SyncResult> {
  return syncAll(settings, subjects);
}

/** @deprecated Use syncAll for full bidirectional sync. */
export async function pushToCalDav(settings: UserSettings): Promise<SyncResult> {
  const events = eventRepo.getAll();
  const result: SyncResult = { created: 0, updated: 0, imported: 0, deleted: 0, errors: 0, message: '' };
  try {
    for (const event of events) {
      try {
        const ics = eventToCalDavIcs(event);
        await putCalDavEvent(settings, ics, event.uid, event.href);
        if (event.href) {
          result.updated++;
        } else {
          result.created++;
        }
      } catch {
        result.errors++;
      }
    }
    result.message = `Pushed ${result.created} new, ${result.updated} updated to CalDAV`;
    return result;
  } catch (err) {
    result.errors++;
    result.message = err instanceof Error ? err.message : 'Push failed';
    return result;
  }
}

export async function deleteOnCalDav(settings: UserSettings, event: CalendarEvent): Promise<void> {
  if (event.href) {
    try {
      await deleteCalDavEvent(settings, event.href);
    } catch {
      // ignore missing
    }
  }
  tombstoneRepo.add(event.uid);
}