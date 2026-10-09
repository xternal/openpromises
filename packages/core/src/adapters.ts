import { parseCorrectionPath } from "./history";
import { FORMAT } from "./schema";

/**
 * Converters from each site's current format to format v1 (docs/COMPARISON.md).
 * They read, never write: @openpromises/files runs them on read (migrate on
 * read) and `openpromises migrate` writes their output. They map fields and
 * nothing else: they never invent a value (a quality label, an approval, a
 * date). Fields format v1 has no place for go in `x`; unknown fields inside
 * versions, events and replies are passed through, so the v1 schema reports
 * them instead of losing them silently.
 */

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.map((x) => (isObj(x) ? x : ({ value: x } as Raw))) : []);

/** The object without its undefined fields, in the same order. */
function clean<T extends Raw>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Text in one language as a language map; null and undefined stay as they are. */
const inLang = (locale: string) => (v: unknown) => (typeof v === "string" ? { [locale]: v } : v);

/** Split an object into the listed fields and the rest. */
function split(o: Raw, known: readonly string[]): [Raw, Raw] {
  const rest: Raw = {};
  for (const [k, v] of Object.entries(o)) if (!known.includes(k)) rest[k] = v;
  return [o, rest];
}

const nonEmpty = (o: Raw) => (Object.keys(o).length ? o : undefined);

interface FieldMap {
  /** The field's tail in v1. */
  tail: string;
  /** How a value of the field changes. */
  value: (v: unknown) => unknown;
}

/** Map a correction to v1 with a site's field map. */
function mapCorrection(c: Raw, field: (list: string, tail: string) => FieldMap, reasonLocale: string): Raw {
  const p = typeof c.path === "string" ? parseCorrectionPath(c.path) : null;
  const base = { date: c.date, path: c.path, was: c.was ?? null, now: c.now ?? null, reason: inLang(reasonLocale)(c.reason), source_url: c.source_url };
  if (!p) return clean(base);
  const f = field(p.list, p.tail);
  return clean({ ...base, path: `${p.list}[${p.index}]${f.tail}`, was: f.value(c.was ?? null), now: f.value(c.now ?? null) });
}

const same = (tail: string): FieldMap => ({ tail, value: (v) => v });

// ---------------------------------------------------------------- Public Ledger

const PL_CARD = [
  "id",
  "headline",
  "actor_id",
  "made_on",
  "venue",
  "venue_label",
  "policy_area",
  "status",
  "status_note",
  "deadline",
  "lever_settings",
  "preset_label",
  "origin",
  "submission_ref",
  "credit",
  "editor_check_required",
  "sources",
  "versions",
  "events",
  "replies",
  "outcome_by",
  "corrections",
  "reviews",
  "contracts",
] as const;

function plParameters(p: unknown, en: (v: unknown) => unknown): unknown {
  if (!isObj(p)) return p;
  const { who, how_much_bn_per_year, cost_note, cost_sources, when, funded_by, ...rest } = p;
  const range = how_much_bn_per_year ?? undefined;
  const cost = range !== undefined || cost_note !== undefined || cost_sources !== undefined ? clean({ range, note: en(cost_note), sources: cost_sources }) : undefined;
  return clean({ who: en(who), cost, when: en(when), funded_by: en(funded_by), ...rest });
}

function plField(en: (v: unknown) => unknown) {
  return (list: string, tail: string): FieldMap => {
    if (list === "versions") {
      if (tail === ".parameters.how_much_bn_per_year") return same(".parameters.cost.range");
      if (tail === ".parameters.cost_note") return { tail: ".parameters.cost.note", value: en };
      if (tail === ".parameters.cost_sources") return same(".parameters.cost.sources");
      if ([".parameters.who", ".parameters.when", ".parameters.funded_by"].includes(tail)) return { tail, value: en };
      if (tail === ".parameters") return { tail, value: (v) => plParameters(v, en) };
    }
    if (list === "events" && tail === ".text") return { tail, value: en };
    if (list === "replies" && tail === ".editor_response") return { tail, value: en };
    return same(tail);
  };
}

