import { useState, useCallback } from 'react';
import { addDays, startOfWeek } from '../utils/time';
import type { CalendarView } from '../types';

export function useCalendarNavigation(initialDate?: Date) {
  const [currentDate, setCurrentDate] = useState(initialDate || new Date());
  const [view, setView] = useState<CalendarView>('day');

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const goToPrevious = useCallback(() => {
    setCurrentDate((prev) => {
      switch (view) {
        case 'day':
          return addDays(prev, -1);
        case '3day':
          return addDays(prev, -3);
        case 'week':
          return addDays(prev, -7);
        case 'month':
          return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
        case 'year':
          return new Date(prev.getFullYear() - 1, 0, 1);
      }
    });
  }, [view]);

  const goToNext = useCallback(() => {
    setCurrentDate((prev) => {
      switch (view) {
        case 'day':
          return addDays(prev, 1);
        case '3day':
          return addDays(prev, 3);
        case 'week':
          return addDays(prev, 7);
        case 'month':
          return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
        case 'year':
          return new Date(prev.getFullYear() + 1, 0, 1);
      }
    });
  }, [view]);

  const getViewTitle = useCallback((): string => {
    const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
    switch (view) {
      case 'day':
        return currentDate.toLocaleDateString('en-US', opts);
      case '3day': {
        const end = addDays(currentDate, 2);
        return `${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', opts)}`;
      }
      case 'week': {
        const ws = startOfWeek(currentDate);
        const we = addDays(ws, 6);
        return `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', opts)}`;
      }
      case 'month':
        return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      case 'year':
        return String(currentDate.getFullYear());
    }
  }, [currentDate, view]);

  return {
    currentDate,
    setCurrentDate,
    view,
    setView,
    goToToday,
    goToPrevious,
    goToNext,
    getViewTitle,
  };
}
