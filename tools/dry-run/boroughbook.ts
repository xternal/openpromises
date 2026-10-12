import { join } from "node:path";
import type { Mutation } from "./lib/mutations";
import type { Accepted } from "./lib/report";
import type { SiteProfile } from "./lib/run";

/**
 * BoroughBook.UK: its own checks, as its schema and
 * cross-checks word them (borough-ledger packages/schema/src/content.ts and
 * append-only.ts), each made into a broken card; and what is already decided.
 */

type Raw = Record<string, any>;

const HOMES = "lab-2026-affordable-homes"; // the administration's pledge, with an evidenced event
const PARKS = "lab-2026-parks"; // the one card with a cost (capital_cost_m)
const POLICE = "con-2026-police"; // an opposition pledge

const copy = (c: Raw) => structuredClone(c);
function set(c: Raw, path: string, value: unknown): Raw {
  const out = copy(c);
  const keys = path.split(".");
  let at: any = out;
  for (const k of keys.slice(0, -1)) at = at[k];
  at[keys.at(-1)!] = value;
  return out;
}
function del(c: Raw, ...paths: string[]): Raw {
  const out = copy(c);
  for (const path of paths) {
    const keys = path.split(".");
    let at: any = out;
    for (const k of keys.slice(0, -1)) at = at?.[k];
    if (at) delete at[keys.at(-1)!];
  }
  return out;
}
/** The same entry with its keys in reverse order: a change of form, not of content. */
const reversed = (o: Raw): Raw => Object.fromEntries(Object.entries(o).reverse());

export const MUTATIONS: Mutation[] = [
  // BoroughBook.UK's schema (PromiseCard).
  { check: "an id of lower-case letters, digits and '-' only", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "id", "Lab_2026_Homes") },
  { check: "content/promises/<file>: file name must be <id>.yaml", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "id", "lab-2026-homes-renamed") },
  { check: "a venue from the list (manifesto, leaflet, hustings, council_meeting, press, social)", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "venue", "radio") },
  { check: "a promise needs at least one version with its source", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "versions", []) },
  { check: "a version's source_url is a URL", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "versions.0.source_url", "not a url") },
  { check: "range must be low <= central <= high", site: "error", card: PARKS, kind: "validate", change: (c) => set(c, "capital_cost_m.range", [5, 1, 3]) },
  { check: "a cost's quality from the list", site: "error", card: PARKS, kind: "validate", change: (c) => set(c, "capital_cost_m.quality", "guess") },
  { check: "an event type from the list", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "events.1.type", "postponed") },
  { check: "an evidence_url is a URL", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "events.1.evidence_url", "not a url") },
  { check: "a status from the list", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "status", "abandoned") },
  { check: "a deadline is always stated, as a date or null", site: "error", card: HOMES, kind: "validate", change: (c) => del(c, "deadline") },
  // BoroughBook.UK's cross-checks (checkContent).
  { check: "promise <id>: unknown party", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "actor.id", "no-such-party") },
  { check: "promise <id>: unknown councillor", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "actor", { kind: "councillor", id: "no-such-councillor" }) },
  { check: "promise <id>: unknown ward", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "ward_id", "no-such-ward") },
  { check: "an opposition pledge must be not_in_power or unscoreable", site: "error", card: POLICE, kind: "validate", change: (c) => set(c, "status", "promised") },
  { check: "the administration's pledge cannot be not_in_power", site: "error", card: HOMES, kind: "validate", change: (c) => set(c, "status", "not_in_power") },
  // BoroughBook.UK has no check for these.
  { check: "a timeline out of date order", site: null, card: HOMES, kind: "validate", change: (c) => set(c, "events.1.date", "2026-01-01") },
  { check: 'a timeline whose first event is not "promised"', site: null, card: HOMES, kind: "validate", change: (c) => set(c, "events.0.type", "reworded") },
  { check: "a status no event moved the card to", site: null, card: HOMES, kind: "validate", change: (c) => set(c, "status", "delivering") },
  // History: BoroughBook.UK's append-only check (appendOnlyProblems).
  { check: "<id>: deleted", site: "error", card: HOMES, kind: "history", change: () => null },
  { check: "versions[i] was edited", site: "error", card: HOMES, kind: "history", change: (c) => set(c, "versions.0.text", "Different words") },
  { check: "events shortened", site: "error", card: HOMES, kind: "history", change: (c) => set(c, "events", c.events.slice(0, -1)) },
  { check: "events[i] was edited", site: "error", card: HOMES, kind: "history", change: (c) => set(c, "events.0.text", "Something else happened") },
  { check: "a reply removed (BoroughBook.UK checks only versions and events)", site: null, card: HOMES, kind: "history", before: (c) => set(c, "replies", [{ from: "A resident", date: "2026-09-01", text: "Where are the homes?" }]), change: (c) => set(c, "replies", []) },
  {
    check: "an event's keys written in another order, nothing else changed (BoroughBook.UK compares the written order)",
    site: "error",
    allowed: true,
    card: HOMES,
    kind: "history",
    change: (c) => set(c, "events", c.events.map((e: Raw, i: number) => (i === 0 ? reversed(e) : e))),
  },
];

/** Differences already decided, and what stays the site's own. */
export const ACCEPTED: Accepted[] = [
  {
    area: "Checks",
    match: /`(approvals|headline|quotes)` rule/,
    verdict: "accepted",
    reason: "A gap in the site's data the engine catches: BoroughBook.UK's cards have no editors' approvals, headlines or recorded quote checks yet (docs/COMPARISON.md). They are added during its move (docs/MIGRATING.md, Per site).",
  },
  {
    area: "Checks",
    match: /`(first-event|event-order|cost)` rule/,
    verdict: "accepted",
    reason: "Problems in the site's data the engine catches: hf-free-home-care's timeline, two events out of order, and the parks cost as a single figure with no source (docs/COMPARISON.md). They are fixed during its move.",
  },
  {
    area: "Card pages",
    match: /links? to (|github\.com|guzh\.uk|ko-fi\.com) on live card pages/,
    verdict: "site",
    reason: "The site's own page around the card: its contact address (mailto: links), its repository, and the footer credits. The site keeps them around the engine's card.",
  },
  {
    area: "llms.txt",
    match: /other links? \(the site's own pages\)/,
    verdict: "site",
    reason: "BoroughBook.UK's llms.txt guides the whole site (budget, payments, wards). The site keeps writing it, and can take its promise list from the engine's.",
  },
  {
    area: "Titles and descriptions",
    match: /would read differently/,
    verdict: "site",
    reason: "The page head is the site's own; cardTitle and cardDescription are optional helpers.",
  },
  {
    area: "Sitemap",
    match: /stay the site's/,
    verdict: "site",
    reason: "The engine lists promise pages only.",
  },
];

export const BOROUGHBOOK: SiteProfile = {
  name: "BoroughBook.UK",
  slug: "boroughbook",
  live: "https://boroughbook.uk",
  repo: { env: "BOROUGH_BOOK_DIR", default: "../borough-ledger" },
  config: join(import.meta.dirname, "boroughbook.config.ts"),
  mutations: MUTATIONS,
  accepted: ACCEPTED,
  own: { entries: [], sections: [] },
};
