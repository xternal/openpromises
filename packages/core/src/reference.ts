import { categoryOf, type Config } from "./config";
import { PROMISED } from "./ladder";
import type { Card } from "./schema";

/**
 * How long similar promises took (decision 28, RFC-0002 §4.3): for the cards
 * in an area, the months from the promise to its first finished status. It
 * says how many cards it compares and how many have finished, since counting
 * only the finished ones understates the time: the slow ones have not
 * finished yet. Null below the minimum (10 cards by default).
 */
export interface ReferenceClass {
  /** Comparable cards: same area, on the ladder. */
  n: number;
  finished: number;
  /** Median months to finish, among those that finished; undefined when none has. */
  medianMonths?: number;
}

export const REFERENCE_CLASS_MIN = 10;

const months = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / (1000 * 60 * 60 * 24 * 30.4375);

export function referenceClass(cards: readonly Card[], area: string, config: Config, min = REFERENCE_CLASS_MIN): ReferenceClass | null {
  const comparable = cards.filter((c) => c.area === area && categoryOf(config, c.status) !== "off_ladder");
  if (comparable.length < min) return null;
  const took: number[] = [];
  for (const c of comparable) {
    const start = c.events.find((e) => e.type === PROMISED)?.date ?? c.made_on;
    const end = c.events.find((e) => categoryOf(config, e.type) === "finished")?.date;
    if (end) took.push(months(start, end));
  }
  took.sort((a, b) => a - b);
  const mid = took.length >> 1;
  const median = took.length ? (took.length % 2 ? took[mid]! : (took[mid - 1]! + took[mid]!) / 2) : undefined;
  return { n: comparable.length, finished: took.length, ...(median !== undefined ? { medianMonths: Math.round(median) } : {}) };
}
