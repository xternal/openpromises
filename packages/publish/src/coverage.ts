import type { Config } from "@openpromises/core";
import { messagesFor } from "./messages";
import { areaLabel, statusCounts, type CardView } from "./view";

/**
 * Every area a site lists, with how many published promises each holds and
 * where they stand, empty areas included (decision 33), so what has not been
 * promised shows as plainly as what has. The areas come from the
 * configuration, never from the cards, so the same list frames every actor.
 */
export interface AreaCoverage {
  area: string;
  count: number;
  /** Where the area's promises stand, in ladder order; empty when it has none. */
  counts: { status: string; count: number }[];
}

/**
 * The areas in the configured order for an `enum`; a site whose areas are
 * `codes` or free text has no list to show, so only the areas its cards use
 * appear, in the alphabetical order of their labels in `locale` (as
 * `AreaIndex` lists them). Pass the views of one actor for that actor's
 * coverage.
 */
export function areaCoverage(views: readonly CardView[], config: Config, locale: string = config.locales.default): AreaCoverage[] {
  const published = views.filter((v) => v.where === "promises");
  const intl = messagesFor(config, locale).intl;
  const areas =
    config.areas.kind === "enum"
      ? config.areas.values
      : [...new Set(published.map((v) => v.card.area))].sort((a, b) => areaLabel(config, a, locale).localeCompare(areaLabel(config, b, locale), intl) || (a < b ? -1 : a > b ? 1 : 0));
  return areas.map((area) => {
    const inArea = published.filter((v) => v.card.area === area);
    return { area, count: inArea.length, counts: statusCounts(inArea, config) };
  });
}
