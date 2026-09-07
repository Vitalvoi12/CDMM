export interface IcsVEvent {
  uid: string;
  summary?: string;
  description?: string;
  dtStart: string;
  dtEnd: string;
  dtStamp?: string;
  xSubject?: string;
  xSubjectName?: string;
  xLocalId?: string;
}

export function basicIcsDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

function parseIcsDateTime(raw: string): string {
  const value = raw.slice(raw.lastIndexOf(':') + 1).trim();
  if (value.endsWith('Z')) {
    const basic = value.slice(0, -1);
    const iso = `${basic.slice(0, 4)}-${basic.slice(4, 6)}-${basic.slice(6, 8)}T${basic.slice(9, 11)}:${basic.slice(11, 13)}:${basic.slice(13, 15)}Z`;
    return new Date(iso).toISOString();
  }
  if (/^\d{8}$/.test(value)) {
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00`;
    return new Date(iso).toISOString();
  }
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`;
  return new Date(iso).toISOString();
}

export function parseIcs(text: string): IcsVEvent[] {
  const folded = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .reduce((acc: string[], line) => {
      if (line.startsWith(' ')) {
        if (acc.length > 0) acc[acc.length - 1] += line.slice(1);
      } else {
        acc.push(line);
      }
      return acc;
    }, []);

  const events: IcsVEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of folded) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const name = current.UID;
        const start = current.DTSTART;
        const end = current.DTEND;
        if (name && start && end) {
          events.push({
            uid: name,
            summary: current.SUMMARY,
            description: current.DESCRIPTION,
            dtStart: parseIcsDateTime(start),
            dtEnd: parseIcsDateTime(end),
            dtStamp: current.DTSTAMP ? parseIcsDateTime(current.DTSTAMP) : undefined,
            xSubject: current['X-STUDYCORE-SUBJECT'],
            xSubjectName: current['X-STUDYCORE-SUBJECT-NAME'],
            xLocalId: current['X-STUDYCORE-LOCALID'],
          });
        }
      }
      current = null;
      continue;
    }
    if (current && line.includes(':')) {
      const sep = line.indexOf(':');
      const semicolon = line.indexOf(';');
      const keyEnd = semicolon > -1 && semicolon < sep ? semicolon : sep;
      const key = line.slice(0, keyEnd).toUpperCase();
      const value = line.slice(sep + 1);
      current[key] = value;
    }
  }

  return events;
}

export function serializeVCalendar(events: IcsVEvent[]): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CDMM//Study Tracker//EN'];
  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${basicIcsDate(ev.dtStamp ? new Date(ev.dtStamp) : new Date())}`);
    lines.push(`DTSTART:${basicIcsDate(new Date(ev.dtStart))}`);
    lines.push(`DTEND:${basicIcsDate(new Date(ev.dtEnd))}`);
    if (ev.summary) lines.push(lineFold(`SUMMARY:${ev.summary}`));
    if (ev.description) lines.push(lineFold(`DESCRIPTION:${ev.description}`));
    if (ev.xSubject) lines.push(`X-STUDYCORE-SUBJECT:${ev.xSubject}`);
    if (ev.xSubjectName) lines.push(`X-STUDYCORE-SUBJECT-NAME:${lineFold(ev.xSubjectName)}`);
    if (ev.xLocalId) lines.push(`X-STUDYCORE-LOCALID:${ev.xLocalId}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function lineFold(text: string, limit = 74): string {
  const bytes = text;
  if (bytes.length <= limit) return bytes;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += limit - 1) {
    chunks.push((i < limit ? '' : ' ') + bytes.slice(i, i + limit - 1));
  }
  return chunks.join('\r\n');
}