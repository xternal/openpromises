import { checkSpan, matchQuote } from "@openpromises/quotes";
import { categoryOf, climb, hasStatus, type Config } from "./config";
import { same, fieldAt, parseCorrectionPath } from "./history";
import { issue, type Issue, type Path, type Severity } from "./issues";
import { EVENT_TYPES, NOT_IN_POWER, PROMISED, UNSCOREABLE } from "./ladder";
import type { Actor, Card, Cost, Editor, LangMap, Standing, Version } from "./schema";

/**
 * The rules of format v1 (docs/FORMAT.md §13). Each one is a pure function
 * from a parsed card and its context to a list of issues; none of them looks
 * at which party a card is about, only at what the card and its actor say
 * (principle 5, checked by test/conformance.test.ts).
 */

/** The result of checking a version's quote against an archived copy (quotes.json). */
export interface QuoteCheck {
  match: "exact" | "close" | "none";
  /** The copy that was checked. */
  url: string;
  checked_on?: string;
  /** SHA-256 of the copy's bytes, so anyone can see which copy it was. */
  sha256?: string;
}

export interface CardContext {
  config: Config;
  /** Published (promises/) or waiting for editors (drafts/). */
  where: "promises" | "drafts";
  actors: ReadonlyMap<string, Actor>;
  /** The editors list, or null when the site has none. */
  editors: readonly Editor[] | null;
  /** The archive check of a version's quote, if there is one. */
  quoteCheck?: (version: Version) => QuoteCheck | undefined;
  /** A stored source text from sources/, or undefined when the file is missing. */
  sourceText?: (file: string) => string | undefined;
}

export interface Rule {
  id: string;
  summary: string;
  check: (card: Card, ctx: CardContext) => Issue[];
}

const published = (ctx: CardContext) => ctx.where === "promises";
/** An error in a published card, a warning in a draft: for things editors finish before they approve. */
const toPublish = (ctx: CardContext): Severity => (published(ctx) ? "error" : "warning");
const list = (values: readonly string[]) => values.join(", ");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const baseLang = (lang: string) => lang.toLowerCase().split("-")[0]!;

// ---------------------------------------------------------------- language maps

export interface LangMapAt {
  path: Path;
  map: LangMap;
  /** "ours": text we write, in every language. "translation": our translations of someone's words, in every language but theirs. */
  kind: "ours" | "translation";
  /** For a translation: the language of the original words. */
  original?: string;
  /** False for text recorded exactly as stated (funded_by), which the neutral-words lint leaves alone. */
  lint: boolean;
}

/** Every language map in a card, with where it is. */
export function* langMaps(card: Card, defaultLocale: string): Generator<LangMapAt> {
  const ours = (path: Path, map: LangMap | null | undefined, lint = true): LangMapAt[] => (map ? [{ path, map, kind: "ours", lint }] : []);
  yield* ours(["headline"], card.headline);
  yield* ours(["venue_label"], card.venue_label);
  yield* ours(["status_note"], card.status_note);
  for (const [i, v] of card.versions.entries()) {
    if (v.translations) yield { path: ["versions", i, "translations"], map: v.translations, kind: "translation", original: v.lang ?? defaultLocale, lint: false };
    const p = v.parameters;
    if (!p) continue;
    yield* ours(["versions", i, "parameters", "who"], p.who);
    yield* ours(["versions", i, "parameters", "when"], p.when);
    yield* ours(["versions", i, "parameters", "funded_by"], p.funded_by, false);
    yield* ours(["versions", i, "parameters", "cost", "note"], p.cost?.note);
    yield* ours(["versions", i, "parameters", "capital_cost", "note"], p.capital_cost?.note);
  }
  for (const [i, e] of card.events.entries()) yield* ours(["events", i, "text"], e.text);
  for (const [i, r] of (card.replies ?? []).entries()) {
    if (r.translations) yield { path: ["replies", i, "translations"], map: r.translations, kind: "translation", original: r.lang ?? defaultLocale, lint: false };
    yield* ours(["replies", i, "editor_response"], r.editor_response);
  }
  for (const [i, c] of (card.corrections ?? []).entries()) yield* ours(["corrections", i, "reason"], c.reason);
  for (const [i, r] of (card.reviews ?? []).entries()) yield* ours(["reviews", i, "note"], r.note);
  const lever = card.links?.lever;
  if (lever && typeof lever === "object") yield* ours(["links", "lever", "label"], lever.label);
  yield* ours(["links", "measurement", "note"], card.links?.measurement?.note);
}

