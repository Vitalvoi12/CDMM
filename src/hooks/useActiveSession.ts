import { useState, useCallback, useEffect } from 'react';
import type { CalendarEvent } from '../types';

interface ActiveSession {
  subjectId: string;
  start: string;
}

const STORAGE_KEY = 'studycore-active-session';

function loadSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSession;
    if (parsed.subjectId && parsed.start) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveSession(session: ActiveSession | null) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function useActiveSession() {
  const [session, setSession] = useState<ActiveSession | null>(loadSession);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  const startSession = useCallback((subjectId: string) => {
    setSession({
      subjectId,
      start: new Date().toISOString(),
    });
  }, []);

  const stopSession = useCallback((): CalendarEvent | null => {
    if (!session) return null;
    const event: CalendarEvent = {
      id: String(Date.now()),
      uid: `evt-${Date.now()}@studycore`,
      subjectId: session.subjectId,
      title: session.subjectId,
      start: session.start,
      end: new Date().toISOString(),
    };
    setSession(null);
    return event;
  }, [session]);

  return {
    isActive: session !== null,
    subjectId: session?.subjectId || null,
    startTime: session?.start || null,
    startSession,
    stopSession,
  };
}
