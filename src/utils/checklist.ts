import type { CalendarEvent, DayTask, TodoTask } from '../types';
import { dateKey } from './time';

export function checklistTasksForDay(todos: TodoTask[], events: CalendarEvent[], date: Date): DayTask[] {
  const day = dateKey(date);
  const planned = new Set<string>();
  const linked = new Set<string>();
  for (const event of events) {
    if (event.kind !== 'plan' || !event.taskId) continue;
    planned.add(event.taskId);
    if (dateKey(new Date(event.start)) === day) linked.add(event.taskId);
  }
  return todos.filter(task => {
    if (task.scheduledDate) return task.scheduledDate === day;
    if (planned.has(task.id)) return linked.has(task.id);
    return !!task.dueDate && dateKey(new Date(task.dueDate)) === day;
  }).map(toChecklistTask);
}

export function toChecklistTask(task: TodoTask): DayTask {
  return {
    id: task.id, text: task.title, done: task.completed, progress: task.progress,
    subjectId: task.subjectId, estMinutes: task.estMinutes,
  };
}