/** Problems with one language map against the configured languages. */
export function langMapIssues(at: LangMapAt, config: Config, rule = "languages"): Issue[] {
  const out: Issue[] = [];
  const all = config.locales.all;
  const required = at.kind === "ours" ? all : all.filter((l) => baseLang(l) !== baseLang(at.original ?? ""));
  for (const l of required) if (!(l in at.map)) out.push(issue(rule, [...at.path, l], `has no "${l}" text; every text we write has ${list(all)}`));
  for (const l of Object.keys(at.map)) {
    if (!all.includes(l)) out.push(issue(rule, [...at.path, l], `"${l}" is not one of the configured languages (${list(all)})`));
    else if (at.kind === "translation" && baseLang(l) === baseLang(at.original ?? "")) out.push(issue(rule, [...at.path, l], `is the language of the original words; a translation into it is not needed`));
  }
  return out;
}

const languages: Rule = {
  id: "languages",
  summary: "Every language map has exactly the configured languages.",
  check: (card, ctx) => [...langMaps(card, ctx.config.locales.default)].flatMap((at) => langMapIssues(at, ctx.config)),
};

// ---------------------------------------------------------------- vocabulary

const isEventType = (config: Config, type: string) => hasStatus(config, type) || (EVENT_TYPES as readonly string[]).includes(type);

export function areaProblem(config: Config, area: string): string | null {
  const a = config.areas;
  if (a.kind === "enum" && !a.values.includes(area)) return `"${area}" is not an area in the configuration (${list(a.values)})`;
  if (a.kind === "codes" && !new RegExp(a.pattern, "u").test(area)) return `"${area}" is not an area code of the form ${a.pattern}`;
  return null;
}

const vocabulary: Rule = {
  id: "vocabulary",
  summary: "Venue, area, status and event types are ones the configuration allows.",
  check: (card, { config }) => {
    const out: Issue[] = [];
    if (card.venue && config.venues && !config.venues.includes(card.venue))
      out.push(issue("vocabulary", ["venue"], `"${card.venue}" is not a venue in the configuration (${list(config.venues)})`));
    const area = areaProblem(config, card.area);
    if (area) out.push(issue("vocabulary", ["area"], area));
    if (!hasStatus(config, card.status))
      out.push(issue("vocabulary", ["status"], `"${card.status}" is not a status on the ${config.ladder.name} ladder (${list(config.ladder.statuses.map((s) => s.id))})`));
    card.events.forEach((e, i) => {
      if (!isEventType(config, e.type))
        out.push(issue("vocabulary", ["events", i, "type"], `"${e.type}" is not an event type: use a status on the ${config.ladder.name} ladder or one of ${list(EVENT_TYPES)}`));
    });
    return out;
  },
};

// ---------------------------------------------------------------- headline

const headline: Rule = {
  id: "headline",
  summary: "A published card has a headline in every language, within that language's limits.",
  check: (card, ctx) => {
    if (!card.headline) return [issue("headline", ["headline"], "is missing: write a neutral 3–8 word summary of what is promised, from the quote alone", toPublish(ctx))];
    const out: Issue[] = [];
    for (const [l, text] of Object.entries(card.headline)) {
      const limits = ctx.config.headline[l];
      if (!limits) continue; // an unknown language is the languages rule's to report
      const h = text.trim();
      const words = h.split(/\s+/).filter(Boolean).length;
      const chars = [...h].length;
      const at = ["headline", l];
      if (limits.minWords !== undefined && words < limits.minWords) out.push(issue("headline", at, `has ${plural(words, "word")}; a headline in "${l}" has at least ${limits.minWords}`));
      if (limits.maxWords !== undefined && words > limits.maxWords) out.push(issue("headline", at, `has ${plural(words, "word")}; a headline in "${l}" has at most ${limits.maxWords}`));
      if (limits.minChars !== undefined && chars < limits.minChars) out.push(issue("headline", at, `is too short (${chars} characters)`));
      if (limits.maxChars !== undefined && chars > limits.maxChars) out.push(issue("headline", at, `has ${chars} characters; a headline in "${l}" has at most ${limits.maxChars}`));
      if (/[.!?。！？]$/u.test(h)) out.push(issue("headline", at, "ends with a full stop; a headline has none"));
    }
    return out;
  },
};

