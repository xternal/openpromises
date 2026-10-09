import { z } from "zod";
import { CATEGORIES, DEFAULT_DEADLINE_TEXT, DEFAULT_LABELS, EVENT_TYPES, type LadderStatus, PRESETS, PROMISED } from "./ladder";
import { Locale, Slug, Url, Word } from "./schema";

/**
 * A site's configuration (RFC-0001 §7, docs/FORMAT.md §2): one file,
 * openpromises.config.ts (or .yaml, .json), that sets the engine up for one
 * tracker. defineConfig checks it; resolveConfig fills in the defaults.
 */

export const MODULES = ["contracts", "decisions", "lever", "metrics", "designations", "wards"] as const;
export type Module = (typeof MODULES)[number];
/** Always on (principles 3 and 4); accepted in `modules` so RFC-0001's example works unchanged. */
const ALWAYS_ON = ["corrections", "reviews"] as const;

export const LEGACY_FORMATS = ["public-ledger", "borough-book", "russia-ledger"] as const;
export type LegacyFormat = (typeof LEGACY_FORMATS)[number];

const Count = z.number().int().nonnegative();

const HeadlineLimits = z.strictObject({
  minWords: Count.optional(),
  maxWords: Count.optional(),
  minChars: Count.optional(),
  maxChars: Count.optional(),
});
type HeadlineLimits = z.infer<typeof HeadlineLimits>;

/** Text per language: { en: "…", ru: "…" }. */
const PerLocale = z.record(Locale, z.string().min(1));
/** A path on the site, with placeholders: "/promise/{id}". */
const PathTemplate = z.string().regex(/^\/[^\s]*$/, "should be a path starting with /, such as /promise/{id}");
/** Labels and URL slugs for areas: { taxes: { en: "Taxes" } }, { economic_affairs: "transport-and-economy" }. */
const AreaLabels = z.record(z.string(), PerLocale);
const AreaSlugs = z.record(z.string(), Slug);

/** A Zod schema for the site's own `x` fields (TypeScript configuration only). */
const SchemaLike = z.custom<z.ZodType>((v) => !!v && typeof (v as { safeParse?: unknown }).safeParse === "function", "should be a Zod schema");

