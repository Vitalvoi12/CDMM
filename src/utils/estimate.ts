/** Estimate presets for checklist tasks, in minutes. Rough on purpose: a guess, not a timer. */
export const EST_PRESETS = [15, 30, 45, 60, 90, 120];

/** Longest estimate accepted for one task (a day). */
const MAX_EST_MINUTES = 24 * 60;

/**
 * Step the estimate through the presets: +1 goes none → 15m → … → 2h (and
 * stays there), -1 goes back down and past 15m to none. A custom value steps
 * to the nearest preset in that direction.
 */
export function stepEstimate(cur: number | undefined, dir: 1 | -1): number | undefined {
  if (dir === 1) {
    if (!cur) return EST_PRESETS[0];
    return EST_PRESETS.find((m) => m > cur) ?? Math.max(cur, EST_PRESETS[EST_PRESETS.length - 1]);
  }
  if (!cur) return undefined;
  return [...EST_PRESETS].reverse().find((m) => m < cur);
}

/**
 * Read a typed estimate: "45", "45m", "1h", "1.5h", "1h 30m", "1:30".
 * Plain numbers are minutes. Returns undefined for empty input, null when the
 * text cannot be read (or is zero / longer than a day).
 */
export function parseEstimate(input: string): number | undefined | null {
  const s = input.trim().toLowerCase().replace(',', '.');
  if (!s) return undefined;
  let minutes: number;
  const clock = /^(\d+):([0-5]\d)$/.exec(s);
  if (clock) {
    minutes = Number(clock[1]) * 60 + Number(clock[2]);
  } else {
    const m = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?)?)?$/.exec(s);
    if (!m || (m[1] === undefined && m[2] === undefined)) return null;
    minutes = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  }
  minutes = Math.round(minutes);
  return minutes > 0 && minutes <= MAX_EST_MINUTES ? minutes : null;
}
