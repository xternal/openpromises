import type { Config } from "@openpromises/core";
import { longDate } from "./format";
import type { Words } from "./messages";
import { pick, type CardView } from "./view";

/**
 * What delivery takes, in words (decision 28, RFC-0002 §4.2–4.4): the staff
 * a promise needs, the people it reaches, how long delivery takes against
 * the promise's own deadline, and the steps done. Each is undefined when the
 * card does not say.
 */
export interface EstimateWords {
  staff?: string;
  reached?: string;
  time?: string;
  path?: string;
  /** Each step: its label, whether it is done, and by when it is expected. */
  steps: { label: string; done: boolean; by?: string }[];
}

const count = (w: Words, n: number) => new Intl.NumberFormat(w.m.intl, { maximumSignificantDigits: 3 }).format(n);

const monthsBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / (1000 * 60 * 60 * 24 * 30.4375));

export function estimateWords(v: CardView, config: Config, w: Words): EstimateWords {
  const L = w.locale;
  const p = v.current.parameters;
  const e = p?.estimate;
  const out: EstimateWords = { steps: [] };
  if (!e) return out;
  for (const k of ["staff", "reached"] as const) {
    const x = e.people?.[k];
    if (x) out[k] = w.t("estimate.people", { low: count(w, x.range[0]), high: count(w, x.range[2]), unit: pick(x.unit, L, config) ?? "" });
  }
  const lead = e.time?.lead;
  if (lead) {
    const text = w.t(`estimate.lead.${lead.basis}`, { low: count(w, lead.months[0]), high: count(w, lead.months[2]) });
    out.time = p?.deadline ? w.t("estimate.lead_allows", { text, n: monthsBetween(v.current.recorded_on, p.deadline) }) : text;
  }
  if (e.path?.length) {
    out.steps = e.path.map((s) => ({
      label: config.delivery.steps[s.step]?.[L] ?? config.delivery.steps[s.step]?.[config.locales.default] ?? s.step,
      done: s.met_by_event !== undefined,
      ...(s.by ? { by: longDate(w, s.by) } : {}),
    }));
    out.path = w.t("estimate.path_done", { done: out.steps.filter((s) => s.done).length, total: out.steps.length });
  }
  return out;
}
