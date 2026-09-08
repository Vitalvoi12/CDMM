import type { CalendarEvent, Subject, UserSettings, TodoTask } from '../types';
import { eventRepo, tombstoneRepo, todoRepo, subjectRepo } from './repositories';
import { fetchCalDavEvents, fetchCalDavTodos, putCalDavEvent, deleteCalDavEvent, probeCalDavEvent, resolveCollectionForWrite, fetchSupportedComponents, discoverCalendars, collectionUrl, originOf, toRequestUrl, headers } from './caldavClient';
import { parseIcs, lineFold } from './ics';
import { todoToVTodo, vTodoToTask } from './vtodo';

export interface SyncResult {
  created: number;
  updated: number;
  imported: number;
  deleted: number;
  errors: number;
  message: string;
  removedUids: string[];
  remoteCount: number;
}

export interface SyncDiag {
  /** Raw DAV responses returned by the REPORT queries. */
  responses: number;
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

/**
 * Resolve the subject of a remote event WITHOUT inventing subjects[0] as a
 * fallback: subject ids are device-local, so a foreign xSubject must never be
 * applied blindly. Resolution order:
 *   1. xSubject id exists locally -> use it;
 *   2. X-STUDYCORE-SUBJECT-NAME (device-independent) matches by name -> use it;
 *   3. event title matches a subject name -> use it;
 *   4. ensure a subject with the carried name (or title) exists, creating it
 *      when missing;
 *   5. only when the remote event carries no subject identity at all ->
 *      fallbackId.
 */
export function resolveSubjectStrict(
  vevent: { summary?: string; xSubject?: string; xSubjectName?: string },
  subjects: Subject[],
  fallbackId: string,
  ensureSubjectByName?: (name: string) => string
): string {
  if (vevent.xSubject && subjects.some((s) => s.id === vevent.xSubject)) {
    return vevent.xSubject;
  }
  const carriedName = (vevent.xSubjectName || '').trim();
  const titleName = vevent.summary?.trim() || '';

  if (carriedName) {
    const lower = carriedName.toLowerCase();
    const byName = subjects.find((s) => s.name.trim().toLowerCase() === lower);
    if (byName) return byName.id;
    if (ensureSubjectByName) return ensureSubjectByName(carriedName);
  }

  // Title is only matched against EXISTING subjects — never creates new ones,
  // otherwise arbitrary event titles would spawn subjects.
  if (titleName) {
    const byTitle = subjects.find((s) => s.name.trim().toLowerCase() === titleName.toLowerCase());
    if (byTitle) return byTitle.id;
  }
  return fallbackId;
}

export function eventToCalDavIcs(event: CalendarEvent, subjectName?: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CDMM//Study Tracker//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART:${new Date(event.start).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTEND:${new Date(event.end).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `SUMMARY:${event.title}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${event.description}`);
  lines.push(`X-STUDYCORE-SUBJECT:${event.subjectId}`);
  if (subjectName) lines.push(`X-STUDYCORE-SUBJECT-NAME:${lineFold(subjectName)}`);
  lines.push(`X-STUDYCORE-LOCALID:${event.id}`);
  if (event.kind === 'plan') lines.push(`X-STUDYCORE-KIND:PLAN`);
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}


function toContent(ev: { title: string; description?: string; start: string; end: string; subjectId: string; kind?: 'real' | 'plan' }) {
  return {
    title: ev.title,
    description: ev.description || undefined,
    start: ev.start,
    end: ev.end,
    subjectId: ev.subjectId,
    kind: (ev.kind === 'plan' ? 'plan' : 'real') as 'real' | 'plan',
  };
}

function sameContent(
  a: { title: string; description?: string; start: string; end: string; subjectId: string; kind?: 'real' | 'plan' },
  b: { title: string; description?: string; start: string; end: string; subjectId: string; kind?: 'real' | 'plan' }
): boolean {
  return (
    a.title === b.title &&
    (a.description || undefined) === (b.description || undefined) &&
    a.start === b.start &&
    a.end === b.end &&
    a.subjectId === b.subjectId &&
    (a.kind === 'plan' ? 'plan' : 'real') === (b.kind === 'plan' ? 'plan' : 'real')
  );
}

/** Parse the single VEVENT matching `uid` out of a remote resource. */
function remoteContentOf(
  item: { ics: string },
  uid: string,
  subjects: Subject[],
  fallbackSubjectId: string,
  ensureSubjectByName?: (name: string) => string
): { title: string; description?: string; start: string; end: string; subjectId: string; kind: 'real' | 'plan' } | null {
  try {
    const parsed = parseIcs(item.ics);
    const vevent = parsed?.find((v) => v.uid === uid) || parsed?.[0] || null;
    if (!vevent) return null;
    return {
      title: vevent.summary || 'Imported event',
      description: vevent.description,
      start: new Date(vevent.dtStart).toISOString(),
      end: new Date(vevent.dtEnd).toISOString(),
      subjectId: resolveSubjectStrict(vevent, subjects, fallbackSubjectId, ensureSubjectByName),
      kind: vevent.xKind === 'PLAN' ? 'plan' : 'real',
    };
  } catch {
    return null;
  }
}

/**
 * Bidirectional reconcile with tombstones and etag-based deletion detection.
 *
 * - Locally tombstoned uids are DELETEd from the server so other devices see
 *   the removal.
 * - Local events previously synced (have an etag) whose uid is no longer on
 *   the server were deleted elsewhere -> removed locally too.
 * - Local events never uploaded (no etag) are pushed.
 * - Existing events are reconciled by content, not just etag: a local edit
 *   never changes the etag, so equality with the server etag means "server
 *   untouched since my last upload" and the local change is pushed. When the
 *   server was edited by someone else and this copy still matches what we
 *   last pushed, the server version is pulled instead.
 */
export async function syncAll(settings: UserSettings, subjects: Subject[]): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    imported: 0,
    deleted: 0,
    errors: 0,
    message: '',
    removedUids: [],
    remoteCount: 0,
  };

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
  result.remoteCount = remote.items.length;

  const remoteDir = (() => {
    const first = remote.items[0]?.href;
    if (!first) return null;
    const idx = first.lastIndexOf('/');
    return idx >= 0 ? first.slice(0, idx + 1) : `${first}/`;
  })();

  const local = eventRepo.getAll();
  const localByUid = new Map<string, CalendarEvent>();
  local.forEach((e) => localByUid.set(e.uid, e));

  const remoteByUid = new Map<string, Array<{ href: string; etag: string; ics: string }>>();
  for (const item of remote.items) {
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

  const subjectNameOf = (ev: CalendarEvent): string | undefined =>
    subjects.find((s) => s.id === ev.subjectId)?.name;

  // Foreign device subject ids never map 1:1. When a remote event carries a
  // subject name (X-STUDYCORE-SUBJECT-NAME or its title) unknown locally,
  // create that subject instead of silently remapping to subjects[0].
  const ensureSubjectByName = (name: string): string => {
    const lower = name.trim().toLowerCase();
    const existing = subjectRepo.getAll().find((s) => s.name.trim().toLowerCase() === lower);
    if (existing) return existing.id;
    const palette = ['#3f51b5', '#00897b', '#d32f2f', '#f57c00', '#7b1fa2', '#0277bd', '#2e7d32', '#c2185b'];
    const created = subjectRepo.create({
      name: name.trim(),
      color: palette[Math.floor(Math.random() * palette.length)],
    });
    subjects.push(created);
    return created.id;
  };

  // 1) Apply tombstones: delete on server if still present, drop local copy.
  //    A uid may map to several server resources (duplicate uploads from older
  //    versions) — all of them must be removed, otherwise the survivors keep
  //    the uid alive on the server and deleted events "resurrect".
  for (const uid of tombstoneRepo.getAll()) {
    const remoteItems = remoteByUid.get(uid) || [];
    const items = remoteItemByUid.get(uid) ? [remoteItemByUid.get(uid)!, ...remoteItems.filter((i) => i !== remoteItemByUid.get(uid))] : remoteItems;
    let serverDeleteOk = items.length === 0;
    for (const remoteItem of items) {
      try {
        await deleteCalDavEvent(settings, remoteItem.href);
        serverDeleteOk = true;
        result.deleted++;
      } catch (err) {
        const exists = await probeCalDavEvent(settings, remoteItem.href).catch(() => null);
        if (exists === false) {
          serverDeleteOk = true;
        } else {
          result.errors++;
          console.error(`[sync] failed to delete tombstoned event ${uid}`, err);
        }
      }
      remoteItemByUid.delete(uid);
    }
    if (serverDeleteOk) {
      result.removedUids.push(uid);
      if (localByUid.has(uid)) {
        const ev = localByUid.get(uid)!;
        eventRepo.delete(ev.id);
        localByUid.delete(uid);
      }
      tombstoneRepo.remove(uid);
    }
  }

  // 2) External deletions: a local event that was previously synced (has an
  //    etag) but is no longer on the server was deleted on another device.
  //    Runs even when the REPORT returned zero responses — a successful
  //    fetch with no events legitimately means the server is empty. Each
  //    removal is confirmed by a direct PROPFIND on the event's exact href
  //    (404 -> delete, still exists -> keep, unknown -> skip), so a freshly
  //    pushed event is never pruned because the REPORT happened to miss it.
  for (const ev of [...localByUid.values()]) {
    if (!ev.etag || !ev.href) continue;
    if (remoteByUid.has(ev.uid)) continue;
    const exists = await probeCalDavEvent(settings, ev.href);
    if (exists === false) {
      eventRepo.delete(ev.id);
      result.removedUids.push(ev.uid);
      localByUid.delete(ev.uid);
      result.deleted++;
      console.info(`[sync] pruned locally: ${ev.uid} is gone from the server`);
    }
  }
  // 3) Push local events that were never uploaded (no etag) but are not
  //    tombstoned and not already on the server.
  let fallbackWriteDir: string | null | undefined;
  const writeDirFor = async (): Promise<string | undefined> => {
    if (remoteDir) return remoteDir;
    if (fallbackWriteDir === undefined) {
      fallbackWriteDir = (await resolveCollectionForWrite(settings)) || null;
    }
    return fallbackWriteDir || undefined;
  };
  for (const ev of localByUid.values()) {
    if (tombstoneRepo.has(ev.uid)) continue;
    if (ev.etag) continue;
    if (remoteByUid.has(ev.uid)) {
      // The server already has this uid but we never stored an etag for it.
      // Leave the remote item in place; step 4 adopts its state instead of
      // re-creating it.
      continue;
    }
    try {
      const { href, etag } = await putCalDavEvent(settings, eventToCalDavIcs(ev, subjectNameOf(ev)), ev.uid, ev.href, await writeDirFor());
      eventRepo.update(ev.id, { href, etag, pushed: toContent(ev) });
      result.created++;
    } catch (err) {
      result.errors++;
      console.error(`[sync] failed to push local event ${ev.id} (${ev.uid})`, err);
    }
  }

  // 4) Reconcile events that exist both locally and on the server. Content is
  //    the source of truth — a local drag/resize/edit never touches the etag,
  //    so comparing etags alone can never detect our own unsynced changes.
  for (const ev of localByUid.values()) {
    const remoteItem = remoteItemByUid.get(ev.uid);
    if (!remoteItem) continue; // new local events (step 3) or deleted elsewhere (step 2)

    const remoteContent = remoteContentOf(remoteItem, ev.uid, subjects, ev.subjectId, ensureSubjectByName);
    remoteItemByUid.delete(ev.uid);
    if (!remoteContent) {
      result.errors++;
      console.warn(`[sync] could not parse remote content for event ${ev.uid} at ${remoteItem.href}`);
      continue;
    }

    const localContent = toContent(ev);
    if (sameContent(localContent, remoteContent)) {
      // Already identical. Refresh href/etag and the pushed snapshot in case
      // the server rewrote them (e.g. normalization) or this record predates
      // snapshot tracking.
      if (ev.etag !== remoteItem.etag || ev.href !== remoteItem.href || !ev.pushed || !sameContent(ev.pushed, localContent)) {
        eventRepo.update(ev.id, { href: remoteItem.href, etag: remoteItem.etag, pushed: localContent });
      }
      continue;
    }

    if (ev.etag === remoteItem.etag) {
      // The server still holds exactly what we last uploaded, so the diff is a
      // local-only change (move/resize/edit). Push it.
      try {
        const { href, etag } = await putCalDavEvent(settings, eventToCalDavIcs(ev, subjectNameOf(ev)), ev.uid, ev.href);
        eventRepo.update(ev.id, { href, etag, pushed: localContent });
        result.updated++;
      } catch (err) {
        result.errors++;
        console.error(`[sync] failed to push edited event ${ev.id} (${ev.uid})`, err);
      }
      continue;
    }

    // The server was edited since our last upload. If this copy still matches
    // our last pushed snapshot the change is remote-only and we adopt it;
    // otherwise both sides changed and the local edit wins (the other device
    // converges on its next sync). Events without a snapshot are treated as
    // unchanged so migrated copies never clobber fresh server edits.
    const localEdited = ev.pushed ? !sameContent(ev.pushed, localContent) : false;
    if (!localEdited) {
      eventRepo.update(ev.id, { ...remoteContent, href: remoteItem.href, etag: remoteItem.etag, pushed: remoteContent });
      result.updated++;
    } else {
      try {
        const { href, etag } = await putCalDavEvent(settings, eventToCalDavIcs(ev, subjectNameOf(ev)), ev.uid, ev.href);
        eventRepo.update(ev.id, { href, etag, pushed: localContent });
        result.updated++;
      } catch (err) {
        result.errors++;
        console.error(`[sync] failed to push conflicting event ${ev.id} (${ev.uid})`, err);
      }
    }
  }

  // 5) Import remaining remote events not seen locally (new on the server).
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
        subjectId: resolveSubjectStrict(parsed, subjects, existing.subjectId, ensureSubjectByName),
        kind: parsed.xKind === 'PLAN' ? 'plan' as const : 'real' as const,
      };
      if (!sameContent(existing, mapped) || existing.etag !== item.etag) {
        eventRepo.update(existing.id, { ...mapped, href: item.href, etag: item.etag, pushed: mapped });
        result.updated++;
      }
      continue;
    }
    const vevent = parsed;
    const subjectId = resolveSubjectStrict(vevent, subjects, fallbackId, ensureSubjectByName);
    const localId =
      vevent.xLocalId && eventRepo.getById(vevent.xLocalId)
        ? vevent.xLocalId
        : `caldav-${Date.now()}-${Math.round(Math.random() * 10000)}`;
    const mapped = {
      title: vevent.summary || 'Imported event',
      description: vevent.description,
      start: new Date(vevent.dtStart).toISOString(),
      end: new Date(vevent.dtEnd).toISOString(),
      subjectId,
      kind: vevent.xKind === 'PLAN' ? 'plan' as const : 'real' as const,
    };
    eventRepo.create({
      id: localId,
      uid,
      ...mapped,
      href: item.href,
      etag: item.etag,
      pushed: mapped,
    });
    result.imported++;
  }

  // 6) TODOs (VTODO in the same calendar) ride along with the same sync.
  const todoCounters = await syncTodos(settings);
  result.errors += todoCounters.errors;

  result.message = [
    result.created ? `${result.created} pushed` : '',
    result.updated ? `${result.updated} updated` : '',
    result.imported ? `${result.imported} imported` : '',
    todoCounters.pushed ? `${todoCounters.pushed} todos pushed` : '',
    todoCounters.imported ? `${todoCounters.imported} todos imported` : '',
    result.errors ? `${result.errors} failed` : '',
  ].filter(Boolean).join(', ') || 'All up to date';
  result.message += `. Server returned ${result.remoteCount} usable event(s) of ${remote.responses} response(s) (${remote.withHref} hrefs, ${remote.withCalendarData} calendar-data).`;
  if (result.deleted > 0) {
    result.message += `. Removed ${result.deleted}: ${result.removedUids.join(', ')}`;
  }

  return result;
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