export const ConfigInput = z.strictObject({
  site: z.strictObject({
    name: z.string().min(1),
    url: Url.optional(),
    /** What the site is, per language: used by feeds, llms.txt and structured data. */
    description: PerLocale.optional(),
    /** Where the site serves its pages; {id} and {area} are filled in. */
    paths: z
      .strictObject({
        promises: PathTemplate.optional(),
        card: PathTemplate.optional(),
        actor: PathTemplate.optional(),
        area: PathTemplate.optional(),
        /** A folder ("/feeds": /feeds/all.xml, /feeds/promise/<id>.xml), or a feed beside each page ("{page}/feed.xml"). */
        feeds: z.string().regex(/^(\/[^\s]*|\{page\}[^\s]*)$/, 'should be a folder such as /feeds, or "{page}/feed.xml"').optional(),
      })
      .optional(),
    /** The path each language's pages start with: { ru: "", en: "/en" }. */
    localePaths: z.record(Locale, z.string().regex(/^(\/[A-Za-z0-9-]+)*$/, 'should be "" or a path such as /en')).optional(),
  }),
  content: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  locales: z.strictObject({ default: Locale, all: z.array(Locale).min(1) }).optional(),
  money: z
    .strictObject({
      currency: z.string().regex(/^[A-Z]{3}$/, "should be a three-letter currency code such as GBP"),
      unit: z.string().optional(),
      period: z.enum(["year", "month", "total"]).optional(),
      qualities: z.array(Word).min(1).optional(),
      /** Whether every cost names who made its central figure (cost.by, decision 14). */
      costedBy: z.enum(["required", "optional"]).optional(),
    })
    .optional(),
  actors: z
    .strictObject({
      kinds: z.array(Word).min(1).optional(),
      standing: z.enum(["manual", "fromSeats", "none"]).optional(),
      levels: z.array(z.string().min(1)).min(1).optional(),
      ids: z.record(Word, z.string()).optional(),
      /** The kinds of actor a card's `responsible` may name: bodies, never a party or a person (decision 14). */
      responsible: z.array(Word).min(1).optional(),
      /** Whether every card says who must deliver it (`responsible`, or null). */
      responsibleRequired: z.boolean().optional(),
    })
    .optional(),
  venues: z.array(Word).min(1).optional(),
  areas: z
    .discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("enum"), values: z.array(z.string().min(1)).min(1), labels: AreaLabels.optional(), slugs: AreaSlugs.optional() }),
      z.strictObject({ kind: z.literal("codes"), pattern: z.string().min(1), labels: AreaLabels.optional(), slugs: AreaSlugs.optional() }),
      z.strictObject({ kind: z.literal("text") }),
    ])
    .optional(),
  ladder: z
    .union([z.enum(["national", "local"]), z.strictObject({ custom: z.array(z.strictObject({ id: Word, category: z.enum(CATEGORIES) })).min(1) })])
    .optional(),
  labels: z.record(z.string(), z.union([z.string(), z.record(z.string(), z.string())])).optional(),
  headline: z.record(Locale, HeadlineLimits).optional(),
  editorial: z
    .strictObject({
      approvals: z.number().int().min(2, "should be 2 or more: publishing needs two editors (principle 4)").optional(),
      partyConflict: z.literal(true, { error: "cannot be turned off: an editor never approves a card about their own party (principle 4)" }).optional(),
      editorsFile: z.string().min(1).optional(),
      /** A reviewer's name as readers see it now, for one renamed since its reviews were recorded: { "Junior Editor": "AI Journalist" }. */
      renamed: z.record(z.string().min(1), z.string().min(1)).optional(),
      model: z.literal("in-file", { error: 'should be "in-file": approvals are recorded in the card (decision 4)' }).optional(),
    })
    .optional(),
  quotes: z
    .strictObject({
      archive: z.enum(["required", "optional"]).optional(),
      require: z.enum(["editor", "match"]).optional(),
      normalise: Locale.optional(),
      minWords: Count.optional(),
      /** The terms a quote may be reused on, by its source's address: [{ hosts: ["parliament.uk"], name: "Open Parliament Licence v3.0" }]. A host covers its subdomains. */
      licences: z.array(z.strictObject({ hosts: z.array(z.string().regex(/^[a-z0-9.-]+$/, "should be a host name such as parliament.uk")).min(1), name: z.string().min(1) })).optional(),
      /** The terms for a quote whose source matches none of them. */
      otherLicence: z.string().min(1).optional(),
    })
    .optional(),
  modules: z.array(z.enum([...MODULES, ...ALWAYS_ON])).optional(),
  legacy: z.enum(LEGACY_FORMATS).optional(),
  deadlines: z.strictObject({ text: z.record(Locale, z.string().min(1)).optional() }).optional(),
  lint: z
    .strictObject({
      words: z.record(Locale, z.array(z.string().min(1))).optional(),
      allow: z.record(Locale, z.array(z.string().min(1))).optional(),
    })
    .optional(),
  /** Words on pages, feeds and Markdown, per language, replacing the built-in ones (@openpromises/publish MESSAGES). */
  messages: z.record(Locale, z.record(z.string(), z.string())).optional(),
  publish: z
    .strictObject({
      /** The fixed start of every feed entry id (RFC 4151 tag URI): "ledgergov.uk,2026". Set it once and never change it. */
      tag: z.string().regex(/^[A-Za-z0-9.-]+,\d{4}(-\d{2}(-\d{2})?)?$/, 'should be an authority and a date, such as "example.org,2026"').optional(),
      /** Which feed format to write. */
      feeds: z.enum(["atom", "rss", "both"]).optional(),
      /** The licence of the site's own writing (headlines, notes, events), for Markdown and open data. */
      licence: z.strictObject({ name: z.string().min(1), url: Url }).optional(),
    })
    .optional(),
  x: z.strictObject({ card: SchemaLike.optional(), actor: SchemaLike.optional() }).optional(),
});
export type ConfigInput = z.input<typeof ConfigInput>;

