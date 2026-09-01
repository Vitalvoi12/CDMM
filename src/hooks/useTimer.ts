import { useState, useEffect, useRef, useCallback } from 'react';

export function useTimer(startTime: string | null) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!startTime) {
      setElapsed(0);
      return;
    }

    const calc = () => Date.now() - new Date(startTime).getTime();
    setElapsed(calc());

    intervalRef.current = setInterval(() => {
      setElapsed(calc());
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startTime]);

  const reset = useCallback(() => {
    setElapsed(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  return { elapsed, reset };
}
