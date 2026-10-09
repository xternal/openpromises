import type { Config, Cost } from "@openpromises/core";
import type { Words } from "./messages";

/**
 * Dates, numbers and money in the reader's language. Dates are days
 * (YYYY-MM-DD) and are shown as days, so no time zone can move them.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const noon = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** "6 October 2026", "6 октября 2026 г." */
export function longDate(w: Words, iso: string): string {
  if (!DAY.test(iso)) return iso;
  return noon(iso).toLocaleDateString(w.m.intl, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "October 2026" */
export function monthYear(w: Words, iso: string): string {
  if (!DAY.test(iso)) return iso;
  return noon(iso).toLocaleDateString(w.m.intl, { month: "long", year: "numeric", timeZone: "UTC" });
}

/** A figure with as many decimals as its size needs: 115, 24.6, 0.45. */
export function figure(w: Words, x: number): string {
  const a = Math.abs(x);
  const digits = a >= 100 ? 0 : a >= 1 ? 1 : 2;
  return new Intl.NumberFormat(w.m.intl, { maximumFractionDigits: digits }).format(a);
}

/** The currency's symbol in this language: "£", "₽", "€". */
export function currencySymbol(w: Words, currency: string): string {
  try {
    const parts = new Intl.NumberFormat(w.m.intl, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

const MINUS = "−";

/** "Costs" → "costs", for words inside a sentence; "NHS" stays as it is. */
export const lowerFirst = (s: string) => (/^\p{Lu}\p{Ll}/u.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);

/** Under 0.1 of a billion, an amount reads in millions, so a small range stays a range ("£14m to £18m", not "£0.01bn to £0.02bn"). */
const MILLIONS_BELOW_BN = 0.1;

/** An amount in the configured unit: "£1.2bn", "£45m", "1,2 млрд ₽". */
export function money(w: Words, config: Pick<Config, "money">, value: number): string {
  const unit = config.money.unit;
  const a = Math.abs(value);
  if (unit === "bn" && a > 0 && a < MILLIONS_BELOW_BN)
    return `${value < 0 ? MINUS : ""}${w.t("money.m", { sym: currencySymbol(w, config.money.currency), n: new Intl.NumberFormat(w.m.intl, { maximumFractionDigits: 0 }).format(Math.round(a * 1000)) })}`;
  const key = unit === "bn" || unit === "m" || unit === "k" ? `money.${unit}` : "money.none";
  const text = w.t(key, { sym: currencySymbol(w, config.money.currency), n: figure(w, value) });
  return `${value < 0 ? MINUS : ""}${key === "money.none" && unit ? `${text} ${unit}` : text}`;
}

export interface CostFacts {
  /** A negative range brings money in: costs are to the public purse. */
  raises: boolean;
  low: string;
  central: string;
  high: string;
}

/** A cost range as words, lowest first, whichever way the money goes. */
export function costFacts(w: Words, config: Pick<Config, "money">, range: readonly [number, number, number]): CostFacts {
  const [low, central, high] = range;
  const raises = central < 0;
  const [a, b] = [Math.abs(low), Math.abs(high)].sort((x, y) => x - y) as [number, number];
  return { raises, low: money(w, config, a), central: money(w, config, Math.abs(central)), high: money(w, config, b) };
}

/**
 * The cost as a card shows it: "Costs £0.36bn to £0.44bn a year", "Raises …",
 * "Cost not stated", "No costing published", or "Not costable" for a card
 * without parameters. `period` "total" is for a one-off (capital) cost.
 */
export function costText(w: Words, config: Pick<Config, "money">, cost: Cost | null | undefined, opts: { costable?: boolean; period?: "year" | "month" | "total" } = {}): string {
  if (opts.costable === false) return w.t("cost.not_costable");
  if (!cost) return w.t("cost.not_stated");
  if (!cost.range) return w.t("cost.no_figure");
  const f = costFacts(w, config, cost.range);
  return w.t(f.raises ? "cost.raises" : "cost.costs", { low: f.low, high: f.high, per: w.t(`per.${opts.period ?? config.money.period}`) });
}
