import { parseCorrectionPath, type Card, type Config, type Correction } from "@openpromises/core";
import { costText, longDate } from "./format";
import type { Words } from "./messages";
import { eventLabel, pick } from "./view";

/**
 * A correction in words, as readers see it: what was corrected ("the date of
 * the “In plan” entry") and its old and new values.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isLangMap = (v: unknown, config: Config): v is Record<string, string> =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0 && Object.entries(v).every(([k, x]) => typeof x === "string" && config.locales.all.includes(k));

/** The field's name in words: "cost range", "date". */
function fieldName(tail: string, w: Words): string {
  const field = tail.replace(/^\./, "").replace(/^parameters\./, "");
  // A language map's own key (".text.en") is not part of the name.
  const parts = field.split(".");
  for (let n = parts.length; n > 0; n--) {
    const key = `field.${parts.slice(0, n).join(".")}`;
    if (w.m[key]) return w.m[key];
  }
  return field.replace(/[._]/g, " ");
}

/** "the cost range in version 1", "the date of the “In plan” entry". */
export function correctionTarget(c: Correction, card: Card, config: Config, w: Words): string {
  const p = parseCorrectionPath(c.path);
  if (!p) return c.path;
  const field = fieldName(p.tail, w);
  if (p.list === "versions") return w.t("correction.version", { field, n: p.index + 1 });
  if (p.list === "events") {
    const e = card.events[p.index];
    return w.t("correction.event", { field, label: e ? eventLabel(config, w, e.type, e.subtype) : "?" });
  }
  return w.t("correction.reply", { field });
}

/** A corrected value in words: a date, a cost range, a quoted text, a list of sources. */
export function correctionValue(c: Correction, value: unknown, config: Config, w: Words): string {
  if (value === null || value === undefined) return w.t("card.not_given");
  if (/\.cost\.range$|\.capital_cost\.range$/.test(c.path) && Array.isArray(value) && value.length === 3 && value.every((x) => typeof x === "number"))
    return costText(w, config, { range: value as [number, number, number] }, { period: /capital_cost/.test(c.path) ? "total" : config.money.period });
  if (typeof value === "string") return DAY.test(value) ? longDate(w, value) : w.q(value.replace(/\s+/g, " ").trim());
  if (isLangMap(value, config)) return w.q(pick(value, w.locale, config)!.replace(/\s+/g, " ").trim());
  if (Array.isArray(value)) return value.map((x) => (x && typeof x === "object" && "title" in x ? String((x as { title: unknown }).title) : JSON.stringify(x))).join("; ");
  return JSON.stringify(value);
}
