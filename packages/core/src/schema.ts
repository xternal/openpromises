import { z } from "zod";

/**
 * Format v1 (docs/FORMAT.md): the shape of a promise card, an actor and the
 * editors list. Structure only; the rules that need the configuration or more
 * than one field are in rules.ts. Unknown fields are refused, so a misspelt
 * field never passes silently: site-only fields go in `x`.
 */

export const FORMAT = "openpromises/1";

/** An id: lower-case letters, digits and hyphens, starting and ending with a letter or digit. */
export const Slug = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/, "should be an id: lower-case letters, digits and hyphens (for example keir-starmer)");

/** A status, event type or kind: lower-case letters, digits and underscores. */
export const Word = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/, "should be lower-case letters, digits and _ (for example in_plan)");

export const IsoDate = z.iso.date({ error: 'should be a date written "YYYY-MM-DD"' });

export const Url = z.url({ protocol: /^https?$/, error: "should be a web address starting http:// or https://" });

/** Text that is not empty or only spaces. */
export const Text = z.string({ error: "should be text" }).regex(/\S/, "is empty");

/** A language code: "en", "ru", "pt-BR". */
export const Locale = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 'should be a language code such as "en" or "ru"');

/** Text we write, one entry per language: { en: "…" } or { ru: "…", en: "…" }. */
export const LangMap = z
  .record(Locale, Text)
  .refine((m) => Object.keys(m).length > 0, "needs text in at least one language");
export type LangMap = z.infer<typeof LangMap>;

/** [low, central, high]. */
export const Range = z.tuple([z.number(), z.number(), z.number()], { error: "should be a range of three numbers: [low, central, high]" });

export const DESIGNATION_STATUSES = ["none", "foreign_agent", "undesirable", "extremist", "unchecked"] as const;
export const SOURCE_KINDS = ["official", "party", "media", "independent"] as const;

export const Source = z.strictObject({
  title: Text,
  url: Url,
  archived_url: Url.optional(),
  /** designations module: what kind of publisher this is. */
  kind: z.enum(SOURCE_KINDS).optional(),
  /** designations module: the publisher's designation status, and when it was checked. */
  designation: z.strictObject({ status: z.enum(DESIGNATION_STATUSES), checked_on: IsoDate.optional() }).optional(),
});
export type Source = z.infer<typeof Source>;

export const Cost = z.strictObject({
  range: Range.optional(),
  quality: Word.optional(),
  note: LangMap.optional(),
  sources: z.array(Source).optional(),
});
export type Cost = z.infer<typeof Cost>;

export const Metric = z.strictObject({
  series_id: Text,
  target: z.number(),
  direction: z.enum(["at_least", "at_most", "below"]),
  unit: Text,
  by: IsoDate,
});

export const Parameters = z.strictObject({
  who: LangMap.optional(),
  cost: Cost.optional(),
  capital_cost: Cost.nullable().optional(),
  when: LangMap.optional(),
  deadline: IsoDate.nullable().optional(),
  funded_by: LangMap.nullable().optional(),
  funding_verifiable: z.boolean().optional(),
  metric: Metric.optional(),
});
export type Parameters = z.infer<typeof Parameters>;

/** A file name inside sources/: no folders, no leading dot. */
export const SourceFile = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/, "should be a file name inside sources/, such as hansard-19e8c247.txt");

export const Version = z.strictObject({
  version: z.number().int().positive(),
  /** The speaker's exact words. */
  text: Text,
  lang: Locale.optional(),
  translations: LangMap.optional(),
  recorded_on: IsoDate,
  source_url: Url,
  archived_url: Url.optional(),
  page: z.number().int().positive().nullable().optional(),
  quote_checked_on: IsoDate.nullable().optional(),
  source_text: z
    .strictObject({
      file: SourceFile,
      span: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()], { error: "should be a span of two character positions: [start, end]" }),
    })
    .optional(),
  parameters: Parameters.nullable(),
});
export type Version = z.infer<typeof Version>;

export const Event = z.strictObject({
  date: IsoDate,
  type: Word,
  text: LangMap,
  evidence_url: Url.optional(),
  auto: z.boolean().optional(),
  subtype: z.literal("deadline_moved").optional(),
});
export type Event = z.infer<typeof Event>;

export const Reply = z
  .strictObject({
    from_actor_id: Slug.optional(),
    from: Text.optional(),
    date: IsoDate,
    text: Text,
    lang: Locale.optional(),
    translations: LangMap.optional(),
    url: Url.optional(),
    editor_response: LangMap.optional(),
  })
  .refine((r) => r.from_actor_id !== undefined || r.from !== undefined, { error: "needs from_actor_id or from: who the reply is from" });
export type Reply = z.infer<typeof Reply>;