// ---------------------------------------------------------------- timeline

/** Whether an event of this type needs an evidence link (principle 2). */
export function needsEvidence(config: Config, type: string): boolean {
  if (type === "reworded" || type === "restated" || type === "reply") return true;
  const category = categoryOf(config, type);
  return category === "progress" || category === "finished";
}

const evidence: Rule = {
  id: "evidence",
  summary: "Every event that moves the status, rewords or restates the promise, or records a reply, links to its evidence.",
  check: (card, { config }) =>
    card.events.flatMap((e, i) =>
      needsEvidence(config, e.type) && !e.evidence_url ? [issue("evidence", ["events", i, "evidence_url"], `a "${e.type}" event needs an evidence_url: the document that shows it happened`)] : [],
    ),
};

const firstEvent: Rule = {
  id: "first-event",
  summary: 'The first event is "promised", dated made_on, and "promised" appears once.',
  check: (card) => {
    const out: Issue[] = [];
    const first = card.events[0]!;
    if (first.type !== PROMISED) out.push(issue("first-event", ["events", 0, "type"], `the first event is the promise itself ("promised"), not "${first.type}"`));
    else if (first.date !== card.made_on) out.push(issue("first-event", ["events", 0, "date"], `the promise was made on ${card.made_on} (made_on), but its event is dated ${first.date}`));
    card.events.forEach((e, i) => {
      if (e.type === PROMISED && i > 0)
        out.push(issue("first-event", ["events", i, "type"], 'the promise is recorded once: a repeat with the same terms is a "restated" event, and new terms are a new version with a "reworded" event'));
    });
    return out;
  },
};

const eventOrder: Rule = {
  id: "event-order",
  summary: "Events are in date order, except automatic events and deadline markers.",
  check: (card) => {
    const out: Issue[] = [];
    let previous: string | undefined;
    card.events.forEach((e, i) => {
      // Jobs append automatic events, and deadline markers may lie ahead; neither is held to the order.
      if (e.auto || e.type === "deadline") return;
      if (previous !== undefined && e.date < previous) out.push(issue("event-order", ["events", i, "date"], `events are in date order, but ${e.date} comes after ${previous}`));
      previous = e.date;
    });
    return out;
  },
};

const versions: Rule = {
  id: "versions",
  summary: 'Versions are numbered 1, 2, 3…, with one "reworded" event for each version after the first.',
  check: (card) => {
    const out: Issue[] = [];
    card.versions.forEach((v, i) => {
      if (v.version !== i + 1) out.push(issue("versions", ["versions", i, "version"], `versions are numbered 1, 2, 3… in order; this one should be ${i + 1}`));
    });
    const reworded = card.events.filter((e) => e.type === "reworded").length;
    const later = card.versions.length - 1;
    if (reworded !== later)
      out.push(issue("versions", ["events"], `${plural(later, "later version")} need${later === 1 ? "s" : ""} as many "reworded" events, but there ${reworded === 1 ? "is" : "are"} ${reworded}`));
    card.events.forEach((e, i) => {
      if (e.subtype && e.type !== "reworded") out.push(issue("versions", ["events", i, "subtype"], 'only a "reworded" event moves a deadline'));
    });
    return out;
  },
};

const statusEvent: Rule = {
  id: "status-event",
  summary: "The status has a matching event, except statuses off the ladder.",
  check: (card, { config }) => {
    const category = categoryOf(config, card.status);
    if (!category || category === "off_ladder") return [];
    return card.events.some((e) => e.type === card.status) ? [] : [issue("status-event", ["status"], `the status is "${card.status}", but no "${card.status}" event shows when and on what evidence`)];
  },
};

const scoreable: Rule = {
  id: "scoreable",
  summary: "The current version has parameters, unless the card is unscoreable.",
  check: (card, { config }) => {
    const n = card.versions.length - 1;
    const current = card.versions[n]!;
    if (current.parameters === null && card.status !== UNSCOREABLE)
      return [issue("scoreable", ["versions", n, "parameters"], hasStatus(config, UNSCOREABLE) ? 'are needed unless the card is "unscoreable"' : "are needed")];
    if (current.parameters !== null && card.status === UNSCOREABLE) return [issue("scoreable", ["status"], 'an "unscoreable" card has no parameters: set its current version\'s parameters to null')];
    return [];
  },
};

// ---------------------------------------------------------------- cost

