import { fromPublicLedger } from "@openpromises/core";
import type { Mutation } from "./lib/mutations";
import type { Accepted } from "./lib/report";

/**
 * Public Ledger (ledgergov.uk): its own checks, as its validator words them
 * (open-pnl packages/schema/src/content.ts and seed.ts, scripts/validate.ts),
 * each made into a broken card; and the differences already decided, with
 * where they were decided.
 */

type Raw = Record<string, any>;

const BUS = "uk-bus-cap-2-2026"; // a cost, its maker, an evidence event, lever settings and a review
const CORRECTED = "uk-child-nude-images-law-2026"; // corrections
const CONTRACTS = "uk-great-british-energy-2024"; // linked contracts
const CREDITED = "uk-snp-two-child-cap-2024"; // brought_about_by

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
  let out = copy(c);
  for (const path of paths) {
    const keys = path.split(".");
    let at: any = out;
    for (const k of keys.slice(0, -1)) at = at?.[k];
    if (at) delete at[keys.at(-1)!];
  }
  return out;
}
const correct = (c: Raw, correction: Raw) => ({ ...copy(c), corrections: [...(c.corrections ?? []), correction] });

export const MUTATIONS: Mutation[] = [
  // Refused by the site's validator.
  { check: 'id "…" does not match the file name', site: "error", card: BUS, kind: "validate", change: (c) => set(c, "id", "uk-bus-cap-renamed") },
  { check: 'unknown actor_id "…"', site: "error", card: BUS, kind: "validate", change: (c) => set(c, "actor_id", "nobody-of-that-name") },
  { check: "versions must be numbered 1, 2, 3… in order", site: "error", card: BUS, kind: "validate", change: (c) => set(c, "versions.0.version", 2) },
  { check: "parameters are required unless the card is unscoreable", site: "error", card: BUS, kind: "validate", change: (c) => del(c, "versions.0.parameters") },
  { check: "an unscoreable card has no parameters", site: "error", card: BUS, kind: "validate", change: (c) => set(c, "status", "unscoreable") },
  { check: "a cost needs a low–high range (invariant 2)", site: "error", card: BUS, kind: "validate", change: (c) => set(c, "versions.0.parameters.how_much_bn_per_year", [0.4, 0.4, 0.4]) },
  { check: "a cost needs costed_by: who made the central figure", site: "error", card: BUS, kind: "validate", change: (c) => del(c, "versions.0.parameters.costed_by") },
  {
    check: "costed_by goes with a cost; this version has none",
    site: "error",
    card: BUS,
    kind: "validate",
    change: (c) => del(c, "versions.0.parameters.how_much_bn_per_year", "versions.0.parameters.cost_note", "versions.0.parameters.cost_sources"),
  },
  { check: 'a "in_plan" event needs an evidence_url', site: "error", card: BUS, kind: "validate", change: (c) => del(c, "events.1.evidence_url") },
  {
    check: "a correction's path does not exist in this card",
    site: "error",
    card: CORRECTED,
    kind: "validate",
    change: (c) => correct(c, { date: "2026-10-09", path: "events[9].text", was: "Old words", now: "New words", reason: "A test change." }),
  },
  {
    check: 'the card\'s value does not match a correction\'s "now"',
    site: "error",
    card: CORRECTED,
    kind: "validate",
    change: (c) => correct(c, { date: "2026-10-09", path: "versions[0].parameters.who", was: "Someone", now: "Not what the card says", reason: "A test change." }),
  },
  { check: "submission_ref and credit belong to cards with origin: reader_submission", site: "error", card: BUS, kind: "validate", change: (c) => set(c, "submission_ref", "R-0001") },
  { check: "a card with lever_settings needs a preset_label", site: "error", card: BUS, kind: "validate", change: (c) => del(c, "preset_label") },
  {
    check: "brought_about_by only applies once something has happened (legislated, funded, delivering or delivered)",
    site: "error",
    card: BUS,
    kind: "validate",
    change: (c) => set(c, "brought_about_by", { actor_id: "hm-government" }),
  },
  { check: "outcome_by is missing: give the body that must act to deliver it, or null", site: "error", card: BUS, kind: "validate", change: (c) => del(c, "outcome_by") },
  { check: 'unknown outcome_by actor "…"', site: "error", card: BUS, kind: "validate", change: (c) => set(c, "outcome_by", { actor_id: "nobody-of-that-name" }) },
  { check: "outcome_by names a body by its role (an actor of kind government), not a party or a person", site: "error", card: BUS, kind: "validate", change: (c) => set(c, "outcome_by", { actor_id: "labour" }) },
  { check: 'unknown brought_about_by actor "…"', site: "error", card: CREDITED, kind: "validate", change: (c) => set(c, "brought_about_by.actor_id", "nobody-of-that-name") },
  { check: 'contract "…" is listed twice', site: "error", card: CONTRACTS, kind: "validate", change: (c) => set(c, "contracts", [...c.contracts, c.contracts[0]]) },
  // Warned about by the site's validator.
  { check: "no headline yet", site: "warning", card: BUS, kind: "validate", change: (c) => del(c, "headline") },
  { check: "quote not yet checked verbatim against its source", site: "warning", card: BUS, kind: "validate", change: (c) => del(c, "versions.0.quote_checked_on") },
  // The site has no check for these (nothing in open-pnl packages/schema at 77a86b4 looks at them).
  { check: "a timeline out of date order", site: null, card: BUS, kind: "validate", change: (c) => set(c, "events.1.date", "2026-07-01") },
  { check: 'a timeline whose first event is not "promised"', site: null, card: BUS, kind: "validate", change: (c) => set(c, "events.0.type", "restated") },
  { check: "a status no event moved the card to", site: null, card: BUS, kind: "validate", change: (c) => set(c, "status", "legislated") },
  // History: the site's append-only check (appendOnlyIssues).
  { check: "an event's text changed with no correction", site: "error", card: BUS, kind: "history", change: (c) => set(c, "events.0.text", "Something else happened") },
  { check: "an event removed", site: "error", card: BUS, kind: "history", change: (c) => set(c, "events", c.events.slice(1)) },
  { check: "the promise's words changed with no correction", site: "error", card: BUS, kind: "history", change: (c) => set(c, "versions.0.text", "Different words.") },
  { check: "a published card deleted", site: "error", card: BUS, kind: "history", change: () => null },
  { check: "a correction changed", site: "error", card: CORRECTED, kind: "history", change: (c) => set(c, "corrections.0.reason", "A different reason.") },
  { check: "a review changed", site: "error", card: BUS, kind: "history", change: (c) => set(c, "reviews.0.on", "2026-10-07") },
  {
    check: "an event's text changed, with a correction recording it",
    site: null,
    allowed: true,
    card: BUS,
    kind: "history",
    change: (c) =>
      correct(set(c, "events.0.text", "PM announces a £2 cap on single bus fares for 2027"), {
        date: "2026-10-09",
        path: "events[0].text",
        was: c.events[0].text,
        now: "PM announces a £2 cap on single bus fares for 2027",
        reason: "Shorter.",
      }),
  },
  {
    check: "a quality label added to a published cost, which Public Ledger's format had no place for (decision 15)",
    site: null,
    allowed: true,
    card: BUS,
    kind: "history",
    // Converted to format v1 in the same change, then labelled: the label exists only in v1.
    change: (c) => set(fromPublicLedger(c), "versions.0.parameters.cost.quality", "sourced"),
  },
  {
    check: "costed_by filled in on a published version that did not have it (the site's LATE_FIELDS)",
    site: null,
    allowed: true,
    card: BUS,
    kind: "history",
    before: (c) => del(c, "versions.0.parameters.costed_by"),
    change: (c) => set(c, "versions.0.parameters.costed_by", { kind: "official", name: "Department for Transport" }),
  },
];