/** A Public Ledger card (content/promises/<id>.yaml) in format v1. */
export function fromPublicLedger(raw: unknown, opts: { locale?: string } = {}): Raw {
  const locale = opts.locale ?? "en";
  const en = inLang(locale);
  if (!isObj(raw)) return { format: FORMAT };
  const [c, unknown] = split(raw, PL_CARD);
  const versions = arr(c.versions);
  const lastIndex = versions.length - 1;
  const x: Raw = {};
  const out = clean({
    format: FORMAT,
    id: c.id,
    headline: en(c.headline),
    actor_id: c.actor_id,
    made_on: c.made_on,
    venue: c.venue,
    venue_label: en(c.venue_label),
    area: c.policy_area,
    status: c.status,
    status_note: en(c.status_note),
    origin: c.origin,
    sources: c.sources,
    versions: versions.map((v, i) => {
      const { version, text, recorded_on, source_url, archived_url, quote_checked_on, parameters, ...rest } = v;
      let params = plParameters(parameters, en);
      if (i === lastIndex && c.deadline !== undefined) {
        if (isObj(params)) params = { ...params, deadline: c.deadline };
        else x.deadline = c.deadline;
      }
      return clean({ version, text, recorded_on, source_url, archived_url, quote_checked_on, parameters: params, ...rest });
    }),
    events: arr(c.events).map(({ date, type, text, evidence_url, auto, ...rest }) => clean({ date, type, text: en(text), evidence_url, auto, ...rest })),
    replies: Array.isArray(c.replies) ? arr(c.replies).map(({ editor_response, ...rest }) => clean({ ...rest, editor_response: en(editor_response) })) : undefined,
    corrections: Array.isArray(c.corrections) ? arr(c.corrections).map((x) => mapCorrection(x, plField(en), locale)) : undefined,
    reviews: Array.isArray(c.reviews) ? arr(c.reviews).map(({ note, ...rest }) => clean({ ...rest, note: en(note) })) : undefined,
    links: nonEmpty(
      clean({
        contracts: Array.isArray(c.contracts) && c.contracts.length ? c.contracts : undefined,
        lever: c.lever_settings !== undefined || c.preset_label !== undefined ? clean({ settings: c.lever_settings, label: en(c.preset_label) }) : undefined,
      }),
    ),
    x: undefined as Raw | undefined,
  });
  Object.assign(x, clean({ outcome_by: c.outcome_by, submission_ref: c.submission_ref, credit: c.credit, editor_check_required: c.editor_check_required }), unknown);
  if (Object.keys(x).length) out.x = x;
  return out;
}

const PL_STANDING: Record<string, string> = { government: "in_power", opposition: "opposition", public_body: "public_body" };

/** A Public Ledger actor (content/actors/<id>.yaml) in format v1. */
export function fromPublicLedgerActor(raw: unknown, opts: { locale?: string } = {}): Raw {
  const en = inLang(opts.locale ?? "en");
  if (!isObj(raw)) return { format: FORMAT };
  const { id, name, short_name, kind, standing, party_id, roles, parliament_member_id, parliament_party_id, same_as, ...rest } = raw;
  return clean({
    format: FORMAT,
    id,
    kind,
    name: en(name),
    short_name: en(short_name),
    party_id,
    roles: Array.isArray(roles) ? arr(roles).map(({ title, ...r }) => clean({ title: en(title), ...r })) : undefined,
    standing: typeof standing === "string" ? (PL_STANDING[standing] ?? standing) : standing,
    identifiers: nonEmpty(clean({ parliament_member_id, parliament_party_id })),
    same_as,
    x: nonEmpty(rest),
  });
}

// ---------------------------------------------------------------- Borough Book

export interface BoroughBookContext {
  /** content/parties.yaml `parties`. */
  parties?: unknown[];
  /** content/decision_links.yaml `links`. */
  decisionLinks?: unknown[];
}

const BB_CARD = [
  "id",
  "actor",
  "made_on",
  "venue",
  "area",
  "ward_id",
  "versions",
  "cost_m",
  "capital_cost_m",
  "funded_by",
  "status",
  "deadline",
  "lever_or_toggle_id",
  "events",
  "replies",
  "editor_check_required",
  "editor_note",
] as const;

