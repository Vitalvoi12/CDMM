import type { TodoTask } from '../types';
import { basicIcsDate, lineFold } from './ics';

/** Escape per RFC 5545 TEXT: backslash, semicolon, comma, newline. */
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsUnescape(text: string): string {
  return text
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

export function todoToVTodo(task: TodoTask): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CDMM//Study Tracker//EN',
    'BEGIN:VTODO',
    `UID:${task.uid}`,
    `DTSTAMP:${basicIcsDate(new Date())}`,
    `CREATED:${basicIcsDate(new Date(task.createdAt))}`,
  ];
  if (task.dueDate) lines.push(`DUE;VALUE=DATE-TIME:${basicIcsDate(new Date(task.dueDate))}`);
  if (task.completed) {
    lines.push(`COMPLETED:${basicIcsDate(new Date())}`);
    lines.push(`STATUS:COMPLETED`);
  } else {
    lines.push(`STATUS:NEEDS-ACTION`);
  }
  lines.push(`SUMMARY:${icsEscape(task.title)}`);
  if (task.description) lines.push(`DESCRIPTION:${icsEscape(task.description)}`);
  lines.push(`X-STUDYCORE-IMPORTANT:${task.important ? '1' : '0'}`);
  lines.push(`X-STUDYCORE-URGENT:${task.urgent ? '1' : '0'}`);
  lines.push('END:VTODO');
  lines.push('END:VCALENDAR');
  for (let i = 0; i < lines.length; i++) {
    lines[i] = lineFold(lines[i]);
  }
  return lines.join('\r\n');
}

function parseIcsDateTime(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.slice(raw.lastIndexOf(':') + 1).trim();
  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}${value.endsWith('Z') ? 'Z' : ''}`;
    return new Date(iso).toISOString();
  }
  if (/^\d{8}$/.test(value)) {
    return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T18:00:00`).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Parse the first VTODO of an ICS resource. Returns null when it has none. */
export function vTodoToTask(ics: string): TodoTask | null {
  const folded = ics
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .reduce((acc: string[], line) => {
      if (line.startsWith(' ') && acc.length > 0) acc[acc.length - 1] += line.slice(1);
      else acc.push(line);
      return acc;
    }, []);

  let current: Record<string, string> | null = null;
  for (const line of folded) {
    if (line === 'BEGIN:VTODO') {
      current = {};
      continue;
    }
    if (line === 'END:VTODO') {
      break;
    }
    if (current && line.includes(':')) {
      const sep = line.indexOf(':');
      const semicolon = line.indexOf(';');
      const keyEnd = semicolon > -1 && semicolon < sep ? semicolon : sep;
      const key = line.slice(0, keyEnd).toUpperCase();
      current[key] = line.slice(sep + 1);
    }
  }

  if (!current || !current.UID) return null;

  const completed = (current.STATUS || '').toUpperCase() === 'COMPLETED' || !!current.COMPLETED;
  return {
    id: current['X-STUDYCORE-LOCALID'] || '',
    uid: current.UID,
    title: icsUnescape(current.SUMMARY || 'Untitled task'),
    description: current.DESCRIPTION ? icsUnescape(current.DESCRIPTION) : undefined,
    important: current['X-STUDYCORE-IMPORTANT'] === '1',
    urgent: current['X-STUDYCORE-URGENT'] === '1',
    dueDate: parseIcsDateTime(current.DUE),
    completed,
    createdAt: parseIcsDateTime(current.CREATED) || new Date().toISOString(),
  };
}
