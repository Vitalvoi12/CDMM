import { useEffect, useRef } from 'react';

/**
 * Keys that were not in the list at the last render within the same `scope`
 * (e.g. the day shown): rows just added, to animate in. A new scope, or the
 * first render, marks nothing — a whole list appearing isn't "added".
 */
export function useNewKeys(keys: string[], scope: string): Set<string> {
  const last = useRef<{ scope: string; keys: Set<string> } | null>(null);
  const fresh = new Set<string>();
  const prev = last.current;
  if (prev && prev.scope === scope) for (const k of keys) if (!prev.keys.has(k)) fresh.add(k);
  useEffect(() => {
    last.current = { scope, keys: new Set(keys) };
  });
  return fresh;
}