/** What the site keeps making itself and hands to the engine: feed entries by kind, and Markdown sections by title. */
export const OWN = { entries: ["contract", "edition"], sections: ["Contracts behind delivery"] } as const;

/** Differences already decided, and what stays the site's own. */
export const ACCEPTED: Accepted[] = [
  {
    area: "Checks",
    match: /`approvals` rule/,
    verdict: "accepted",
    reason: "Expected until the move: Public Ledger has no editors list in the repository yet. Decisions 10 and 11 (docs/DECISIONS.md): its private list is passed with OPENPROMISES_EDITORS, and its real approvals are imported with `review --on` (docs/MIGRATING.md step 3).",
  },
  {
    area: "Checks",
    match: /`cost` rule/,
    verdict: "accepted",
    reason: "A gap in the site's data the engine catches: Public Ledger's costs carry no quality label (sourced, approx or modelled), and the converter never invents one (docs/COMPARISON.md). Editors add them during the move (docs/MIGRATING.md step 4).",
  },
  {
    area: "Card pages",
    match: /to (github\.com|www\.ons\.gov\.uk|www\.find-tender\.service\.gov\.uk|www\.contractsfinder\.service\.gov\.uk|find-and-update\.company-information\.service\.gov\.uk) on live card pages/,
    verdict: "site",
    reason: "The site's own sections on a card page: its method link, its per-household figures (ONS) and the contracts behind delivery. The site passes them to PromiseCard as children and actions.",
  },
  {
    area: "llms.txt",
    match: /other links? \(the site's own pages\)/,
    verdict: "site",
    reason: "Public Ledger's llms.txt guides the whole site (budget, people, method). The site keeps writing it, and can take its promise list from the engine's.",
  },
  {
    area: "Checks",
    match: /submission_ref and credit belong to cards with origin: reader_submission/,
    verdict: "site",
    reason: "Both fields are Public Ledger's own (in x), and the check needs the card's origin, which a site's x schema cannot see. Public Ledger keeps this one check in its validate script, which keeps running for its budget data; agreed on 9 October 2026 (docs/MIGRATING.md, Per site).",
  },
  {
    area: "Structured data",
    match: /main type: WebPage → Article/,
    verdict: "accepted",
    reason: "RFC-0001 §6: a card page is an Article whose main entity is the Quotation (docs/PUBLISHING.md, Compared with the sites today).",
  },
  {
    area: "Feeds",
    match: /no feed at \/feeds\/deadlines\//,
    verdict: "site",
    reason: "Deadline-window feeds stay the site's own (docs/PUBLISHING.md, Kept in the site).",
  },
  {
    area: "Feeds",
    match: /no feed at \/feeds\/updates\.xml/,
    verdict: "site",
    reason: "The figures feed (OBR and ONS releases, contracts and cost changes) is the site's own data feed.",
  },
  {
    area: "Open data",
    match: /site's own API/,
    verdict: "site",
    reason: "Public Ledger's /api/v1 serves its budget data as well as cards.",
  },
  {
    area: "Titles and descriptions",
    match: /would read differently/,
    verdict: "site",
    reason: "The page head is the site's own (Next.js metadata); cardTitle and cardDescription are optional helpers.",
  },
  {
    area: "Sitemap",
    match: /stay the site's/,
    verdict: "site",
    reason: "The engine lists promise pages only.",
  },
];