export interface SitePaths {
  promises: string;
  card: string;
  actor: string;
  area: string;
  feeds: string;
}

export interface Config {
  site: { name: string; url?: string; description: Record<string, string>; paths: SitePaths; localePaths: Record<string, string> };
  /** The content folder, relative to the configuration file. */
  content: string;
  timezone: string;
  locales: { default: string; all: string[] };
  money: { currency: string; unit: string; period: "year" | "month" | "total"; qualities: string[]; costedBy: "required" | "optional" };
  actors: { kinds: string[]; standing: "manual" | "fromSeats" | "none"; levels?: string[]; ids?: Record<string, string>; responsible: string[]; responsibleRequired: boolean };
  /** Allowed venues; undefined allows any. */
  venues?: string[];
  areas:
    | { kind: "enum"; values: string[]; labels?: Record<string, Record<string, string>>; slugs?: Record<string, string> }
    | { kind: "codes"; pattern: string; labels?: Record<string, Record<string, string>>; slugs?: Record<string, string> }
    | { kind: "text" };
  ladder: { name: string; statuses: LadderStatus[] };
  /** Status labels per language. */
  labels: Record<string, Record<string, string>>;
  /** Headline limits per configured language. */
  headline: Record<string, HeadlineLimits>;
  editorial: { approvals: number; partyConflict: true; editorsFile: string; renamed: Record<string, string> };
  quotes: { archive: "required" | "optional"; require: "editor" | "match"; normalise?: string; minWords: number; licences: { hosts: string[]; name: string }[]; otherLicence?: string };
  modules: Set<Module>;
  legacy?: LegacyFormat;
  deadlines: { text: Record<string, string> };
  lint: { words: Record<string, string[]>; allow: Record<string, string[]> };
  /** Message overrides per language, for @openpromises/publish and @openpromises/react. */
  messages: Record<string, Record<string, string>>;
  publish: { tag?: string; feeds: "atom" | "rss" | "both"; licence?: { name: string; url: string } };
  x: { card?: z.ZodType; actor?: z.ZodType };
}

