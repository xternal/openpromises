import { categoryOf, statusLabel, type Actor, type Config } from "@openpromises/core";
import type { Words } from "./messages";
import { absolute, paths } from "./urls";
import { actorName, areaLabel, headline, lastUpdated, type CardView } from "./view";

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
}

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
  };
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
      };
      return CSV_COLUMNS.map((c) => csvField(row[c])).join(",");
    });
  return `${[CSV_COLUMNS.join(","), ...rows].join("\r\n")}\r\n`;
}

