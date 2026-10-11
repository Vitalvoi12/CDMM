/**
 * The task being dragged from the Checklist onto a timeline.
 *
 * HTML drag and drop hides the dragged data until the drop, but the timeline
 * needs the task's length while hovering to paint the ghost block. The source
 * parks the task here on dragstart; drop targets recognise the drag by its
 * MIME type and read the details from this slot.
 */

export const TASK_DRAG_MIME = 'application/x-cdmm-task';

/** Block length for a task without an estimate. */
export const DEFAULT_TASK_MINUTES = 60;

export interface TaskDragPayload {
  /** DayTask or TodoTask id — stored on the block as `taskId`. */
  taskId: string;
  text: string;
  /** '' for a todo or a no-subject checklist task (a custom plan block). */
  subjectId: string;
  minutes: number;
}

let current: TaskDragPayload | null = null;

export function beginTaskDrag(e: React.DragEvent, payload: TaskDragPayload): void {
  current = payload;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(TASK_DRAG_MIME, payload.taskId);
  // Plain text too, so the drag shows a sensible label outside the app.
  e.dataTransfer.setData('text/plain', payload.text);
}

export function endTaskDrag(): void {
  current = null;
}

/** The task under the pointer, or null when this drag is not a task. */
export function draggedTask(e: React.DragEvent): TaskDragPayload | null {
  return current && e.dataTransfer.types.includes(TASK_DRAG_MIME) ? current : null;
}