function costIssues(cost: Cost, path: Path, config: Config, yearly: boolean): Issue[] {
  const out: Issue[] = [];
  const add = (p: Path, m: string) => out.push(issue("cost", [...path, ...p], m));
  if (cost.by && !cost.range) add(["by"], "goes with a figure: this cost has no range, so there is no central figure for anyone to have made");
  if (!cost.range) {
    if (!cost.note) add([], "has no range, so its note says why there is no figure");
    return out;
  }
  const [low, central, high] = cost.range;
  if (low === high)
    add(["range"], `is a single figure (${low}); a cost is a low–high range. If the source gives one figure, add a stated editorial margin (for example ±10%) and say so in the note`);
  else if (!(low <= central && central <= high)) add(["range"], `is not in order: [low, central, high] needs low ≤ central ≤ high, and it has [${low}, ${central}, ${high}]`);
  if (!cost.quality) add(["quality"], `is missing: a cost carries a quality label (${list(config.money.qualities)})`);
  else if (!config.money.qualities.includes(cost.quality)) add(["quality"], `"${cost.quality}" is not a quality label in the configuration (${list(config.money.qualities)})`);
  if (!cost.sources?.length) add(["sources"], "are missing: a cost names at least one source");
  if (yearly && config.money.costedBy === "required" && !cost.by)
    add(["by"], "is missing: say who made the central figure (kind: official, party or independent; and a name), as the configuration asks (money.costedBy)");
  return out;
}

const cost: Rule = {
  id: "cost",
  summary:
    "A cost is a range (low below high) with a quality label and a source, or explains in a note why there is no figure. Who made the central figure (by) goes only with a range, and is required when the configuration says so.",
  check: (card, { config }) =>
    card.versions.flatMap((v, i) => [
      ...(v.parameters?.cost ? costIssues(v.parameters.cost, ["versions", i, "parameters", "cost"], config, true) : []),
      ...(v.parameters?.capital_cost ? costIssues(v.parameters.capital_cost, ["versions", i, "parameters", "capital_cost"], config, false) : []),
    ]),
};

// ---------------------------------------------------------------- corrections

const corrections: Rule = {
  id: "corrections",
  summary: 'Each correction names a field that exists, and the field equals the "now" of its last correction.',
  check: (card) => {
    const out: Issue[] = [];
    const all = card.corrections ?? [];
    const lastByPath = new Map(all.map((c, i) => [c.path, i]));
    all.forEach((c, i) => {
      const p = parseCorrectionPath(c.path);
      if (!p) return; // the schema reports a malformed path
      const entry = (card[p.list] ?? [])[p.index];
      if (entry === undefined) out.push(issue("corrections", ["corrections", i, "path"], `${c.path} does not exist in this card`));
      else if (lastByPath.get(c.path) === i && !same(fieldAt(entry, p.tail), c.now ?? null))
        out.push(issue("corrections", ["corrections", i, "now"], `the card's ${c.path} does not match this correction's "now" value`));
    });
    return out;
  },
};

// ---------------------------------------------------------------- approvals

/** The party a card is about: its actor if that is a party, or the actor's party. */
export function partyOf(actorId: string, actors: ReadonlyMap<string, Actor>): string | undefined {
  const actor = actors.get(actorId);
  if (!actor) return undefined;
  return actor.kind === "party" ? actor.id : actor.party_id;
}

/** The editors who validly approved a card: listed, approving while an editor, not about their own party. Each counts once. */
export function approvers(card: Card, ctx: Pick<CardContext, "actors" | "editors">): Set<string> {
  const out = new Set<string>();
  const owners = new Set([card.actor_id, partyOf(card.actor_id, ctx.actors)].filter((x): x is string => !!x));
  for (const r of card.reviews ?? []) {
    if (r.kind !== "editor" || r.approves !== true) continue;
    const e = ctx.editors?.find((x) => x.handle === r.by);
    if (!e || r.on < e.since || (e.until && r.on > e.until) || (e.party && owners.has(e.party))) continue;
    out.add(r.by);
  }
  return out;
}

