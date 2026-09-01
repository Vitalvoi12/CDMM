import type { CalendarEvent, Subject, UserSettings } from '../types';
import { eventRepo } from './repositories';
import { fetchCalDavEvents, putCalDavEvent, deleteCalDavEvent } from './caldavClient';
import { parseIcs } from './ics';

export interface SyncResult {
  created: number;
  updated: number;
  imported: number;
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

export async function pullFromCalDav(settings: UserSettings, subjects: Subject[]): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, imported: 0, errors: 0, message: '' };
  try {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    const to = new Date();
    to.setFullYear(to.getFullYear() + 2);
    const items = await fetchCalDavEvents(settings, { start: from, end: to });

    const existingByUid = new Map<string, CalendarEvent>();
    eventRepo.getAll().forEach((e) => existingByUid.set(e.uid, e));

    const fallbackId = subjects[0]?.id || 'unknown';

    for (const item of items) {
      try {
        const vevents = parseIcs(item.ics);
        for (const vevent of vevents) {
          const subjectId = resolveSubjectFromIcs(vevent, subjects, fallbackId);
          const title = vevent.summary || 'Imported event';
          const start = new Date(vevent.dtStart).toISOString();
          const end = new Date(vevent.dtEnd).toISOString();
          const existing = existingByUid.get(vevent.uid);

          if (existing) {
            const isDirty = existing.href !== item.href || existing.etag !== item.etag;
            if (isDirty || existing.title !== title || existing.start !== start || existing.end !== end) {
              eventRepo.update(existing.id, {
                title,
                description: vevent.description,
                start,
                end,
                subjectId,
                href: item.href,
                etag: item.etag,
              });
              result.updated++;
            }
          } else {
            const localId =
              vevent.xLocalId && eventRepo.getById(vevent.xLocalId)
                ? vevent.xLocalId
                : `caldav-${Date.now()}-${Math.round(Math.random() * 10000)}`;
            eventRepo.create({
              id: localId,
              uid: vevent.uid,
              title,
              description: vevent.description,
              start,
              end,
              subjectId,
              href: item.href,
              etag: item.etag,
            });
            result.created++;
          }
        }
      } catch {
        result.errors++;
      }
    }
    result.imported = items.length;
    result.message = `Pulled ${result.created} new, ${result.updated} updated from CalDAV`;
    return result;
  } catch (err) {
    result.errors++;
    result.message = err instanceof Error ? err.message : 'Pull failed';
    return result;
  }
}

export async function pushToCalDav(settings: UserSettings): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, imported: 0, errors: 0, message: '' };
  const events = eventRepo.getAll();
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
    await deleteCalDavEvent(settings, event.href);
  }
}