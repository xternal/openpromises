import { compare, type Comparison, type Config, type Cost } from "@openpromises/core";
import { currencySymbol } from "./format";
import type { Words } from "./messages";

/**
 * Comparisons in words (decision 28, RFC-0002 §5.2): neutral, ranges in and
 * ranges out, two significant figures, "about" when the range rounds to one
 * figure. Never "could build" or "instead".
 */

/** Two significant figures. */
const sig2 = (n: number) => (n === 0 ? 0 : Number(n.toPrecision(2)));

const num = (w: Words, n: number) => new Intl.NumberFormat(w.m.intl, { maximumSignificantDigits: 2 }).format(sig2(n));

/** "8–12", or "about 10" when both ends round to the same figure; with the number the plural form agrees with. */
function span(w: Words, low: number, central: number, high: number, show: (n: number) => string): { text: string; agree: number } {
  const [a, b] = [sig2(low), sig2(high)];
  if (a === b || !Number.isFinite(b)) return { text: w.t("compare.about", { n: show(central) }), agree: sig2(central) };
  return { text: w.t("compare.range", { low: show(low), high: show(high) }), agree: b };
}

/** Money in whole currency units: "£35", "35 ₽". */
const cash = (w: Words, config: Pick<Config, "money">, n: number) => {
  const sym = currencySymbol(w, config.money.currency);
  return w.t("money.none", { sym, n: num(w, n) });
};

/** A unit's name in the plural form the number takes: "polyclinic", "polyclinics", "поликлиник". */
function unitName(w: Words, config: Pick<Config, "comparisons" | "locales">, id: string, n: number): string {
  const unit = config.comparisons?.units.find((u) => u.id === id);
  const forms = unit?.label[w.locale] ?? unit?.label[config.locales.default] ?? {};
  const rule = new Intl.PluralRules(w.m.intl ?? w.locale).select(n);
  return forms[rule] ?? forms.other ?? id;
}

/** One comparison as a sentence: "Equal to the cost of 8–12 polyclinics", "£26–£46 a person a year". */
export function comparisonText(c: Comparison, config: Pick<Config, "money" | "comparisons" | "locales">, w: Words, opts: { oneOff?: boolean } = {}): string {
  const [low, central, high] = c.value;
  const per = w.t(opts.oneOff || config.money.period === "total" ? "per.total" : "per.year");
  if (c.kind === "person" || c.kind === "household") {
    const s = span(w, low, central, high, (n) => cash(w, config, n));
    return w.t(`compare.${c.kind}`, { amount: s.text, per });
  }
  if (c.kind === "share") {
    const pct = (n: number) => new Intl.NumberFormat(w.m.intl, { style: "percent", maximumSignificantDigits: 2 }).format(sig2(n));
    const s = span(w, low, central, high, pct);
    return w.t("compare.share", { amount: s.text, total: config.comparisons?.total?.label[w.locale] ?? config.comparisons?.total?.label[config.locales.default] ?? "" });
  }
  const s = span(w, low, central, high, (n) => num(w, n));
  return w.t("compare.unit", { count: s.text, unit: unitName(w, config, c.id, s.agree) });
}

export interface ComparisonLine {
  comparison: Comparison;
  text: string;
}

/**
 * Everything a cost compares with, in words, in the basket's order: per
 * person, per household, a share of the site's total, then the units. A
 * one-off cost compares only with one-off units.
 */
export function comparisonLines(cost: Cost | null | undefined, config: Pick<Config, "money" | "comparisons" | "locales">, w: Words, opts: { oneOff?: boolean } = {}): ComparisonLine[] {
  return compare(cost, config, opts).map((c) => ({ comparison: c, text: comparisonText(c, config, w, opts) }));
}

/** The lines a card shows: per person, per household and the share, then the first `comparisons.show` units (3 by default); a table lists them all. */
export const shownComparisons = (lines: readonly ComparisonLine[], config: Pick<Config, "comparisons">) => {
  let units = 0;
  return lines.filter((l) => l.comparison.kind !== "unit" || units++ < (config.comparisons?.show ?? 3));
};
