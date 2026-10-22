import { categoryOf, statusLabel, type Actor, type Comparison, type Config, type VerificationLevel } from "@openpromises/core";
import { comparisonLines } from "./compare";
import type { Words } from "./messages";
import { absolute, paths } from "./urls";
import { actorName, areaLabel, headline, lastUpdated, reviewerName, verificationText, type CardView } from "./view";
import { words } from "./messages";

/**
 * Open data: every published card as JSON (the cards themselves, in format v1)
 * and as CSV (one row a card, the facts most people want). Drafts are never
 * included. Nothing about readers or editors' declarations is in either.
 */

export interface OpenData {
  format: "openpromises/1";
  site: { name: string; url: string };
  built: string;
  licence?: { name: string; url: string };
  cards: unknown[];
  actors: Actor[];
  /** Each card's verification by id (decision 23), with its words in every language of the site; absent when built without the editors list. */
  verification?: Record<string, { level: VerificationLevel; named: string[]; counted: number; automated: string[]; text: Record<string, string> }>;
  /** What each card's cost compares with (decision 28), by id: the yearly cost's and the one-off cost's comparisons, with their words in every language. Absent without a basket. */
  comparisons?: Record<string, { cost: ComparisonData[]; capital_cost: ComparisonData[] }>;
}

export type ComparisonData = Comparison & { text: Record<string, string> };

export function openDataJson(views: readonly CardView[], config: Config, today: string): OpenData {
  const published = views.filter((v) => v.where === "promises");
  const actors = new Map<string, Actor>();
  for (const v of published) {
    actors.set(v.actor.id, v.actor);
    if (v.party) actors.set(v.party.id, v.party);
  }
  return {
    format: "openpromises/1",
    site: { name: config.site.name, url: absolute(config, "/") },
    built: today,
    ...(config.publish.licence ? { licence: config.publish.licence } : {}),
    cards: published.map((v) => v.card),
    actors: [...actors.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    ...(published.some((v) => v.verification) ? { verification: verificationData(published, config) } : {}),
    ...(config.comparisons ? { comparisons: comparisonData(published, config) } : {}),
  };
}

function comparisonData(views: readonly CardView[], config: Config): NonNullable<OpenData["comparisons"]> {
  const ws = config.locales.all.map((l) => words(config, l));
  const out: NonNullable<OpenData["comparisons"]> = {};
  const all = (cost: Parameters<typeof comparisonLines>[0], oneOff: boolean): ComparisonData[] => {
    const per = ws.map((w) => comparisonLines(cost, config, w, { oneOff }));
    return (per[0] ?? []).map((l, i) => ({ ...l.comparison, text: Object.fromEntries(ws.map((w, j) => [w.locale, per[j]![i]!.text])) }));
  };
  for (const v of views) {
    const p = v.current.parameters;
    const entry = { cost: all(p?.cost, false), capital_cost: all(p?.capital_cost, true) };
    if (entry.cost.length || entry.capital_cost.length) out[v.id] = entry;
  }
  return out;
}

function verificationData(views: readonly CardView[], config: Config): NonNullable<OpenData["verification"]> {
  const ws = config.locales.all.map((l) => words(config, l));
  const out: NonNullable<OpenData["verification"]> = {};
  for (const v of views) {
    if (!v.verification) continue;
    const { level, named, counted, automated } = v.verification;
    out[v.id] = {
      level,
      named: named.map((by) => reviewerName(config, by)),
      counted,
      automated: automated.map((by) => reviewerName(config, by)),
      text: Object.fromEntries(ws.map((w) => [w.locale, verificationText(v, config, w)!])),
    };
  }
  return out;
}

/** A CSV field: quoted when it holds a comma, quote or line break; a leading = + - @ is defused so spreadsheets do not run it. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = [
  "id",
  "url",
  "headline",
  "actor_id",
  "actor",
  "party",
  "made_on",
  "venue",
  "area",
  "status",
  "status_label",
  "status_category",
  "deadline",
  "cost_low",
  "cost_central",
  "cost_high",
  "cost_quality",
  "funding_stated",
  "quote",
  "quote_lang",
  "source_url",
  "archived_url",
  "quote_checked_on",
  "versions",
  "corrections",
  "last_updated",
  // Added in 0.2.0 (decision 14). New columns go at the end, so a column never moves (decision 13.3).
  "cost_by_kind",
  "cost_by_name",
  "responsible_id",
  "brought_about_by_id",
  // Added in 0.6.0 (decision 23); empty when built without the editors list.
  "verification_level",
  "verification",
  // Added in 0.8.0 (decision 28); empty without a basket.
  "comparisons",
  // Added in 0.16.0 (decision 36): the forecast at the time, without the promise.
  "baseline_value",
  "baseline_unit",
  "baseline_for",
  "baseline_by",
  "baseline_published_on",
  "baseline_source_url",
] as const;

/** Every published card as CSV, one row each, in the language of `w` for headlines and labels. */
export function openDataCsv(views: readonly CardView[], config: Config, w: Words, today: string): string {
  const L = w.locale;
  const rows = views
    .filter((v) => v.where === "promises")
    .map((v) => {
      const p = v.current.parameters;
      const range = p?.cost?.range;
      const row: Record<(typeof CSV_COLUMNS)[number], unknown> = {
        id: v.id,
        url: absolute(config, paths(config).card(v.id, L)),
        headline: headline(v, L, config),
        actor_id: v.actor.id,
        actor: actorName(v.actor, L, config),
        party: v.party && v.party.id !== v.actor.id ? actorName(v.party, L, config) : "",
        made_on: v.card.made_on,
        venue: v.card.venue ?? "",
        area: areaLabel(config, v.card.area, L),
        status: v.card.status,
        status_label: statusLabel(config, v.card.status, L),
        status_category: categoryOf(config, v.card.status) ?? "",
        deadline: p?.deadline ?? "",
        cost_low: range?.[0],
        cost_central: range?.[1],
        cost_high: range?.[2],
        cost_quality: p?.cost?.quality ?? "",
        funding_stated: p ? (p.funded_by ? "yes" : "no") : "",
        quote: v.current.text,
        quote_lang: v.current.lang ?? config.locales.default,
        source_url: v.current.source_url,
        archived_url: v.current.archived_url ?? "",
        quote_checked_on: v.current.quote_checked_on ?? "",
        versions: v.card.versions.length,
        corrections: v.card.corrections?.length ?? 0,
        last_updated: lastUpdated(v.card, today) ?? "",
        cost_by_kind: p?.cost?.by?.kind ?? "",
        cost_by_name: p?.cost?.by?.name ?? "",
        // "none" when the card says no body in power is committed; empty when it does not say.
        responsible_id: v.card.responsible === null ? "none" : (v.card.responsible?.actor_id ?? ""),
        brought_about_by_id: v.card.brought_about_by?.actor_id ?? "",
        verification_level: v.verification?.level ?? "",
        verification: verificationText(v, config, w) ?? "",
        comparisons: comparisonLines(p?.cost, config, w)
          .map((l) => l.text)
          .join("; "),
        baseline_value: p?.baseline?.value,
        baseline_unit: p?.baseline?.unit ?? "",
        baseline_for: p?.baseline?.for ?? "",
        baseline_by: p?.baseline?.by.name ?? "",
        baseline_published_on: p?.baseline?.published_on ?? "",
        baseline_source_url: p?.baseline?.source.url ?? "",
      };
      return CSV_COLUMNS.map((c) => csvField(row[c])).join(",");
    });
  return `${[CSV_COLUMNS.join(","), ...rows].join("\r\n")}\r\n`;
}

