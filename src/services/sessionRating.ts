import { eventRepo } from './repositories';
import { checkpoint } from './history';
import type { FocusRating } from '../utils/analytics';

/**
 * Store the post-session focus rating on the session's event. The note goes
 * into the event's description — the same "notes" field the event editor
 * shows — appended when the event already has one (one line: the
 * editor edits it in a single-line field).
 */
export function rateSession(eventId: string, rating: FocusRating, note: string): void {
  const event = eventRepo.getById(eventId);
  if (!event) return;
  checkpoint('Rate session');
  const description = note
    ? event.description ? `${event.description} · ${note}` : note
    : event.description;
  eventRepo.update(eventId, { focus: rating, description });
}