const approvals: Rule = {
  id: "approvals",
  summary: "A published card has enough approvals from listed editors, none about their own party; machines never approve.",
  check: (card, ctx) => {
    const out: Issue[] = [];
    const add = (path: Path, m: string) => out.push(issue("approvals", path, m));
    const owners = new Set([card.actor_id, partyOf(card.actor_id, ctx.actors)].filter((x): x is string => !!x));
    const seen = new Set<string>();
    (card.reviews ?? []).forEach((r, i) => {
      if (r.approves !== true) return;
      if (r.kind === "automated") return add(["reviews", i, "approves"], "machines suggest, people decide: an automated review never approves a card");
      if (r.kind !== "editor") return add(["reviews", i, "kind"], `only an editor approves a card; a "${r.kind}" review records a check (list the reviewer as an editor to let them approve)`);
      if (!ctx.editors) return add(["reviews", i, "by"], "there is no editors list, so this approval cannot be checked");
      const e = ctx.editors.find((x) => x.handle === r.by);
      if (!e) return add(["reviews", i, "by"], `"${r.by}" is not in the editors list`);
      if (r.on < e.since || (e.until && r.on > e.until)) return add(["reviews", i, "on"], `${r.by} was not an editor on ${r.on} (an editor from ${e.since}${e.until ? ` to ${e.until}` : ""})`);
      if (e.party && owners.has(e.party)) return add(["reviews", i, "by"], `${r.by} may not approve a card about their own party; another editor does`);
      if (seen.has(r.by)) return add(["reviews", i, "by"], `${r.by} has already approved this card; a second approval must come from a different editor`);
      seen.add(r.by);
    });
    if (published(ctx)) {
      const need = ctx.config.editorial.approvals;
      const have = approvers(card, ctx).size;
      if (!ctx.editors) add(["reviews"], "a published card needs editors' approvals, but the site has no editors list");
      else if (have < need)
        add(["reviews"], `a published card needs ${plural(need, "editor")}' approvals; it has ${have}. Keep it in drafts/ until editors approve it (openpromises review)`);
    }
    return out;
  },
};

// ---------------------------------------------------------------- standing

/** Where a card's actor stands now: stated by hand, worked out from seats, or unknown. */
export function standingOf(actorId: string, actors: ReadonlyMap<string, Actor>, config: Config): Standing | undefined {
  const mode = config.actors.standing;
  if (mode === "none") return undefined;
  const actor = actors.get(actorId);
  if (!actor) return undefined;
  const partyId = actor.kind === "party" ? actor.id : actor.party_id;
  const party = partyId ? actors.get(partyId) : undefined;
  if (mode === "manual") return actor.standing ?? party?.standing;
  if (!party) return undefined;
  let total = 0;
  for (const a of actors.values()) if (a.kind === "party") total += a.seats ?? 0;
  if (!total) return undefined;
  return (party.seats ?? 0) * 2 > total ? "in_power" : "opposition";
}

const standing: Rule = {
  id: "standing",
  summary: 'A pledge by a party out of power is "not_in_power" or "unscoreable"; a pledge by the party in power is never "not_in_power".',
  check: (card, { config, actors }) => {
    if (!hasStatus(config, NOT_IN_POWER)) return [];
    const s = standingOf(card.actor_id, actors, config);
    if (s === "opposition" && card.status !== NOT_IN_POWER && card.status !== UNSCOREABLE)
      return [issue("standing", ["status"], `the party is out of power, so its pledge is "${NOT_IN_POWER}" (or "${UNSCOREABLE}"), not "${card.status}"`)];
    if (s === "in_power" && card.status === NOT_IN_POWER) return [issue("standing", ["status"], `the party is in power, so its pledge cannot be "${NOT_IN_POWER}"`)];
    return [];
  },
};

// ---------------------------------------------------------------- quotes