/** versions[0].parameters.cost.range, events[3].date, replies[1].editor_response */
export const CORRECTION_PATH = /^(versions|events|replies)\[(\d+)\]((?:\.[A-Za-z0-9_-]+)+)$/;

export const Correction = z.strictObject({
  date: IsoDate,
  path: z.string().regex(CORRECTION_PATH, 'should be a field path such as "events[3].date" or "versions[0].parameters.cost.range"'),
  was: z.unknown(),
  now: z.unknown(),
  reason: LangMap,
  source_url: Url.optional(),
});
export type Correction = z.infer<typeof Correction>;

export const REVIEW_KINDS = ["automated", "editor", "legal", "external"] as const;

export const Review = z.strictObject({
  by: z.string().regex(/^\S(?:.{0,38}\S)?$/, "should be a name or handle of 1 to 40 characters, with no space at either end"),
  kind: z.enum(REVIEW_KINDS),
  on: IsoDate,
  note: LangMap.optional(),
  approves: z.boolean().optional(),
  batch: z.literal(true).optional(),
});
export type Review = z.infer<typeof Review>;

export const Ocid = z.string().regex(/^ocds-[a-z0-9]+-[A-Za-z0-9-]+$/, "should be an OCDS id, such as ocds-h6vhtk-0525b3");
export const ContractRef = z.union([Ocid, z.strictObject({ ocid: Ocid, award_id: Text.optional(), notice_url: Url.optional() })]);
export type ContractRef = z.infer<typeof ContractRef>;

export const DecisionLink = z.strictObject({
  decision_id: Text,
  event: Word,
  quote: Text,
  suggested_by: Text.optional(),
  suggested_on: IsoDate.optional(),
});

export const Lever = z.union([
  Text,
  z.strictObject({
    id: Text.optional(),
    settings: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
    label: LangMap.optional(),
  }),
]);

export const Measurement = z.strictObject({
  status: z.enum(["open", "delayed", "closed"]),
  since: IsoDate.optional(),
  note: LangMap.optional(),
});

/** Module data (docs/FORMAT.md §10). Which keys a card may use depends on the configured modules. */
export const Links = z.strictObject({
  contracts: z.array(ContractRef).optional(),
  decisions: z.array(DecisionLink).optional(),
  lever: Lever.optional(),
  measurement: Measurement.optional(),
  ward: Slug.optional(),
});
export type Links = z.infer<typeof Links>;

export const ORIGINS = ["manual", "reader_submission", "llm_intake"] as const;

export const Card = z.strictObject({
  format: z.literal(FORMAT, { error: `should be "${FORMAT}": a v1 card starts with "format: ${FORMAT}"` }),
  id: Slug,
  headline: LangMap.optional(),
  actor_id: Slug,
  made_on: IsoDate,
  venue: Word.optional(),
  venue_label: LangMap.optional(),
  area: Text,
  status: Word,
  status_note: LangMap.optional(),
  origin: z.enum(ORIGINS).optional(),
  sources: z.array(Source).optional(),
  versions: z.array(Version).min(1, "needs at least one version: the promise as worded"),
  events: z.array(Event).min(1, 'needs at least one event: the "promised" event'),
  replies: z.array(Reply).optional(),
  corrections: z.array(Correction).optional(),
  reviews: z.array(Review).optional(),
  links: Links.optional(),
  x: z.record(z.string(), z.unknown()).optional(),
});
export type Card = z.infer<typeof Card>;

export const STANDINGS = ["in_power", "opposition", "public_body"] as const;
export type Standing = (typeof STANDINGS)[number];

export const Actor = z.strictObject({
  format: z.literal(FORMAT, { error: `should be "${FORMAT}": a v1 actor starts with "format: ${FORMAT}"` }),
  id: Slug,
  kind: Word,
  name: LangMap,
  short_name: LangMap.optional(),
  party_id: Slug.optional(),
  roles: z.array(z.strictObject({ title: LangMap, from: IsoDate.optional(), to: IsoDate.optional() })).optional(),
  standing: z.enum(STANDINGS).optional(),
  level: Text.optional(),
  seats: z.number().int().nonnegative().optional(),
  identifiers: z.record(Word, z.union([Text, z.number().int()])).optional(),
  same_as: z.array(Url).optional(),
  x: z.record(z.string(), z.unknown()).optional(),
});
export type Actor = z.infer<typeof Actor>;

export const Editor = z.strictObject({
  handle: z.string().regex(/^\S(?:.{0,38}\S)?$/, "should be a name or pen name of 1 to 40 characters, with no space at either end"),
  since: IsoDate,
  until: IsoDate.optional(),
  /** Declared party membership: the party's actor id, or null for none. */
  party: Slug.nullable(),
});
export type Editor = z.infer<typeof Editor>;

export const EditorsFile = z.strictObject({ editors: z.array(Editor) });
export type EditorsFile = z.infer<typeof EditorsFile>;
