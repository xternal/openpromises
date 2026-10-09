import { createHash } from "node:crypto";
import { normalise } from "@openpromises/quotes";
import {
  fromBoroughBookCouncillor,
  fromBoroughBookParty,
  migrateActor,
  migrateCard,
  seatsFromCouncillors,
  type CardInput,
  type Config,
  type ContentInput,
  type FileIssue,
  type LegacyContext,
  type QuoteCheck,
  type Version,
} from "@openpromises/core";
import type { ContentSource } from "./source";
import { readYaml } from "./write";

/**
 * Reading a content folder (docs/FORMAT.md §1) into the plain data
 * @openpromises/core validates. Files in the site's older format (config
 * `legacy`) are converted to format v1 as they are read, so the rest of the
 * engine only ever sees v1.
 */

export const DIRS = { promises: "promises", drafts: "drafts", actors: "actors", sources: "sources" } as const;
export const QUOTES_FILE = "quotes.json";

export interface Migrated {
  file: string;
  kind: "card" | "actor";
  /** The file in format v1. */
  data: unknown;
}

export interface ReadResult {
  input: ContentInput;
  /** Files read in the older format and converted to v1 on the way in. */
  migrated: Migrated[];
  /** Files that could not be read at all. */
  issues: FileIssue[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isYaml = (name: string) => /\.ya?ml$/.test(name);

/** The key a quote check is filed under in quotes.json: the normalised quote's SHA-256, and the copy checked. */
export function quoteKey(text: string, lang: string, url: string): string {
  return `${createHash("sha256").update(normalise(text, lang)).digest("hex")}|${url}`;
}

/** The language a version's words are normalised in. */
export const quoteLang = (v: Pick<Version, "lang">, config: Config) => v.lang ?? config.quotes.normalise ?? config.locales.default;

/** The copy a version's quote is checked against: its archive copy if it has one, else its source. */
export const quoteUrl = (v: Pick<Version, "archived_url" | "source_url">) => v.archived_url ?? v.source_url;

export interface ReadOptions {
  /** The editors list from somewhere other than the content folder (validate --editors). */
  editors?: { file: string; text: string | null };
  /** Read published cards only (the git base, for the append-only check). */
  publishedOnly?: boolean;
}

/** Read a content folder, converting files in the site's older format to v1. */
export function readContent(source: ContentSource, config: Config, opts: ReadOptions = {}): ReadResult {
  const issues: FileIssue[] = [];
  const migrated: Migrated[] = [];
  const parseFile = (file: string, text: string | null): unknown => {
    if (text === null) return undefined;
    try {
      return readYaml(text);
    } catch (e) {
      issues.push({ file, rule: "schema", severity: "error", path: [], message: `is not valid YAML: ${(e as Error).message.split("\n")[0]}` });
      return undefined;
    }
  };
  const read = (file: string) => parseFile(file, source.read(file));

  const legacy = config.legacy;
  const ctx: LegacyContext = {};
  if (legacy === "borough-book") {
    const parties = read("parties.yaml");
    const links = read("decision_links.yaml");
    if (isObj(parties) && Array.isArray(parties.parties)) ctx.parties = parties.parties;
    if (isObj(links) && Array.isArray(links.links)) ctx.decisionLinks = links.links;
  }

  const cards: CardInput[] = [];
  for (const where of opts.publishedOnly ? (["promises"] as const) : (["promises", "drafts"] as const)) {
    for (const name of source.list(where).filter(isYaml)) {
      const file = `${where}/${name}`;
      let data = read(file);
      if (data === undefined) continue;
      if (legacy && isObj(data) && data.format === undefined) {
        data = migrateCard(legacy, data, ctx);
        migrated.push({ file, kind: "card", data });
      }
      cards.push({ file, where, data });
    }
  }

  const actors: { file: string; data: unknown }[] = [];
  if (!opts.publishedOnly) {
    for (const name of source.list(DIRS.actors).filter(isYaml)) {
      const file = `${DIRS.actors}/${name}`;
      let data = read(file);
      if (data === undefined) continue;
      if (legacy && isObj(data) && data.format === undefined) {
        data = migrateActor(legacy, data);
        migrated.push({ file, kind: "actor", data });
      }
      actors.push({ file, data });
    }
    if (legacy === "borough-book") {
      // Borough Book keeps parties in one file and councillors in their own folder; each becomes an actor file.
      const have = new Set(actors.map((a) => a.file));
      const councillors = source
        .list("councillors")
        .filter(isYaml)
        .map((name) => read(`councillors/${name}`))
        .filter(isObj);
      const counted = read("seats.yaml");
      const seats = councillors.length ? seatsFromCouncillors(councillors) : isObj(counted) && isObj(counted.seats) ? (counted.seats as Record<string, number>) : {};
      const add = (data: Record<string, unknown>) => {
        const file = `${DIRS.actors}/${String(data.id)}.yaml`;
        if (have.has(file)) return;
        have.add(file);
        actors.push({ file, data });
        migrated.push({ file, kind: "actor", data });
      };
      for (const p of (ctx.parties ?? []).filter(isObj)) add(fromBoroughBookParty(p, seats[String(p.id)] ?? 0));
      for (const c of councillors) add(fromBoroughBookCouncillor(c));
    }
  }

  let editors: ContentInput["editors"] = null;
  if (!opts.publishedOnly) {
    const e = opts.editors ?? { file: config.editorial.editorsFile, text: source.read(config.editorial.editorsFile) };
    const data = parseFile(e.file, e.text);
    if (data !== undefined) editors = { file: e.file, data };
  }

  const texts = new Map<string, string | undefined>();
  const sourceText = (file: string) => {
    if (!texts.has(file)) texts.set(file, source.read(`${DIRS.sources}/${file}`) ?? undefined);
    return texts.get(file);
  };

  let checks: Record<string, QuoteCheck> = {};
  const quotesText = opts.publishedOnly ? null : source.read(QUOTES_FILE);
  if (quotesText !== null) {
    try {
      const parsed = JSON.parse(quotesText) as unknown;
      if (isObj(parsed)) checks = parsed as Record<string, QuoteCheck>;
      else throw new Error("not an object");
    } catch (e) {
      issues.push({ file: QUOTES_FILE, rule: "schema", severity: "error", path: [], message: `is not a valid quote check record: ${(e as Error).message}` });
    }
  }
  const quoteCheck = (v: Version) => checks[quoteKey(v.text, quoteLang(v, config), quoteUrl(v))];

  return { input: { config, cards, actors, editors, quoteCheck, sourceText }, migrated, issues };
}

/** SHA-256 of a file's bytes, as hex. */
export const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

/** quotes.json with one check added or replaced, keys sorted so the file changes only where it must. */
export function withQuoteCheck(existing: string | null, key: string, check: QuoteCheck): string {
  const all = existing ? (JSON.parse(existing) as Record<string, QuoteCheck>) : {};
  all[key] = check;
  const sorted = Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}
