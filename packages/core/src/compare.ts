import type { Config } from "./config";
import type { Cost } from "./schema";

/**
 * What a cost compares with (decision 28, RFC-0002 §4.5). Worked out from the
 * cost and the site's basket (configuration `comparisons`), never stored on
 * the card. The basket is the same for every card, so the comparison never
 * depends on who made the promise (principle 5).
 */

/** How many currency units one configured money unit is. */
const UNIT_SCALE: Record<string, number> = { "": 1, k: 1e3, m: 1e6, bn: 1e9 };

export type ComparisonKind = "person" | "household" | "share" | "unit";

export interface Comparison {
  kind: ComparisonKind;
  /** The basket unit's id; "person", "household" or "share" for the others. */
  id: string;
  /** [low, central, high]: money per person or household, a share of the total (0.01 is 1%), or a count of units. */
  value: [number, number, number];
  /** Prices of: the year the unit cost (or population, or total) is in. */
  year: string;
  /** The source's quality label (sourced, approx, unverified…). */
  quality: string;
  source: { title: string; url: string; locator?: string };
}

/**
 * Comparisons for a cost: per person, per household, a share of the site's
 * yearly total (for a yearly cost), then each basket unit of the same kind,
 * recurring for a yearly cost and one-off for a one-off cost, in the
 * basket's order. Ranges in, ranges out: the low count divides the low cost
 * by the high unit cost. Empty without a basket, without a range, or for a
 * money unit the engine cannot scale.
 */
export function compare(cost: Cost | null | undefined, config: Pick<Config, "money" | "comparisons">, opts: { oneOff?: boolean } = {}): Comparison[] {
  const basket = config.comparisons;
  const scale = UNIT_SCALE[config.money.unit];
  if (!basket || !cost?.range || scale === undefined) return [];
  const yearly = !opts.oneOff && config.money.period !== "total";
  const perYear = config.money.period === "month" && yearly ? 12 : 1;
  const [a, b, c] = cost.range.map((x) => Math.abs(x) * scale * perYear);
  const [low, central, high] = [Math.min(a!, c!), b!, Math.max(a!, c!)];
  const out: Comparison[] = [];
  const divide = (kind: ComparisonKind, id: string, by: { value: number; year: string; source: Comparison["source"] & { quality: string } }) => {
    const { quality, ...source } = by.source;
    out.push({ kind, id, value: [low / by.value, central / by.value, high / by.value], year: by.year, quality, source });
  };
  if (basket.population) divide("person", "person", basket.population);
  if (basket.households) divide("household", "household", basket.households);
  if (yearly && basket.total) divide("share", "share", basket.total);
  for (const u of basket.units) {
    if ((u.type === "recurring") !== yearly) continue;
    const { quality, ...source } = u.source;
    out.push({ kind: "unit", id: u.id, value: [low / u.cost[2], central / u.cost[1], high / u.cost[0]], year: u.price_year, quality, source });
  }
  return out;
}
