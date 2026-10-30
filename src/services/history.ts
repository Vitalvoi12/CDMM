import {
  eventRepo,
  subjectRepo,
  todoRepo,
  dayTaskRepo,
  tombstoneRepo,
  type Tombstone,
} from './repositories';
import { notifySync } from './serverSync';
import type { CalendarEvent, DayTaskList, Subject, TodoTask } from '../types';

interface Snapshot {
  events: CalendarEvent[];
  todos: TodoTask[];
  dayTasks: DayTaskList[];
  tombstones: Tombstone[];
  /**
   * Only for subject actions (checkpoint's `subjects` option). Subject edits
   * are not checkpointed, so restoring the list on every undo would revert
   * them, or bring back a subject deleted without a checkpoint.
   */
  subjects?: Subject[];
}

interface HistoryEntry {
  label: string;
  snap: Snapshot;
}

const MAX_DEPTH = 50;

let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];

type CheckpointListener = (label: string, entry: object) => void;
const checkpointListeners = new Set<CheckpointListener>();

/**
 * Hear each new checkpoint (the phone's undo toast). `entry` identifies it
 * for undoIfLatest.
 */
export function subscribeCheckpoint(fn: CheckpointListener): () => void {
  checkpointListeners.add(fn);
  return () => checkpointListeners.delete(fn);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function takeSnapshot(withSubjects = false): Snapshot {
  return {
    events: clone(eventRepo.getAll()),
    todos: clone(todoRepo.getAll()),
    dayTasks: clone(dayTaskRepo.getAll()),
    tombstones: clone(tombstoneRepo.getAll()),
    ...(withSubjects ? { subjects: clone(subjectRepo.getAll()) } : {}),
  };
}

/**
 * Record the current state before a user mutation, so Ctrl+Z can revert it.
 * Call once per user action, right before mutating the repos.
 */
export function checkpoint(label: string, opts: { subjects?: boolean } = {}): void {
  const entry = { label, snap: takeSnapshot(opts.subjects) };
  undoStack.push(entry);
  if (undoStack.length > MAX_DEPTH) undoStack.shift();
  // A new action invalidates the redo trail.
  redoStack = [];
  for (const fn of checkpointListeners) fn(label, entry);
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Restore a snapshot and reconcile sync state:
 * - records that vanish vs. the pre-restore state were created by the undone
 *   action → tombstone them so the deletion propagates to other devices;
 * - records that reappear were deleted by the undone action → drop their
 *   tombstones and re-push them with a fresh updatedAt so undo wins LWW;
 * - records whose content changed get re-pushed with a fresh updatedAt.
 */
function restore(snap: Snapshot): void {
  const curEvents = eventRepo.getAll();
  const curTodos = todoRepo.getAll();

  tombstoneRepo.replaceAll(clone(snap.tombstones));
  eventRepo.replaceAll(clone(snap.events));
  todoRepo.replaceAll(clone(snap.todos));

  reconcile('events', curEvents, snap.events);
  reconcile('todos', curTodos, snap.todos);
  if (snap.subjects) restoreSubjects(snap.subjects, snap.tombstones);

  // Day checklists are never deleted, only emptied: restore each day the
  // undone action touched and re-stamp it so the restored list wins LWW.
  const curDays = dayTaskRepo.getAll();
  const snapDays = new Map(snap.dayTasks.map((l) => [l.id, l.tasks]));
  const changedDays: string[] = [];
  const restoredDays = curDays.map((l) => {
    const tasks = snapDays.get(l.id) ?? [];
    if (sameJson(l.tasks, tasks)) return l;
    changedDays.push(l.id);
    return { ...l, tasks: clone(tasks) };
  });
  dayTaskRepo.replaceAll(restoredDays);
  for (const id of changedDays) dayTaskRepo.bump(id);

  // Pages hold useState copies of the repos — tell them to re-read.
  notifySync();
}

/**
 * Subjects the undone action deleted come back (re-pushed so they win LWW);
 * subjects the snapshot has tombstoned go again. Others are left alone.
 */
function restoreSubjects(snapSubjects: Subject[], snapTombs: Tombstone[]): void {
  const cur = subjectRepo.getAll();
  const curIds = new Set(cur.map((s) => s.id));
  const gone = new Set(snapTombs.filter((t) => t.entity === 'subjects').map((t) => t.key));
  const back = snapSubjects.filter((s) => !curIds.has(s.id));
  // Snapshot order (a restored subject goes back to its place), then any
  // subject added since.
  const curById = new Map(cur.map((s) => [s.id, s]));
  const snapIds = new Set(snapSubjects.map((s) => s.id));
  const ordered = [
    ...snapSubjects.map((s) => curById.get(s.id) ?? clone(s)),
    ...cur.filter((s) => !snapIds.has(s.id)),
  ].filter((s) => !gone.has(s.id));
  subjectRepo.replaceAll(ordered);
  for (const s of back) subjectRepo.update(s.id, {});
  for (const s of cur) {
    if (!gone.has(s.id)) continue;
    // Re-add the tombstone so the deletion is pushed again.
    tombstoneRepo.remove('subjects', s.id);
    tombstoneRepo.add('subjects', s.id);
  }
}

function reconcile(
  entity: 'events' | 'todos',
  current: { id: string }[],
  snapshot: { id: string }[]
): void {
  const curIds = new Set(current.map((r) => r.id));
  const snapById = new Map(snapshot.map((r) => [r.id, r]));
  const curById = new Map(current.map((r) => [r.id, r]));

  for (const [id, cur] of curById) {
    if (!snapById.has(id)) {
      // Created by the undone action — propagate the removal.
      tombstoneRepo.add(entity, id);
    } else if (!sameJson(cur, snapById.get(id))) {
      // Changed by the undone action — re-push the restored copy.
      bump(entity, id);
    }
  }
  for (const id of snapById.keys()) {
    if (!curIds.has(id)) {
      // Deleted by the undone action — resurrect and re-push.
      tombstoneRepo.remove(entity, id);
      bump(entity, id);
    }
  }
}

/** Refresh updatedAt (which also marks the record dirty for sync). */
function bump(entity: 'events' | 'todos', id: string): void {
  if (entity === 'events') {
    const rec = eventRepo.getById(id);
    if (rec) eventRepo.update(id, { ...rec });
  } else {
    const rec = todoRepo.getById(id);
    if (rec) todoRepo.update(id, { ...rec });
  }
}

/** Revert the last checkpointed action. Returns its label, if any. */
export function undo(): string | null {
  const entry = undoStack.pop();
  if (!entry) return null;
  redoStack.push({ label: entry.label, snap: takeSnapshot(!!entry.snap.subjects) });
  restore(entry.snap);
  return entry.label;
}

/** Undo only if `entry` (from subscribeCheckpoint) is still the latest action. */
export function undoIfLatest(entry: object): boolean {
  if (undoStack[undoStack.length - 1] !== entry) return false;
  undo();
  return true;
}

/** Re-apply an undone action. Returns its label, if any. */
export function redo(): string | null {
  const entry = redoStack.pop();
  if (!entry) return null;
  undoStack.push({ label: entry.label, snap: takeSnapshot(!!entry.snap.subjects) });
  restore(entry.snap);
  return entry.label;
}

/** Clear history (e.g. on logout / account switch). */
export function clearHistory(): void {
  undoStack = [];
  redoStack = [];
}

/** Label of the action Undo would revert, if any (the phone's view sheet shows it). */
export function undoLabel(): string | null {
  return undoStack[undoStack.length - 1]?.label ?? null;
}

/** Label of the action Redo would re-apply, if any. */
export function redoLabel(): string | null {
  return redoStack[redoStack.length - 1]?.label ?? null;
}