/**
 * Resolve where VTODO resources should be stored. The main calendar may be
 * VEVENT-only (Nextcloud default when created without an explicit
 * supported-calendar-component-set): PUT of a VTODO there fails with
 * InvalidComponentType. In that case a dedicated 'CDMM-Tasks' calendar is
 * created (once) in the calendar HOME (the parent of the configured calendar —
 * a calendar is not itself a home, MKCOL inside it fails with
 * InvalidResourceType) and used for todos.
 */
export async function resolveTodoCollection(settings: UserSettings): Promise<string | null> {
  const main = collectionUrl(settings);
  const supported = await fetchSupportedComponents(settings);
  if (!supported || supported.includes('VTODO')) return main;

  const raw = settings.calDav.serverUrl.trim().replace(/\/+$/, '');
  // <home>/<calendar> -> <home>; the last path segment is the collection name.
  const lastSlash = raw.lastIndexOf('/');
  const home = lastSlash > originOf(raw).length ? raw.slice(0, lastSlash) : raw;
  const tasksUrl = `${home}/${encodeURIComponent('CDMM-Tasks')}/`;
  const tasksHref = toRequestUrl(tasksUrl);

  // Prefer the dedicated tasks calendar when discovery can see it.
  try {
    const disc = await discoverCalendars(settings);
    const existing = disc.calendars.find((c) =>
      /cdmm-tasks|cdmm_tasks|studycore-tasks|studycore_tasks/i.test(c.href || c.displayName || '')
    );
    if (existing) {
      return /^https?:\/\//.test(existing.href)
        ? existing.href
        : originOf(settings.calDav.serverUrl) + (existing.href.startsWith('/') ? existing.href : '/' + existing.href);
    }
  } catch {
    /* discovery failed — fall through to creation attempt */
  }

  try {
    const res = await fetch(toRequestUrl(tasksUrl), {
      method: 'MKCOL',
      headers: headers(settings, { 'Content-Type': 'application/xml', Depth: '0' }),
      body:
        `<?xml version="1.0" encoding="utf-8"?>` +
        `<D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">` +
        `<D:set><D:prop>` +
        `<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>` +
        `<C:supported-calendar-component-set><C:comp name="VTODO"/><C:comp name="VEVENT"/></C:supported-calendar-component-set>` +
        `<D:displayname>CDMM-Tasks</D:displayname>` +
        `</D:prop></D:set>` +
        `</D:mkcol>`,
      credentials: 'omit',
    });
    if (res.status < 300 || res.status === 405) {
      // 405 = already exists, reuse it.
      return tasksHref;
    }
    const detail = await res.text().catch(() => '');
    console.error(`[todo-sync] MKCOL CDMM-Tasks failed: ${res.status} ${detail.trim().slice(0, 200)}`);
  } catch (err) {
    console.error('[todo-sync] failed to create dedicated tasks calendar', err);
  }
  return null;
}

