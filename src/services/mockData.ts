import type { Subject, CalendarEvent, UserSettings } from '../types';

export const mockSubjects: Subject[] = [
  { id: 'math', name: 'Mathematics', color: '#3f51b5', icon: 'calculate', modules: 12, progress: 75 },
  { id: 'programming', name: 'Programming', color: '#00897b', icon: 'code', modules: 8, progress: 90 },
  { id: 'physics', name: 'Physics', color: '#d32f2f', icon: 'science', modules: 5, progress: 45 },
  { id: 'english', name: 'English', color: '#f57c00', icon: 'menu_book', modules: 3, progress: 60 },
  { id: 'history', name: 'History', color: '#7b1fa2', icon: 'history_edu', modules: 6, progress: 55 },
  { id: 'chemistry', name: 'Chemistry', color: '#0277bd', icon: 'biotech', modules: 4, progress: 30 },
  { id: 'biology', name: 'Biology', color: '#2e7d32', icon: 'biotech', modules: 7, progress: 65 },
  { id: 'art', name: 'Art & Design', color: '#c2185b', icon: 'palette', modules: 2, progress: 80 },
];

function makeDate(offsetDays: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

let eventId = 0;
function evt(
  subjectId: string,
  offsetDays: number,
  startHour: number,
  startMin: number,
  endHour: number,
  endMin: number,
  title?: string,
  description?: string
): CalendarEvent {
  eventId++;
  return {
    id: `evt-${eventId}`,
    uid: `evt-${eventId}@studycore`,
    subjectId,
    title: title || mockSubjects.find((s) => s.id === subjectId)?.name || subjectId,
    description,
    start: makeDate(offsetDays, startHour, startMin),
    end: makeDate(offsetDays, endHour, endMin),
  };
}

export const mockEvents: CalendarEvent[] = [
  // 6 days ago
  evt('math', -6, 9, 0, 10, 30, 'Mathematics', 'Linear Algebra fundamentals'),
  evt('programming', -6, 11, 0, 12, 20, 'Programming', 'Linked lists and binary trees in C++'),
  evt('english', -6, 14, 0, 15, 0, 'English', 'Essay writing practice'),

  // 5 days ago
  evt('math', -5, 8, 30, 10, 0, 'Mathematics', 'Calculus review'),
  evt('physics', -5, 10, 30, 12, 0, 'Physics', 'Thermodynamics chapter'),
  evt('programming', -5, 14, 0, 15, 30, 'Programming', 'Graph algorithms'),
  evt('biology', -5, 16, 0, 17, 0, 'Biology', 'Cell structure notes'),

  // 4 days ago
  evt('math', -4, 9, 0, 11, 0, 'Mathematics', 'Probability theory'),
  evt('programming', -4, 13, 0, 14, 30, 'Programming', 'Sorting algorithms'),
  evt('english', -4, 15, 0, 15, 45, 'English', 'Vocabulary review'),
  evt('history', -4, 9, 0, 10, 15, 'History', 'World War II overview'),

  // 3 days ago
  evt('physics', -3, 9, 0, 10, 30, 'Physics', 'Quantum mechanics intro'),
  evt('math', -3, 11, 0, 12, 0, 'Mathematics', 'Differential equations'),
  evt('programming', -3, 14, 0, 15, 0, 'Programming', 'Dynamic programming'),
  evt('chemistry', -3, 16, 0, 17, 0, 'Chemistry', 'Organic reactions'),

  // 2 days ago
  evt('math', -2, 9, 30, 11, 0, 'Mathematics', 'Matrix operations'),
  evt('physics', -2, 13, 0, 14, 0, 'Physics', 'Lab preparation'),
  evt('english', -2, 15, 0, 16, 0, 'English', 'Reading comprehension'),
  evt('art', -2, 10, 0, 11, 0, 'Art & Design', 'Color theory'),

  // 1 day ago
  evt('programming', -1, 10, 0, 11, 30, 'Programming', 'System design basics'),
  evt('math', -1, 14, 0, 15, 30, 'Mathematics', 'Statistics review'),
  evt('biology', -1, 9, 0, 9, 45, 'Biology', 'Quick genetics review'),
  evt('history', -1, 16, 0, 17, 30, 'History', 'Cold War essay'),

  // Today
  evt('math', 0, 9, 10, 10, 25, 'Mathematics', 'Linear Algebra'),
  evt('physics', 0, 11, 0, 12, 0, 'Physics', 'Thermodynamics review'),
  evt('programming', 0, 14, 0, 15, 20, 'Programming', 'Working through linked lists and binary trees implementation in C++.'),

  // Tomorrow
  evt('physics', 1, 9, 0, 10, 0, 'Physics', 'Electromagnetism'),
  evt('english', 1, 11, 0, 12, 0, 'English', 'Grammar exercises'),
  evt('programming', 1, 14, 0, 15, 0, 'Programming', 'API design'),
  evt('art', 1, 16, 0, 17, 0, 'Art & Design', 'Sketching basics'),

  // Next few days
  evt('math', 2, 9, 0, 10, 30, 'Mathematics', 'Complex analysis'),
  evt('english', 2, 13, 0, 14, 0, 'English', 'Reading comprehension'),
  evt('chemistry', 2, 10, 0, 11, 30, 'Chemistry', 'Periodic table trends'),

  evt('programming', 3, 10, 0, 12, 0, 'Programming', 'System architecture'),
  evt('math', 3, 14, 0, 15, 30, 'Mathematics', 'Number theory'),
  evt('biology', 3, 9, 0, 10, 0, 'Biology', 'Ecology chapter'),

  evt('physics', 4, 9, 0, 10, 30, 'Physics', 'Optics'),
  evt('english', 4, 11, 0, 12, 0, 'English', 'Essay writing'),
  evt('history', 4, 14, 0, 15, 0, 'History', 'Renaissance period'),

  evt('math', 5, 9, 30, 11, 0, 'Mathematics', 'Calculus II'),
  evt('programming', 5, 14, 0, 16, 0, 'Programming', 'Advanced algorithms'),
];

export const mockSettings: UserSettings = {
  dailyGoalMinutes: 360,
  calDav: {
    serverUrl: 'https://caldav.example.com/user/calendar/',
    username: 'studycore_user',
    password: '',
    calendar: 'default',
    connected: true,
    lastSync: new Date(Date.now() - 120000).toISOString(),
  },
};
