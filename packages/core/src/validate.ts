import type { Config } from "./config";
import { issue, zodIssues, type FileIssue, type Issue } from "./issues";
import { langMapIssues, RULES, type CardContext, type QuoteCheck } from "./rules";
import { Actor, Card, EditorsFile, type Editor, type LangMap, type Version } from "./schema";

/**
 * Validation of a whole content folder, in memory. @openpromises/files reads
 * the folder from disk (or from a git base) and hands it over as plain data;
 * nothing here touches a file.
 */

export interface CardInput {
  /** The file, relative to the content folder: "promises/uk-bus-cap.yaml". */
  file: string;
  where: "promises" | "drafts";
  data: unknown;
}

export interface ContentInput {
  config: Config;
  cards: CardInput[];
  actors: { file: string; data: unknown }[];
  /** The editors list, or null when the site has none. */
  editors: { file: string; data: unknown } | null;
  /** The archive check of a version's quote (quotes.json), if any. */
  quoteCheck?: (version: Version) => QuoteCheck | undefined;
  /** A stored source text from sources/, or undefined when it is missing. */
  sourceText?: (file: string) => string | undefined;
}

export interface ValidCard {
  file: string;
  where: "promises" | "drafts";
  card: Card;
}

export interface ContentResult {
  issues: FileIssue[];
  /** Cards that passed the schema (they may still break rules). */
  cards: ValidCard[];
  actors: Map<string, Actor>;
  editors: Editor[] | null;
}

const at = (file: string, list: Issue[]): FileIssue[] => list.map((i) => ({ file, ...i }));
const fileId = (file: string) => file.split(/[\\/]/).pop()!.replace(/\.ya?ml$/, "");

/** Check one card against the schema and every rule. */
export function validateCard(data: unknown, ctx: CardContext): { card: Card | null; issues: Issue[] } {
  const parsed = Card.safeParse(data, { reportInput: true });
  if (!parsed.success) return { card: null, issues: zodIssues(parsed.error) };
  const card = parsed.data;
  const issues = RULES.flatMap((r) => r.check(card, ctx));
  if (ctx.config.x.card) {
    const x = ctx.config.x.card.safeParse(card.x ?? {}, { reportInput: true });
    if (!x.success) issues.push(...zodIssues(x.error, "x", ["x"]));
  }
  return { card, issues };
}

/** Check one actor against the schema and the configuration. Cross-actor checks are in validateContent. */
export function validateActor(data: unknown, config: Config): { actor: Actor | null; issues: Issue[] } {
  const parsed = Actor.safeParse(data, { reportInput: true });
  if (!parsed.success) return { actor: null, issues: zodIssues(parsed.error) };
  const a = parsed.data;
  const out: Issue[] = [];
  const add = (path: (string | number)[], m: string) => out.push(issue("actors", path, m));
  const { kinds, standing, levels, ids } = config.actors;
  if (!kinds.includes(a.kind)) add(["kind"], `"${a.kind}" is not an actor kind in the configuration (${kinds.join(", ")})`);
  if (a.standing !== undefined && standing !== "manual")
    add(["standing"], standing === "fromSeats" ? "is worked out from seats on this site, so it is not written by hand" : "is not recorded on this site (actors.standing is none)");
  if (a.seats !== undefined && standing !== "fromSeats") add(["seats"], "only counts when the configuration works standing out from seats (actors.standing: fromSeats)");
  if (a.seats !== undefined && a.kind !== "party") add(["seats"], "belong to a party, not to a person or other actor");
  if (a.level !== undefined && !levels?.includes(a.level))
    add(["level"], levels ? `"${a.level}" is not a level in the configuration (${levels.join(", ")})` : "is not used on this site (actors.levels is not set)");
  for (const key of Object.keys(a.identifiers ?? {})) {
    if (!ids || !(key in ids)) add(["identifiers", key], `"${key}" is not an identifier in the configuration (actors.ids)`);
  }
  const maps: [(string | number)[], LangMap][] = [
    [["name"], a.name],
    ...(a.short_name ? ([[["short_name"], a.short_name]] as [(string | number)[], LangMap][]) : []),
    ...(a.roles ?? []).map((r, i): [(string | number)[], LangMap] => [["roles", i, "title"], r.title]),
  ];
  for (const [path, map] of maps) out.push(...langMapIssues({ path, map, kind: "ours", lint: true }, config));
  if (config.x.actor) {
    const x = config.x.actor.safeParse(a.x ?? {}, { reportInput: true });
    if (!x.success) out.push(...zodIssues(x.error, "x", ["x"]));
  }
  return { actor: a, issues: out };
}

