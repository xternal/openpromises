import { resolveConfig, validateCard, type Actor, type Card, type CardContext, type ConfigInput, type Editor, type Issue } from "@openpromises/core";

/** A small English site with every module on, used by the rule tests. */
export const CONFIG_INPUT = {
  site: { name: "Test Tracker" },
  locales: { default: "en", all: ["en"] },
  money: { currency: "GBP", unit: "bn", period: "year" },
  actors: { kinds: ["person", "party", "government"], standing: "manual" },
  venues: ["manifesto", "speech"],
  areas: { kind: "enum", values: ["health", "transport"] },
  ladder: "national",
  modules: ["contracts", "decisions", "lever", "metrics", "wards"],
} satisfies ConfigInput;

export const config = resolveConfig(CONFIG_INPUT);

const actor = (a: Omit<Actor, "format">): Actor => ({ format: "openpromises/1", ...a });

export const ACTORS: Actor[] = [
  actor({ id: "blue-party", kind: "party", name: { en: "Blue Party" }, standing: "in_power" }),
  actor({ id: "green-party", kind: "party", name: { en: "Green Party" }, standing: "opposition" }),
  actor({ id: "ada-lovelace", kind: "person", name: { en: "Ada Lovelace" }, party_id: "green-party" }),
];
export const actors = new Map(ACTORS.map((a) => [a.id, a]));

export const EDITORS: Editor[] = [
  { handle: "Sam", since: "2026-01-01", party: null },
  { handle: "Alex", since: "2026-01-01", party: "blue-party" },
  { handle: "Kim", since: "2026-01-01", until: "2026-12-31", party: "green-party" },
];

/** A valid published card: a Green Party member's promise, approved by Sam and Alex. */
export const BASE: Card = {
  format: "openpromises/1",
  id: "test-bus-fares",
  headline: { en: "Cap bus fares at £2" },
  actor_id: "ada-lovelace",
  made_on: "2026-05-01",
  venue: "speech",
  area: "transport",
  status: "in_plan",
  versions: [
    {
      version: 1,
      text: "We will cap bus fares at £2 for every journey in the city.",
      recorded_on: "2026-05-02",
      source_url: "https://example.org/speech",
      quote_checked_on: "2026-05-02",
      parameters: {
        who: { en: "Bus passengers" },
        cost: { range: [1, 1.2, 1.5], quality: "sourced", sources: [{ title: "City budget", url: "https://example.org/budget" }] },
        when: { en: "From January 2027" },
        deadline: "2027-01-01",
        funded_by: null,
      },
    },
  ],
  events: [
    { date: "2026-05-01", type: "promised", text: { en: "Promised in a speech" } },
    { date: "2026-06-01", type: "in_plan", text: { en: "In the city's transport plan" }, evidence_url: "https://example.org/plan" },
  ],
  reviews: [
    { by: "Sam", kind: "editor", on: "2026-05-03", approves: true },
    { by: "Alex", kind: "editor", on: "2026-05-04", approves: true },
  ],
};

/** A copy of the base card with changes applied by a function. */
export function card(change: (c: Card) => void = () => {}): Card {
  const c = structuredClone(BASE);
  change(c);
  return c;
}

export function context(over: Partial<CardContext> = {}): CardContext {
  return { config, where: "promises", actors, editors: EDITORS, ...over };
}

/** Every issue the schema and rules find in a card. */
export function check(c: unknown, over: Partial<CardContext> = {}): Issue[] {
  return validateCard(c, context(over)).issues;
}

/** The issues one rule finds, as "path: message" lines (empty when the card passes it). */
export function ruleIssues(rule: string, c: unknown, over: Partial<CardContext> = {}): string[] {
  return check(c, over)
    .filter((i) => i.rule === rule)
    .map((i) => `${i.path.map((p) => (typeof p === "number" ? `[${p}]` : `.${p}`)).join("").replace(/^\./, "")}: ${i.message}`);
}