const quotes: Rule = {
  id: "quotes",
  summary: "Every version's words are confirmed at their stored or archived source before the card is published.",
  check: (card, ctx) => {
    const out: Issue[] = [];
    const { config } = ctx;
    card.versions.forEach((v, i) => {
      const at: Path = ["versions", i];
      if (config.quotes.archive === "required" && !v.archived_url)
        out.push(issue("quotes", [...at, "archived_url"], "is missing: every version needs an archived copy of its source", toPublish(ctx)));

      // Confirmed by a machine (stored span, archive check) or, where the site allows, by an editor.
      let confirmed = false;
      let reported = false;
      const report = (path: Path, message: string, severity: Severity = "error") => {
        out.push(issue("quotes", path, message, severity));
        reported = true;
      };

      if (v.source_text) {
        const text = ctx.sourceText?.(v.source_text.file);
        if (text === undefined) report([...at, "source_text", "file"], `sources/${v.source_text.file} is missing, so the quote cannot be checked`);
        else {
          const problems = checkSpan(v.text, text, v.source_text.span, { minWords: config.quotes.minWords });
          for (const p of problems) report([...at, "source_text"], p);
          if (!problems.length) confirmed = true;
        }
      }

      const check = ctx.quoteCheck?.(v);
      if (check?.match === "none") report([...at, "text"], `the words were not found in the archived copy ${check.url}${check.checked_on ? ` (checked on ${check.checked_on})` : ""}`);
      else if (check?.match === "exact") confirmed = true;
      else if (check?.match === "close") {
        if (v.quote_checked_on) confirmed = true;
        else report([...at, "quote_checked_on"], `the words only nearly match the archived copy ${check.url}; an editor confirms them against it by eye and records quote_checked_on`, toPublish(ctx));
      }

      if (!confirmed && !reported) {
        if (config.quotes.require === "editor" && v.quote_checked_on) confirmed = true;
        else
          out.push(
            issue(
              "quotes",
              [...at, "text"],
              config.quotes.require === "match"
                ? "has not been checked against its archived or stored source: add a stored-source span or an archive check (openpromises check-quote)"
                : "has not been confirmed at its source: an editor checks the words there and records quote_checked_on, or add a stored-source span or an archive check (openpromises check-quote)",
              toPublish(ctx),
            ),
          );
      }
    });
    return out;
  },
};

/** The tier of a quote in a text, using the card's normalisation language. */
export const quoteTier = (v: Version, text: string, config: Config) => matchQuote(v.text, text, { lang: v.lang ?? config.quotes.normalise ?? config.locales.default });

// ---------------------------------------------------------------- modules