const DEFAULT_PATHS: SitePaths = { promises: "/promises", card: "/promise/{id}", actor: "/actor/{id}", area: "/promises/area/{area}", feeds: "/feeds" };

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`the configuration has ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

const HEADLINE_DEFAULTS: Record<string, HeadlineLimits> = {
  en: { minWords: 3, maxWords: 8, minChars: 3, maxChars: 70 },
};
const HEADLINE_OTHER: HeadlineLimits = { minChars: 3, maxChars: 80 };

/**
 * Check a configuration and return it unchanged, so a TypeScript configuration
 * file gets types and early errors: `export default defineConfig({ … })`.
 */
export function defineConfig<const T extends ConfigInput>(input: T): T {
  resolveConfig(input);
  return input;
}

/** Check a configuration and fill in every default. Throws a ConfigError listing every problem. */
export function resolveConfig(input: unknown): Config {
  const parsed = ConfigInput.safeParse(input);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.map(String).join(".") || "(configuration)"}: ${i.message}`));
  }
  const c = parsed.data;
  const problems: string[] = [];

  const locales = c.locales ?? { default: "en", all: ["en"] };
  if (!locales.all.includes(locales.default)) problems.push(`locales.default "${locales.default}" is not one of locales.all (${locales.all.join(", ")})`);
  if (new Set(locales.all).size !== locales.all.length) problems.push("locales.all lists a language twice");

  let statuses: LadderStatus[];
  let ladderName: string;
  if (typeof c.ladder === "object") {
    statuses = c.ladder.custom.map((x) => ({ id: x.id, category: x.category }));
    ladderName = "custom";
    const first = statuses[0]!;
    if (first.id !== PROMISED || first.category !== "open") problems.push(`ladder.custom: the first status is "promised", in the "open" category`);
    const ids = statuses.map((x) => x.id);
    if (new Set(ids).size !== ids.length) problems.push("ladder.custom lists a status twice");
    for (const id of ids) {
      if (id !== PROMISED && (EVENT_TYPES as readonly string[]).includes(id)) problems.push(`ladder.custom: "${id}" is an event type, so it cannot be a status`);
    }
  } else {
    ladderName = c.ladder ?? "national";
    statuses = PRESETS[ladderName as keyof typeof PRESETS].map((x) => ({ ...x }));
  }

  // Labels: neutral defaults, then the site's own; a flat map is for the default language.
  const labels: Record<string, Record<string, string>> = {};
  for (const l of locales.all) labels[l] = { ...(DEFAULT_LABELS[l] ?? {}) };
  for (const [key, value] of Object.entries(c.labels ?? {})) {
    if (typeof value === "string") labels[locales.default]![key] = value;
    else if (!locales.all.includes(key)) problems.push(`labels.${key}: "${key}" is not one of the configured languages`);
    else Object.assign(labels[key]!, value);
  }
  for (const l of locales.all) {
    for (const st of statuses) if (!labels[l]![st.id]) problems.push(`labels: status "${st.id}" has no label in "${l}"`);
  }

  const headline: Record<string, HeadlineLimits> = {};
  for (const l of locales.all) headline[l] = { ...(HEADLINE_DEFAULTS[l] ?? HEADLINE_OTHER), ...(c.headline?.[l] ?? {}) };
  for (const l of Object.keys(c.headline ?? {})) if (!locales.all.includes(l)) problems.push(`headline.${l}: "${l}" is not one of the configured languages`);

  const deadlineText: Record<string, string> = {};
  for (const l of locales.all) {
    const t = c.deadlines?.text?.[l] ?? DEFAULT_DEADLINE_TEXT[l];
    if (t) deadlineText[l] = t;
    else problems.push(`deadlines.text: no words for the automatic deadline_missed event in "${l}"`);
  }

  const paths: SitePaths = { ...DEFAULT_PATHS, ...(c.site.paths ?? {}) };
  for (const [key, placeholder] of [
    ["card", "{id}"],
    ["actor", "{id}"],
    ["area", "{area}"],
  ] as const)
    if (!paths[key].includes(placeholder)) problems.push(`site.paths.${key} needs ${placeholder} in it`);
  for (const l of Object.keys(c.site.localePaths ?? {})) if (!locales.all.includes(l)) problems.push(`site.localePaths.${l}: "${l}" is not one of the configured languages`);
  for (const l of [...Object.keys(c.site.description ?? {}), ...Object.keys(c.messages ?? {})])
    if (!locales.all.includes(l)) problems.push(`"${l}" in site.description or messages is not one of the configured languages`);
  if (c.areas && c.areas.kind !== "text") {
    const known = c.areas.kind === "enum" ? new Set(c.areas.values) : null;
    for (const [field, map] of [
      ["labels", c.areas.labels],
      ["slugs", c.areas.slugs],
    ] as const)
      for (const key of Object.keys(map ?? {})) if (known && !known.has(key)) problems.push(`areas.${field}.${key}: "${key}" is not one of areas.values`);
    const slugs = Object.values(c.areas.slugs ?? {});
    if (new Set(slugs).size !== slugs.length) problems.push("areas.slugs gives two areas the same slug");
  }

  if (c.areas?.kind === "codes") {
    try {
      new RegExp(c.areas.pattern, "u");
    } catch {
      problems.push(`areas.pattern is not a valid regular expression`);
    }
  }

  const actors = {
    kinds: c.actors?.kinds ?? ["person", "party", "government"],
    standing: c.actors?.standing ?? "none",
    ...(c.actors?.levels ? { levels: c.actors.levels } : {}),
    ...(c.actors?.ids ? { ids: c.actors.ids } : {}),
    responsible: c.actors?.responsible ?? (c.actors?.kinds ?? ["person", "party", "government"]).filter((k) => k !== "person" && k !== "party"),
    responsibleRequired: c.actors?.responsibleRequired ?? false,
  };
  if (actors.standing === "fromSeats" && !actors.kinds.includes("party")) problems.push(`actors.standing "fromSeats" needs the "party" kind in actors.kinds`);
  for (const k of actors.responsible) {
    if (k === "person" || k === "party") problems.push(`actors.responsible cannot include "${k}": who must deliver a promise is a body named by its role, never a party or a person`);
    else if (!actors.kinds.includes(k)) problems.push(`actors.responsible: "${k}" is not one of actors.kinds`);
  }
  if (actors.responsibleRequired && !actors.responsible.length) problems.push(`actors.responsibleRequired needs at least one kind of body in actors.responsible`);

  if (problems.length) throw new ConfigError(problems);

  return {
    site: {
      name: c.site.name,
      ...(c.site.url ? { url: c.site.url } : {}),
      description: c.site.description ?? {},
      paths,
      localePaths: Object.fromEntries(locales.all.map((l) => [l, c.site.localePaths?.[l] ?? (l === locales.default ? "" : `/${l}`)])),
    },
    content: c.content ?? "content",
    timezone: c.timezone ?? "UTC",
    locales: { default: locales.default, all: [...locales.all] },
    money: { currency: c.money?.currency ?? "GBP", unit: c.money?.unit ?? "", period: c.money?.period ?? "year", qualities: c.money?.qualities ?? ["sourced", "approx", "modelled"], costedBy: c.money?.costedBy ?? "optional" },
    actors,
    ...(c.venues ? { venues: c.venues } : {}),
    areas: c.areas ?? { kind: "text" },
    ladder: { name: ladderName, statuses },
    labels,
    headline,
    editorial: { approvals: c.editorial?.approvals ?? 2, partyConflict: true, editorsFile: c.editorial?.editorsFile ?? "editors.yaml", renamed: c.editorial?.renamed ?? {} },
    quotes: {
      archive: c.quotes?.archive ?? "optional",
      require: c.quotes?.require ?? "editor",
      ...(c.quotes?.normalise ? { normalise: c.quotes.normalise } : {}),
      minWords: c.quotes?.minWords ?? 6,
      licences: c.quotes?.licences ?? [],
      ...(c.quotes?.otherLicence ? { otherLicence: c.quotes.otherLicence } : {}),
    },
    modules: new Set((c.modules ?? []).filter((m): m is Module => (MODULES as readonly string[]).includes(m))),
    ...(c.legacy ? { legacy: c.legacy } : {}),
    deadlines: { text: deadlineText },
    lint: { words: c.lint?.words ?? {}, allow: c.lint?.allow ?? {} },
    messages: c.messages ?? {},
    publish: { ...(c.publish?.tag ? { tag: c.publish.tag } : {}), feeds: c.publish?.feeds ?? "atom", ...(c.publish?.licence ? { licence: c.publish.licence } : {}) },
    x: { ...(c.x?.card ? { card: c.x.card } : {}), ...(c.x?.actor ? { actor: c.x.actor } : {}) },
  };
}

/**
 * The ladder a card climbs: the open and progress statuses and the first
 * finished one (delivered). The other finished statuses (not met, undone) are
 * where a story can end instead, not steps up.
 */
export function climb(config: Config): string[] {
  const out: string[] = [];
  for (const s of config.ladder.statuses) {
    if (s.category === "off_ladder") continue;
    out.push(s.id);
    if (s.category === "finished") break;
  }
  return out;
}

/** The category of a status in this site's ladder, or undefined when the ladder has no such status. */
export const categoryOf = (config: Config, status: string) => config.ladder.statuses.find((s) => s.id === status)?.category;

export const hasStatus = (config: Config, status: string) => config.ladder.statuses.some((s) => s.id === status);

/** The label of a status in a language, falling back to the default language and then the id. */
export const statusLabel = (config: Config, status: string, locale = config.locales.default) =>
  config.labels[locale]?.[status] ?? config.labels[config.locales.default]?.[status] ?? status;