/** Check a whole content folder: every card, draft and actor, the editors list, and the links between them. */
export function validateContent(input: ContentInput): ContentResult {
  const { config } = input;
  const issues: FileIssue[] = [];

  // Actors first: cards need them.
  const actors = new Map<string, Actor>();
  const actorFiles = new Map<string, string>();
  for (const f of input.actors) {
    const r = validateActor(f.data, config);
    issues.push(...at(f.file, r.issues));
    if (!r.actor) continue;
    if (fileId(f.file) !== r.actor.id) issues.push({ file: f.file, ...issue("files", ["id"], `is "${r.actor.id}", but the file is named ${fileId(f.file)}.yaml`) });
    if (actors.has(r.actor.id)) issues.push({ file: f.file, ...issue("files", ["id"], `actor "${r.actor.id}" is also in ${actorFiles.get(r.actor.id)}`) });
    else {
      actors.set(r.actor.id, r.actor);
      actorFiles.set(r.actor.id, f.file);
    }
  }
  const identifiers = new Map<string, string>();
  for (const [id, a] of actors) {
    const file = actorFiles.get(id)!;
    if (a.party_id !== undefined) {
      const party = actors.get(a.party_id);
      if (!party) issues.push({ file, ...issue("actors", ["party_id"], `there is no actor "${a.party_id}"`) });
      else if (party.kind !== "party") issues.push({ file, ...issue("actors", ["party_id"], `"${a.party_id}" is a ${party.kind}, not a party`) });
    }
    for (const [key, value] of Object.entries(a.identifiers ?? {})) {
      const k = `${key}=${String(value)}`;
      const other = identifiers.get(k);
      if (other) issues.push({ file, ...issue("actors", ["identifiers", key], `${key} ${String(value)} already belongs to "${other}"; one id, one actor`) });
      else identifiers.set(k, id);
    }
  }

  let editors: Editor[] | null = null;
  if (input.editors) {
    const parsed = EditorsFile.safeParse(input.editors.data, { reportInput: true });
    if (!parsed.success) issues.push(...at(input.editors.file, zodIssues(parsed.error)));
    else {
      editors = parsed.data.editors;
      const handles = new Set<string>();
      editors.forEach((e, i) => {
        const add = (path: (string | number)[], m: string) => issues.push({ file: input.editors!.file, ...issue("editors", ["editors", i, ...path], m) });
        if (handles.has(e.handle)) add(["handle"], `"${e.handle}" is listed twice`);
        handles.add(e.handle);
        if (e.party !== null && actors.get(e.party)?.kind !== "party") add(["party"], "is not a party among the actors");
        if (e.until && e.until < e.since) add(["until"], "is before since");
      });
    }
  }

  const cards: ValidCard[] = [];
  const cardFiles = new Map<string, string>();
  for (const f of input.cards) {
    const ctx: CardContext = {
      config,
      where: f.where,
      actors,
      editors,
      ...(input.quoteCheck ? { quoteCheck: input.quoteCheck } : {}),
      ...(input.sourceText ? { sourceText: input.sourceText } : {}),
    };
    const r = validateCard(f.data, ctx);
    issues.push(...at(f.file, r.issues));
    if (!r.card) continue;
    if (fileId(f.file) !== r.card.id) issues.push({ file: f.file, ...issue("files", ["id"], `is "${r.card.id}", but the file is named ${fileId(f.file)}.yaml`) });
    const other = cardFiles.get(r.card.id);
    if (other) issues.push({ file: f.file, ...issue("files", ["id"], `"${r.card.id}" is also ${other}; cards and drafts share one set of ids`) });
    else cardFiles.set(r.card.id, f.file);
    cards.push({ file: f.file, where: f.where, card: r.card });
  }

  return { issues, cards, actors, editors };
}