const modules: Rule = {
  id: "modules",
  summary: "Module data is used only when the module is on, and is consistent.",
  check: (card, { config }) => {
    const out: Issue[] = [];
    const on = config.modules;
    const add = (path: Path, m: string, severity: Severity = "error") => out.push(issue("modules", path, m, severity));
    const off = (module: string, path: Path) => add(path, `uses the "${module}" module, which the configuration does not turn on (modules)`);
    const links = card.links ?? {};
    if (links.contracts && !on.has("contracts")) off("contracts", ["links", "contracts"]);
    if (links.decisions && !on.has("decisions")) off("decisions", ["links", "decisions"]);
    if (links.lever !== undefined && !on.has("lever")) off("lever", ["links", "lever"]);
    if (links.ward !== undefined && !on.has("wards")) off("wards", ["links", "ward"]);
    if (links.measurement && !on.has("metrics")) off("metrics", ["links", "measurement"]);
    card.versions.forEach((v, i) => {
      if (v.parameters?.metric && !on.has("metrics")) off("metrics", ["versions", i, "parameters", "metric"]);
    });
    // A warning in 0.2.0, an error from 0.3.0 (decision 13.2).
    if (on.has("lever") && links.lever && typeof links.lever === "object" && links.lever.settings && !links.lever.label)
      add(["links", "lever", "label"], "is missing: lever settings need a label saying what they show, such as \"£2 bus cap, as announced\"");
    if (links.measurement && on.has("metrics") && !card.versions.some((v) => v.parameters?.metric))
      add(["links", "measurement"], "belongs to a card with an indicator target (parameters.metric)");

    const keys = (links.contracts ?? []).map((r) => (typeof r === "string" ? r : r.award_id ? `${r.ocid}--award-${r.award_id}` : r.ocid));
    keys.forEach((k, i) => {
      if (keys.indexOf(k) !== i) add(["links", "contracts", i], `contract "${k}" is listed twice`);
    });
    (links.decisions ?? []).forEach((d, i) => {
      if (!hasStatus(config, d.event)) add(["links", "decisions", i, "event"], `"${d.event}" is not a status on the ${config.ladder.name} ladder`);
      else if (!card.events.some((e) => e.type === d.event)) add(["links", "decisions", i, "event"], `the card has no "${d.event}" event for this decision`);
    });

    const sources: [Path, NonNullable<Card["sources"]>[number]][] = [
      ...(card.sources ?? []).map((s, i): [Path, typeof s] => [["sources", i], s]),
      ...card.versions.flatMap((v, i) =>
        (["cost", "capital_cost"] as const).flatMap((k) => (v.parameters?.[k]?.sources ?? []).map((s, j): [Path, typeof s] => [["versions", i, "parameters", k, "sources", j], s])),
      ),
    ];
    for (const [path, s] of sources) {
      if ((s.kind || s.designation) && !on.has("designations")) off("designations", path);
      else if (on.has("designations")) {
        if (!s.kind) add([...path, "kind"], "is missing: with the designations module, every source says what kind of publisher it is");
        else if (s.kind !== "official" && !s.designation) add([...path, "designation"], "is missing: a source that is not official records its designation status");
        if (s.designation && s.designation.status !== "unchecked" && !s.designation.checked_on) add([...path, "designation", "checked_on"], "is missing: a designation status records when it was checked");
        if (s.designation?.status === "unchecked") add([...path, "designation", "status"], "is still unchecked", "warning");
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------- who must deliver, and who brought it about

const responsible: Rule = {
  id: "responsible",
  summary: "Who must deliver the promise (responsible) names a body by its role, never a party or a person, or is null when no body in power is committed; the configuration may require it.",
  check: (card, ctx) => {
    const { config, actors } = ctx;
    const kinds = config.actors.responsible;
    if (card.responsible === undefined)
      return config.actors.responsibleRequired
        ? [issue("responsible", ["responsible"], `is missing: name the body that must act to deliver it (an actor of kind ${list(kinds)}), or write null when no body in power is committed`, toPublish(ctx))]
        : [];
    if (card.responsible === null) return [];
    const id = card.responsible.actor_id;
    const a = actors.get(id);
    if (!a) return [issue("responsible", ["responsible", "actor_id"], `there is no actor "${id}" (actors/${id}.yaml)`)];
    if (!kinds.includes(a.kind)) return [issue("responsible", ["responsible", "actor_id"], `names a body by its role (an actor of kind ${list(kinds)}), not "${id}", which is a ${a.kind}`)];
    return [];
  },
};

const broughtAboutBy: Rule = {
  id: "brought-about-by",
  summary: "Who brought the outcome about (brought_about_by) is an actor, named only once something has happened: from the third step of the ladder up.",
  check: (card, { config, actors }) => {
    const by = card.brought_about_by;
    if (!by) return [];
    const out: Issue[] = [];
    if (!actors.has(by.actor_id)) out.push(issue("brought-about-by", ["brought_about_by", "actor_id"], `there is no actor "${by.actor_id}" (actors/${by.actor_id}.yaml)`));
    const steps = climb(config);
    if (steps.indexOf(card.status) < 2) out.push(issue("brought-about-by", ["brought_about_by"], `only applies once something has happened (${list(steps.slice(2))}); the status is "${card.status}"`));
    return out;
  },
};

// ---------------------------------------------------------------- references and site fields

const references: Rule = {
  id: "references",
  summary: "The card's actor and reply actors exist.",
  check: (card, { actors }) => {
    const out: Issue[] = [];
    if (!actors.has(card.actor_id)) out.push(issue("references", ["actor_id"], `there is no actor "${card.actor_id}" (actors/${card.actor_id}.yaml)`));
    (card.replies ?? []).forEach((r, i) => {
      if (r.from_actor_id && !actors.has(r.from_actor_id)) out.push(issue("references", ["replies", i, "from_actor_id"], `there is no actor "${r.from_actor_id}"`));
    });
    return out;
  },
};

/** Every rule run on a card, in the order their problems are listed. */
export const RULES: readonly Rule[] = [
  vocabulary,
  languages,
  headline,
  firstEvent,
  eventOrder,
  evidence,
  versions,
  statusEvent,
  scoreable,
  cost,
  corrections,
  approvals,
  standing,
  quotes,
  modules,
  responsible,
  broughtAboutBy,
  references,
];

/** Rules about more than one card, or about the files themselves, listed for documentation. */
export const OTHER_RULES = [
  { id: "schema", summary: "The file has the fields of format v1, with the right types, and no unknown fields." },
  { id: "x", summary: "The site's own fields (x) pass the site's own schema, if it gives one." },
  { id: "actors", summary: "Actors use configured kinds, levels and identifiers; parties exist; standing and seats fit the configuration." },
  { id: "editors", summary: "The editors list has each handle once, and every declared party is a party." },
  { id: "files", summary: "Ids are unique across promises/ and drafts/ and match their file names." },
  { id: "append-only", summary: "Compared with the base branch, a published card's history only grew." },
] as const;
