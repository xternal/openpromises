import { categoryOf, statusLabel, type Actor, type Card, type Config, type LangMap, type ValidCard, type Version } from "@openpromises/core";
import { costText, longDate } from "./format";
import type { Words } from "./messages";

/**
 * A card joined with what it needs to be shown: its actor, the actor's party,
 * the current version and the role the speaker held that day. Pages, feeds,
 * Markdown and structured data are all built from these, so they always agree.
 */
export interface CardView {
  id: string;
  card: Card;
  where: "promises" | "drafts";
  actor: Actor;
  /** The party the card counts towards: the actor if it is a party, else the actor's party. */
  party: Actor | null;
  current: Version;
  /** The speaker's role on the day the promise was made. */
  role: LangMap | null;
}

/** Cards as views, newest promise first (ties by id, so the order never wobbles). Cards whose actor is missing are left out. */
export function cardViews(cards: readonly (ValidCard | Card)[], actors: ReadonlyMap<string, Actor>): CardView[] {
  const out: CardView[] = [];
  for (const c of cards) {
    const card = "card" in c ? c.card : c;
    const where = "card" in c ? c.where : "promises";
    const actor = actors.get(card.actor_id);
    if (!actor) continue;
    const party = actor.kind === "party" ? actor : actor.party_id ? (actors.get(actor.party_id) ?? null) : null;
    const role = actor.roles?.find((r) => (!r.from || r.from <= card.made_on) && (!r.to || r.to >= card.made_on))?.title ?? null;
    out.push({ id: card.id, card, where, actor, party, current: card.versions.at(-1)!, role });
  }
  return out.sort((a, b) => b.card.made_on.localeCompare(a.card.made_on) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Text from a language map in a language, falling back to the site's default language, then any. */
export function pick(map: LangMap | null | undefined, locale: string, config: Pick<Config, "locales">): string | undefined {
  if (!map) return undefined;
  return map[locale] ?? map[config.locales.default] ?? Object.values(map)[0];
}

const base = (l: string) => l.toLowerCase().split("-")[0]!;

export interface QuoteIn {
  /** What to show: the words as said, or our translation of them. */
  text: string;
  lang: string;
  translated: boolean;
  /** The words as said, and their language. */
  original: string;
  originalLang: string;
}

/** A version's words for a reader: as said when they read that language, else our translation into theirs (marked as such). */
export function quoteIn(v: Version, locale: string, config: Pick<Config, "locales">): QuoteIn {
  const originalLang = v.lang ?? config.locales.default;
  const original = v.text;
  if (base(originalLang) === base(locale)) return { text: original, lang: originalLang, translated: false, original, originalLang };
  const t = v.translations?.[locale];
  return t ? { text: t, lang: locale, translated: true, original, originalLang } : { text: original, lang: originalLang, translated: false, original, originalLang };
}

/** Cut text to at most `max` characters at a word boundary, with "…" when cut. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const atWord = cut.replace(/\s+\S*$/, "");
  return `${(atWord.length >= max / 2 ? atWord : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

/** Cut text to at most `max` characters, with "…" when cut (feed titles). */
export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

const FALLBACK_HEADLINE = 60;

/** The card's headline, or its quote cut at a word boundary until an editor writes one. */
export const headline = (v: CardView, locale: string, config: Pick<Config, "locales">) =>
  pick(v.card.headline, locale, config) ?? clip(quoteIn(v.current, locale, config).text, FALLBACK_HEADLINE);

export const actorName = (a: Actor, locale: string, config: Pick<Config, "locales">) => pick(a.name, locale, config) ?? a.id;
export const actorShortName = (a: Actor, locale: string, config: Pick<Config, "locales">) => pick(a.short_name, locale, config) ?? actorName(a, locale, config);

/** A URL slug from text: "Care for older & disabled adults" → "care-for-older-and-disabled-adults". Letters in other scripts are kept. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

/** An area's label in a language: from the configuration, or the area itself (free-text areas are their own label). */
export function areaLabel(config: Pick<Config, "areas" | "locales">, area: string, locale: string): string {
  const labels = config.areas.kind === "text" ? undefined : config.areas.labels?.[area];
  return pick(labels, locale, config) ?? area;
}

/** An area's URL slug: the configured one, or the area made into a slug. Slugs are URLs: never change one once published. */
export function areaSlug(config: Pick<Config, "areas">, area: string): string {
  return (config.areas.kind === "text" ? undefined : config.areas.slugs?.[area]) ?? slugify(area);
}

/** The label of a timeline event: a status's label, or the event's own (a moved deadline says so). */
export function eventLabel(config: Config, w: Words, type: string, subtype?: string): string {
  if (subtype === "deadline_moved") return w.t("event.deadline_moved");
  if (categoryOf(config, type)) return statusLabel(config, type, w.locale);
  return w.t(`event.${type}`);
}

/**
 * The last day a card changed: its newest version, event, correction or
 * review up to today. Future dates (a deadline marker) are not changes. The
 * same date is the page's "Last updated", its dateModified and the sitemap's lastmod.
 */
export function lastUpdated(card: Card, today: string): string | undefined {
  return [...card.events.map((e) => e.date), ...card.versions.map((v) => v.recorded_on), ...(card.corrections ?? []).map((c) => c.date), ...(card.reviews ?? []).map((r) => r.on)]
    .filter((d) => d <= today)
    .sort()
    .at(-1);
}

/** Who a card counts towards: the speaker's party, or the speaker when it is a party or has none. */
export const ownerOf = (v: Pick<CardView, "actor" | "party">) => v.party ?? v.actor;

/**
 * Up to `max` other cards to read next: first those in the same area, then
 * those by the same party (or speaker). Keeps the order of `all`.
 */
export function relatedCards<V extends CardView>(v: V, all: readonly V[], max = 3): V[] {
  const others = all.filter((c) => c.id !== v.id && c.where === "promises");
  const sameArea = others.filter((c) => c.card.area === v.card.area);
  const sameOwner = others.filter((c) => c.card.area !== v.card.area && ownerOf(c).id === ownerOf(v).id);
  return [...sameArea, ...sameOwner].slice(0, max);
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

/** The finished statuses that are not the top of the ladder: not met, undone. */
export const endings = (config: Config) => config.ladder.statuses.filter((s) => s.category === "finished" && !climb(config).includes(s.id)).map((s) => s.id);

/** An indicator target in words: "At least 100 schools by 31 December 2028". */
export function metricText(metric: { target: number; direction: "at_least" | "at_most" | "below"; unit: string; by: string }, w: Words): string {
  return w.t(`metric.${metric.direction}`, { target: new Intl.NumberFormat(w.m.intl).format(metric.target), unit: metric.unit, date: longDate(w, metric.by) });
}

/** How many cards are at each status, in ladder order, leaving out the empty ones. */
export function statusCounts(views: readonly Pick<CardView, "card">[], config: Config): { status: string; count: number }[] {
  return config.ladder.statuses.map((s) => ({ status: s.id, count: views.filter((v) => v.card.status === s.id).length })).filter((x) => x.count > 0);
}

/** "3 delivered, 1 legislated, 4 promised" */
export const statusMix = (views: readonly Pick<CardView, "card">[], config: Config, w: Words) =>
  statusCounts(views, config)
    .map((x) => `${x.count} ${statusLabel(config, x.status, w.locale).toLowerCase()}`)
    .join(", ");

/** Titles stay under about 70 characters, what search results show; past this the site name is dropped. */
export const TITLE_MAX = 75;
/** Search results show about this many characters of a description. */
export const DESCRIPTION_MAX = 160;

/**
 * "Cap bus fares at £2 – Andy Burnham promise, In plan | Public Ledger". The
 * site name is dropped when it would push the title past TITLE_MAX; who made
 * the promise and where it stands never are. `social` has no site name.
 */
export function cardTitle(v: CardView, config: Config, w: Words): { title: string; social: string } {
  const social = w.t("title.card", { headline: headline(v, w.locale, config), who: actorShortName(v.actor, w.locale, config), status: statusLabel(config, v.card.status, w.locale) });
  const branded = `${social} | ${config.site.name}`;
  return { title: branded.length <= TITLE_MAX ? branded : social, social };
}

/** The cost of the current version, as the card shows it. */
export const cardCostText = (v: CardView, config: Config, w: Words) => costText(w, config, v.current.parameters?.cost, { costable: v.current.parameters !== null });

/** How the promise is paid for, as stated when it was made; null when the card has no parameters. */
export function cardFundingText(v: CardView, config: Config, w: Words): string | null {
  const p = v.current.parameters;
  if (p === null) return null;
  const said = pick(p.funded_by, w.locale, config);
  return said ? w.t("funding.paid_for_by", { text: said.replace(/\s+/g, " ").trim() }) : w.t("funding.not_stated");
}

const endSentence = (s: string) => (/[.…!?]$/.test(s) ? s : `${s}.`);

/**
 * The meta description, facts first and at most DESCRIPTION_MAX characters:
 * status, cost, who pays, who promised it and when; then as much of the quote
 * as fits.
 */
export function cardDescription(v: CardView, config: Config, w: Words): string {
  const head = `${statusLabel(config, v.card.status, w.locale)}. ${endSentence(cardCostText(v, config, w))}`;
  const tail = w.t("description.promised_by", { who: actorName(v.actor, w.locale, config), date: longDate(w, v.card.made_on) });
  const pay = cardFundingText(v, config, w);
  const room = DESCRIPTION_MAX - head.length - tail.length - 2;
  let text = [head, ...(pay && room >= 20 ? [endSentence(clip(pay, room - 1))] : []), tail].join(" ");
  const left = DESCRIPTION_MAX - text.length - 3;
  if (left >= 24) text += ` ${w.q(clip(quoteIn(v.current, w.locale, config).text, left))}`;
  return text;
}