/** A Borough Book card (content/promises/<id>.yaml) in format v1. Parties give archive copies of manifestos; decision links move into the card. */
export function fromBoroughBook(raw: unknown, ctx: BoroughBookContext = {}, opts: { locale?: string } = {}): Raw {
  const en = inLang(opts.locale ?? "en");
  if (!isObj(raw)) return { format: FORMAT };
  const [c, unknown] = split(raw, BB_CARD);
  const actor = isObj(c.actor) ? c.actor : {};
  const manifestos = arr(ctx.parties)
    .map((p) => p.manifesto)
    .filter(isObj);
  const archiveOf = (url: unknown) => manifestos.find((m) => m.url === url)?.archive_url ?? undefined;
  const cost = (v: unknown) => (isObj(v) ? clean({ range: v.range, quality: v.quality, note: en(v.note), ...split(v, ["range", "quality", "note"])[1] }) : v);
  const versions = arr(c.versions);
  const lastIndex = versions.length - 1;
  const decisions = arr(ctx.decisionLinks)
    .filter((l) => l.promise_id === c.id)
    .map(({ decision_id, event, quote, suggested_by, suggested_on }) => clean({ decision_id, event, quote, suggested_by, suggested_on }));
  const x = clean({
    actor_kind: actor.kind !== "party" && actor.kind !== "councillor" ? actor.kind : undefined,
    editor_check_required: c.editor_check_required,
    editor_note: c.editor_note,
    ...unknown,
  });
  return clean({
    format: FORMAT,
    id: c.id,
    actor_id: actor.id,
    made_on: c.made_on,
    venue: c.venue,
    area: c.area,
    status: c.status,
    versions: versions.map((v, i) => {
      const { text, recorded_on, source_url, page, archive_url, ...rest } = v;
      let parameters: unknown = {};
      if (i === lastIndex) {
        parameters =
          c.status === "unscoreable"
            ? null
            : clean({
                cost: c.cost_m === null ? undefined : cost(c.cost_m),
                capital_cost: cost(c.capital_cost_m),
                funded_by: en(c.funded_by),
                deadline: c.deadline,
              });
      }
      return clean({ version: i + 1, text, recorded_on, source_url, archived_url: archive_url ?? archiveOf(source_url), page, ...rest, parameters });
    }),
    events: arr(c.events).map(({ date, type, text, evidence_url, auto, ...rest }) => clean({ date, type, text: en(text), evidence_url, auto, ...rest })),
    replies: Array.isArray(c.replies) ? c.replies : undefined,
    links: nonEmpty(clean({ decisions: decisions.length ? decisions : undefined, lever: c.lever_or_toggle_id, ward: c.ward_id })),
    x: nonEmpty(x),
  });
}

/** A Borough Book party (an entry of content/parties.yaml) as a v1 actor, with the seats it holds. */
export function fromBoroughBookParty(raw: unknown, seats?: number, opts: { locale?: string } = {}): Raw {
  const en = inLang(opts.locale ?? "en");
  if (!isObj(raw)) return { format: FORMAT };
  const { id, name, short, manifesto, ...rest } = raw;
  return clean({ format: FORMAT, id, kind: "party", name: en(name), short_name: en(short), seats, x: nonEmpty(clean({ manifesto, ...rest })) });
}

/** A Borough Book councillor (content/councillors/<id>.yaml) as a v1 actor. */
export function fromBoroughBookCouncillor(raw: unknown, opts: { locale?: string } = {}): Raw {
  const en = inLang(opts.locale ?? "en");
  if (!isObj(raw)) return { format: FORMAT };
  const { id, name, party, roles, ...rest } = raw;
  return clean({
    format: FORMAT,
    id,
    kind: "person",
    name: en(name),
    party_id: party,
    roles: Array.isArray(roles) ? arr(roles).map(({ title, ...r }) => clean({ title: en(title), ...r })) : undefined,
    x: nonEmpty(rest),
  });
}

/** Seats per party, counted from Borough Book's councillor files. */
export function seatsFromCouncillors(councillors: readonly unknown[]): Record<string, number> {
  const seats: Record<string, number> = {};
  for (const c of councillors) if (isObj(c) && typeof c.party === "string") seats[c.party] = (seats[c.party] ?? 0) + 1;
  return seats;
}

// ---------------------------------------------------------------- Russia Ledger

const RL_CARD = [
  "id",
  "headline",
  "actor_id",
  "made_on",
  "venue",
  "venue_label",
  "area",
  "status",
  "status_note",
  "measurement",
  "lever_settings",
  "origin",
  "sources",
  "versions",
  "events",
  "replies",
  "corrections",
  "reviews",
] as const;

function rlSource(s: unknown): unknown {
  if (!isObj(s)) return s;
  const { designation_ru, ...rest } = s;
  return clean({ ...rest, designation: designation_ru });
}

function rlParameters(p: unknown): unknown {
  if (!isObj(p)) return p;
  const { who, how_much_bn_per_year, cost_note, cost_sources, when, deadline, funded_by, funding_verifiable, metric, ...rest } = p;
  const range = how_much_bn_per_year ?? undefined;
  const cost =
    range !== undefined || cost_note !== undefined || cost_sources !== undefined
      ? clean({ range, note: cost_note, sources: Array.isArray(cost_sources) ? cost_sources.map(rlSource) : cost_sources })
      : undefined;
  return clean({ who, cost, when, deadline, funded_by, funding_verifiable, metric, ...rest });
}

