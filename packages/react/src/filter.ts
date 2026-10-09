import { statusLabel, type Config } from "@openpromises/core";
import { actorName, areaLabel, ownerOf, words, type CardView } from "@openpromises/publish";
import type { FilterOption, FilterWords } from "./client";

/** The choices for a PromiseFilter, from the cards on the page: statuses in ladder order, areas and actors with cards. */
export function filterOptions(views: readonly CardView[], config: Config, locale = config.locales.default): { statuses: FilterOption[]; areas: FilterOption[]; actors: FilterOption[] } {
  const w = words(config, locale);
  const present = new Set(views.map((v) => v.card.status));
  const areas = [...new Set(views.map((v) => v.card.area))].map((a) => ({ value: a, label: areaLabel(config, a, locale) }));
  const owners = new Map(views.map((v) => [ownerOf(v).id, ownerOf(v)]));
  const byLabel = (a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label, w.m.intl);
  return {
    statuses: config.ladder.statuses.filter((s) => present.has(s.id)).map((s) => ({ value: s.id, label: statusLabel(config, s.id, locale) })),
    areas: areas.sort(byLabel),
    actors: [...owners.values()].map((a) => ({ value: a.id, label: actorName(a, locale, config) })).sort(byLabel),
  };
}

/** A PromiseFilter's words, in the reader's language (plain strings, so they can be passed to the client). */
export function filterWords(config: Config, locale = config.locales.default): FilterWords {
  const w = words(config, locale);
  const showing: Record<string, string> = {};
  for (const form of ["zero", "one", "two", "few", "many", "other"]) {
    const text = w.m[`filter.showing.${form}`];
    if (text) showing[form] = text;
  }
  return { label: w.t("filter.label"), all: w.t("filter.all"), status: w.t("filter.status"), area: w.t("filter.area"), actor: w.t("filter.actor"), showing, intl: w.m.intl ?? "en-GB" };
}