/** Local re-exports to keep this module's imports explicit. */

/**
 * Bidirectional sync for TODOs (CalDAV VTODO resources).
 * Content-first reconcile like events: push unsynced local tasks, pull remote
 * ones, adopt remote on conflict when the local copy has no unsynced edits.
 */
export async function syncTodos(
  settings: UserSettings
): Promise<{ pushed: number; updated: number; imported: number; errors: number }> {
  const counters = { pushed: 0, updated: 0, imported: 0, errors: 0 };

  const todoCollection = await resolveTodoCollection(settings);
  if (!todoCollection) {
    return { ...counters, errors: counters.errors + 1 };
  }

  let remote;
  try {
    remote = await fetchCalDavTodos(settings, todoCollection);
  } catch (err) {
    console.error('[todo-sync] failed to fetch remote todos', err);
    return { ...counters, errors: counters.errors + 1 };
  }

  const remoteByUid = new Map<string, { href: string; etag: string; ics: string }>();
  for (const item of remote.items) {
    const task = vTodoToTask(item.ics);
    if (task && task.uid && !remoteByUid.has(task.uid)) {
      remoteByUid.set(task.uid, item);
    }
  }

  const local = todoRepo.getAll();

  const contentOf = (t: TodoTask) =>
    JSON.stringify([t.title, t.description || null, t.important, t.urgent, t.dueDate || null, t.completed]);

  // 1) Push local tasks that were never uploaded.
  for (const t of local) {
    if (t.etag) continue;
    if (remoteByUid.has(t.uid)) continue;
    try {
      const { href, etag } = await putCalDavEvent(settings, todoToVTodo(t), t.uid, t.href, todoCollection);
      todoRepo.update(t.id, { href, etag });
      counters.pushed++;
    } catch (err) {
      counters.errors++;
      console.error(`[todo-sync] failed to push task ${t.uid}`, err);
    }
  }

  // 2) Reconcile + import; prune local tasks deleted on the server.
  for (const t of local) {
    const remoteItem = remoteByUid.get(t.uid);
    if (!remoteItem) {
      if (t.etag && (await probeCalDavEvent(settings, t.href || '')) === false) {
        todoRepo.delete(t.id);
        counters.updated++;
      }
      continue;
    }
    remoteByUid.delete(t.uid);
    const remoteTask = vTodoToTask(remoteItem.ics);
    if (!remoteTask) continue;

    const sameContent = contentOf(t) === contentOf(remoteTask);
    if (sameContent) {
      if (t.etag !== remoteItem.etag || t.href !== remoteItem.href) {
        todoRepo.update(t.id, { href: remoteItem.href, etag: remoteItem.etag });
      }
      continue;
    }
    // Local unsynced edit (no etag change since push is write-through) wins
    // only when the server still holds our last upload; otherwise remote wins.
    if (t.etag === remoteItem.etag) {
      try {
        const { href, etag } = await putCalDavEvent(settings, todoToVTodo(t), t.uid, t.href, todoCollection);
        todoRepo.update(t.id, { href, etag });
        counters.updated++;
      } catch (err) {
        counters.errors++;
        console.error(`[todo-sync] failed to push edited task ${t.uid}`, err);
      }
    } else {
      todoRepo.update(t.id, {
        title: remoteTask.title,
        description: remoteTask.description,
        important: remoteTask.important,
        urgent: remoteTask.urgent,
        dueDate: remoteTask.dueDate,
        completed: remoteTask.completed,
        href: remoteItem.href,
        etag: remoteItem.etag,
      });
      counters.updated++;
    }
  }

  // 3) Import remaining remote tasks.
  for (const [uid, item] of remoteByUid) {
    const remoteTask = vTodoToTask(item.ics);
    if (!remoteTask) continue;
    todoRepo.create({
      uid,
      title: remoteTask.title,
      description: remoteTask.description,
      important: remoteTask.important,
      urgent: remoteTask.urgent,
      dueDate: remoteTask.dueDate,
      completed: remoteTask.completed,
      createdAt: remoteTask.createdAt,
      href: item.href,
      etag: item.etag,
    });
    counters.imported++;
  }

  return counters;
}