function rlField(list: string, tail: string): FieldMap {
  if (list === "versions") {
    if (tail === ".text_en") return same(".translations.en");
    if (tail === ".parameters.how_much_bn_per_year") return same(".parameters.cost.range");
    if (tail === ".parameters.cost_note") return same(".parameters.cost.note");
    if (tail === ".parameters.cost_sources") return { tail: ".parameters.cost.sources", value: (v) => (Array.isArray(v) ? v.map(rlSource) : v) };
    if (tail === ".parameters") return { tail, value: rlParameters };
  }
  if (list === "events" && tail.startsWith(".description")) return same(`.text${tail.slice(".description".length)}`);
  return same(tail);
}

/**
 * A card in the bilingual site's format, in format v1. Our text is already a
 * language map; the speaker's words are in `lang` (default "ru") with an
 * English translation. Correction reasons and review notes are one string
 * there, so they are filed under `locale` (default "ru").
 */
export function fromRussiaLedger(raw: unknown, opts: { locale?: string; quoteLang?: string } = {}): Raw {
  const locale = opts.locale ?? "ru";
  const quoteLang = opts.quoteLang ?? "ru";
  const one = inLang(locale);
  if (!isObj(raw)) return { format: FORMAT };
  const [c, unknown] = split(raw, RL_CARD);
  return clean({
    format: FORMAT,
    id: c.id,
    headline: c.headline,
    actor_id: c.actor_id,
    made_on: c.made_on,
    venue: c.venue,
    venue_label: c.venue_label,
    area: c.area,
    status: c.status,
    status_note: c.status_note,
    origin: c.origin,
    sources: Array.isArray(c.sources) ? c.sources.map(rlSource) : undefined,
    versions: arr(c.versions).map(({ version, text, text_en, recorded_on, source_url, archived_url, quote_checked_on, parameters, ...rest }) =>
      clean({
        version,
        text,
        lang: quoteLang,
        translations: typeof text_en === "string" ? { en: text_en } : undefined,
        recorded_on,
        source_url,
        archived_url,
        quote_checked_on,
        ...rest,
        parameters: rlParameters(parameters),
      }),
    ),
    events: arr(c.events).map(({ date, type, subtype, description, evidence_url, auto, ...rest }) => clean({ date, type, text: description, evidence_url, auto, subtype, ...rest })),
    replies: Array.isArray(c.replies) ? c.replies : undefined,
    corrections: Array.isArray(c.corrections) ? arr(c.corrections).map((x) => mapCorrection(x, rlField, locale)) : undefined,
    reviews: Array.isArray(c.reviews)
      ? arr(c.reviews).map(({ by, kind, on, note, batch, ...rest }) => clean({ by, kind, on, note: one(note), approves: kind === "editor" ? true : undefined, batch, ...rest }))
      : undefined,
    links: nonEmpty(clean({ measurement: c.measurement, lever: c.lever_settings !== undefined ? { settings: c.lever_settings } : undefined })),
    x: nonEmpty(unknown),
  });
}

/** An actor in the bilingual site's format, in format v1 (its names are already language maps). */
export function fromRussiaLedgerActor(raw: unknown): Raw {
  if (!isObj(raw)) return { format: FORMAT };
  const { id, name, short_name, kind, level, party_id, roles, same_as, ...rest } = raw;
  return clean({ format: FORMAT, id, kind, name, short_name, party_id, roles, level, same_as, x: nonEmpty(rest) });
}

// ---------------------------------------------------------------- by format name

/** What a legacy card may need besides itself: Borough Book's parties and decision links. */
export type LegacyContext = BoroughBookContext;

/** A card in a legacy format (config `legacy`), in format v1. */
export function migrateCard(format: "public-ledger" | "borough-book" | "russia-ledger", raw: unknown, ctx: LegacyContext = {}): Raw {
  switch (format) {
    case "public-ledger":
      return fromPublicLedger(raw);
    case "borough-book":
      return fromBoroughBook(raw, ctx);
    case "russia-ledger":
      return fromRussiaLedger(raw);
  }
}

/** An actor file in a legacy format, in format v1. Borough Book keeps its parties in one file instead (fromBoroughBookParty). */
export function migrateActor(format: "public-ledger" | "borough-book" | "russia-ledger", raw: unknown): Raw {
  switch (format) {
    case "public-ledger":
      return fromPublicLedgerActor(raw);
    case "borough-book":
      return fromBoroughBookCouncillor(raw);
    case "russia-ledger":
      return fromRussiaLedgerActor(raw);
  }
}
