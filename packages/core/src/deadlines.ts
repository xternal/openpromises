import { categoryOf, type Config } from "./config";
import type { Card, Event } from "./schema";

/**
 * Making silence visible: when a promise's deadline passes with no outcome,
 * a job appends one automatic deadline_missed event. The status does not
 * change; an editor confirms what happened. Appending keeps history
 * append-only.
 */

/** Today's date as YYYY-MM-DD in a time zone (en-CA writes dates that way). */
export const todayIn = (timezone: string, now: Date = new Date()): string => now.toLocaleDateString("en-CA", { timeZone: timezone });

/** The deadline of the promise as it now stands: its current version's. */
export const deadlineOf = (card: Card): string | null => card.versions.at(-1)?.parameters?.deadline ?? null;

/** Whether a card is still open: its status is in the open or progress category. */
export const isOpen = (card: Card, config: Config): boolean => {
  const c = categoryOf(config, card.status);
  return c === "open" || c === "progress";
};

/**
 * The deadline_missed event to append to a card on a day, or null when none
 * is due: the card is still open, its current deadline is before today, and no
 * deadline_missed event has been recorded since that deadline.
 */
export function missedDeadline(card: Card, config: Config, today: string): Event | null {
  const deadline = deadlineOf(card);
  if (!deadline || deadline >= today || !isOpen(card, config)) return null;
  if (card.events.some((e) => e.type === "deadline_missed" && e.date >= deadline)) return null;
  return { date: today, type: "deadline_missed", text: { ...config.deadlines.text }, auto: true };
}
