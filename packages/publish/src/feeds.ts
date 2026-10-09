import { same, statusLabel, type Actor, type Config } from "@openpromises/core";
import { costText, longDate, lowerFirst } from "./format";
import type { Words } from "./messages";
import { absolute, paths, type FeedFormat, type FeedKind } from "./urls";
import { actorName, areaLabel, eventLabel, headline, pick, quoteIn, truncate, type CardView } from "./view";

/**
 * Feeds (Atom 1.0, RFC 4287, and RSS 2.0), built from cards: one entry per
 * timeline event, per rewording (version 2 onwards), per reply and per change
 * to the current cost, plus any entries the site adds of its own. Entry
 * ids are tag URIs (RFC 4151) that depend only on the card id and the entry's
 * place in its append-only history, so they never change: a feed reader never
 * shows an entry twice. Ported from Public Ledger's feeds, whose ids they keep.
 */

export interface FeedEntry {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  link: string;
  content: string;
  category?: { term: string; label: string };
}

/** An entry the site makes itself (a contract linked, a new edition of its figures), placed in the feeds of the card it belongs to, or only in the feed of everything. */
export interface SiteEntry extends FeedEntry {
  /** The card it belongs to; without one it goes only in the feed of everything. */
  card?: string;
  /** Its language; the site's default when left out. */
  locale?: string;
}

export interface FeedMeta {
  id: string;
  title: string;
  subtitle?: string;
  /** The feed's own address. */
  self: string;
  /** The page the feed follows. */
  page: string;
  /** Used when there are no entries, so an empty feed is still stable. */
  fallbackDate: string;
}

/** At most this many entries in a feed, newest first. */
export const FEED_LIMIT = 200;

// XML 1.0 allows tab, newline, carriage return and these ranges; anything else is dropped.
const INVALID_XML = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

export function xmlEscape(s: string): string {
  return s.replace(INVALID_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** "tag:ledgergov.uk,2026:promise/uk-bus-cap-2-2026/event/1"; entries in another language end "#en". */
export function tagUri(config: Config, path: string, locale = config.locales.default): string {
  if (!config.publish.tag)
    throw new Error('publish.tag is needed for feeds: the fixed start of every entry id, such as "example.org,2026". Set it once and never change it, or every reader sees every entry again.');
  return `tag:${config.publish.tag}:${path}${locale === config.locales.default ? "" : `#${locale}`}`;
}

export interface EntryContext {
  config: Config;
  w: Words;
  /** Leave out entries dated after this day (YYYY-MM-DD). */
  today: string;
  /** An actor's name, for replies from someone other than the card's actor. */
  actorName?: (id: string) => string | undefined;
  /** Every actor, so a feed for an actor with no cards yet still has its name. */
  actors?: ReadonlyMap<string, Actor>;
  /** The site's own entries (SiteEntry), added to the feeds of the cards they belong to. */
  siteEntries?: readonly SiteEntry[];
}

const COST_CORRECTION = /^versions\[(\d+)\]\.parameters\.cost\.range$/;

/**
 * Changes to a card's current cost: one entry per correction of a version's
 * cost made while that version was the current one, and one per new version
 * whose cost differs from the one before. Their ids, like every entry's,
 * depend only on the entry's place in the card's history.
 */
function costEntries(v: CardView, ctx: EntryContext, base: { link: string; category: FeedEntry["category"]; who: string; quote: string; statusLine: string }): FeedEntry[] {
  const { config, w, today } = ctx;
  const f = v.card;
  const range = (r: unknown) => (Array.isArray(r) && r.length === 3 ? (r as [number, number, number]) : null);
  const text = (r: unknown) => lowerFirst(range(r) ? costText(w, config, { range: range(r)! }) : w.t("cost.not_stated"));
  const maker = (k: number, figure: unknown) => {
    const cost = f.versions[k]?.parameters?.cost;
    return cost?.by && same(cost.range, figure) ? w.t("feed.cost_by", { name: cost.by.name, kind: w.t(`cost.by.${cost.by.kind}`) }) : null;
  };
  const entry = (id: string, date: string, now: unknown, was: unknown, lines: (string | null)[]): FeedEntry => ({
    id: tagUri(config, `promise/${v.id}/cost/${id}`, w.locale),
    title: w.t("feed.cost_title", { now: text(now), was: text(was), who: base.who }),
    date,
    link: base.link,
    category: base.category,
    content: [w.t("feed.cost_line", { date: longDate(w, date), now: text(now), was: text(was) }), ...lines, "", base.quote, base.statusLine].filter((x) => x !== null).join("\n"),
  });
  const out: FeedEntry[] = [];
  (f.corrections ?? []).forEach((c, i) => {
    const m = COST_CORRECTION.exec(c.path);
    if (!m || c.date > today || same(c.was, c.now)) return;
    const k = Number(m[1]);
    const next = f.versions[k + 1];
    if (next && next.recorded_on <= c.date) return; // that version was no longer the current one
    const why = pick(c.reason, w.locale, config);
    out.push(entry(`correction/${i}`, c.date, c.now, c.was, [maker(k, c.now), why ? w.t("feed.why", { reason: why }) : null, c.source_url ? w.t("feed.source", { url: c.source_url }) : null]));
  });
  f.versions.forEach((ver, k) => {
    if (k === 0 || ver.recorded_on > today) return;
    const was = f.versions[k - 1]!.parameters?.cost?.range ?? null;
    const now = ver.parameters?.cost?.range ?? null;
    if (same(was, now)) return;
    out.push(entry(`version/${ver.version}`, ver.recorded_on, now, was, [maker(k, now), w.t("feed.cost_reworded", { n: ver.version, url: ver.source_url })]));
  });
  return out;
}

/** Every dated entry of one card, oldest first. Deadline markers are not changes, so they are left out. */
export function cardEntries(v: CardView, ctx: EntryContext): FeedEntry[] {
  const { config, w, today } = ctx;
  const locale = w.locale;
  const link = absolute(config, paths(config).card(v.id, locale));
  const f = v.card;
  const who = actorName(v.actor, locale, config);
  const words = quoteIn(v.current, locale, config).text;
  const quote = w.t("feed.quote", { who, date: longDate(w, f.made_on), quote: w.q(words) });
  const category = { term: f.area, label: areaLabel(config, f.area, locale) };
  const statusLine = w.t("feed.status_now", { status: statusLabel(config, f.status, locale) });
  const out: FeedEntry[] = [];

  f.events.forEach((e, i) => {
    if (e.type === "deadline" || e.date > today) return;
    const label = eventLabel(config, w, e.type, e.subtype);
    const text = pick(e.text, locale, config) ?? "";
    out.push({
      id: tagUri(config, `promise/${v.id}/event/${i}`, locale),
      title: w.t("feed.event_title", { label, text: truncate(text, 140), who }),
      date: e.date,
      link,
      category,
      content: [w.t("feed.event_line", { label, date: longDate(w, e.date), text }), e.evidence_url ? w.t("feed.evidence", { url: e.evidence_url }) : null, "", quote, statusLine]
        .filter((x) => x !== null)
        .join("\n"),
    });
  });

  f.versions.forEach((ver, i) => {
    if (i === 0 || ver.recorded_on > today) return;
    const prev = quoteIn(f.versions[i - 1]!, locale, config).text;
    const now = quoteIn(ver, locale, config).text;
    out.push({
      id: tagUri(config, `promise/${v.id}/version/${ver.version}`, locale),
      title: w.t("feed.reworded_title", { quote: w.q(truncate(now, 120)), who }),
      date: ver.recorded_on,
      link,
      category,
      content: [w.t("feed.reworded", { date: longDate(w, ver.recorded_on) }), w.t("feed.was", { quote: w.q(prev) }), w.t("feed.now", { quote: w.q(now) }), w.t("feed.source", { url: ver.source_url }), "", statusLine].join("\n"),
    });
  });

  (f.replies ?? []).forEach((r, i) => {
    if (r.date > today) return;
    const from = r.from_actor_id ? (ctx.actorName?.(r.from_actor_id) ?? (r.from_actor_id === v.actor.id ? who : r.from_actor_id)) : (r.from ?? "");
    const response = pick(r.editor_response, locale, config);
    out.push({
      id: tagUri(config, `promise/${v.id}/reply/${i}`, locale),
      title: w.t("feed.reply_title", { who: from, text: truncate(words, 80) }),
      date: r.date,
      link,
      category,
      content: [w.t("feed.reply_from", { who: from, date: longDate(w, r.date) }), r.text, response ? `\n${w.t("feed.editors_response", { text: response })}` : null, "", quote]
        .filter((x) => x !== null)
        .join("\n"),
    });
  });
  out.push(...costEntries(v, ctx, { link, category, who, quote, statusLine }));
  return out;
}

/** Entries from many cards, newest first (ties by id, so the order is stable). */
export function newestFirst(entries: FeedEntry[], limit = FEED_LIMIT): FeedEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0)).slice(0, limit);
}

const stamp = (date: string) => `${date}T00:00:00Z`;

/** An Atom 1.0 document. */
export function atomFeed(meta: FeedMeta, entries: readonly FeedEntry[], config: Config, w: Words): string {
  const x = xmlEscape;
  const updated = stamp(entries.reduce((max, e) => (e.date > max ? e.date : max), "") || meta.fallbackDate);
  const lines = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${x(w.m.intl ?? w.locale)}">`,
    `  <id>${x(meta.id)}</id>`,
    `  <title type="text">${x(meta.title)}</title>`,
    meta.subtitle ? `  <subtitle type="text">${x(meta.subtitle)}</subtitle>` : null,
    `  <link rel="self" type="application/atom+xml" href="${x(meta.self)}"/>`,
    `  <link rel="alternate" type="text/html" href="${x(meta.page)}"/>`,
    `  <updated>${x(updated)}</updated>`,
    `  <author><name>${x(config.site.name)}</name><uri>${x(absolute(config, "/"))}</uri></author>`,
    ...entries.map((e) =>
      [
        `  <entry>`,
        `    <id>${x(e.id)}</id>`,
        `    <title type="text">${x(e.title)}</title>`,
        `    <link rel="alternate" type="text/html" href="${x(e.link)}"/>`,
        `    <updated>${x(stamp(e.date))}</updated>`,
        e.category ? `    <category term="${x(e.category.term)}" label="${x(e.category.label)}"/>` : null,
        `    <content type="text">${x(e.content)}</content>`,
        `  </entry>`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    ),
    `</feed>`,
  ];
  return `${lines.filter((l) => l !== null).join("\n")}\n`;
}

/** RFC 822, as RSS asks: midday UTC, so the day is the same in every time zone. */
export const rfc822 = (date: string) => new Date(`${date}T12:00:00Z`).toUTCString();

/** An RSS 2.0 document. */
export function rssFeed(meta: FeedMeta, entries: readonly FeedEntry[], config: Config, w: Words): string {
  const x = xmlEscape;
  const built = entries.reduce((max, e) => (e.date > max ? e.date : max), "") || meta.fallbackDate;
  const items = entries.map((e) =>
    [
      `    <item>`,
      `      <title>${x(e.title)}</title>`,
      `      <link>${x(e.link)}</link>`,
      `      <guid isPermaLink="false">${x(e.id)}</guid>`,
      `      <pubDate>${rfc822(e.date)}</pubDate>`,
      e.category ? `      <category>${x(e.category.label)}</category>` : null,
      `      <description>${x(e.content)}</description>`,
      `    </item>`,
    ]
      .filter((l) => l !== null)
      .join("\n"),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `  <channel>`,
    `    <title>${x(meta.title)}</title>`,
    `    <link>${x(meta.page)}</link>`,
    `    <atom:link href="${x(meta.self)}" rel="self" type="application/rss+xml"/>`,
    `    <description>${x(meta.subtitle ?? meta.title)}</description>`,
    `    <language>${x((w.m.intl ?? w.locale).toLowerCase())}</language>`,
    `    <generator>OpenPromises</generator>`,
    `    <lastBuildDate>${rfc822(built)}</lastBuildDate>`,
    ...items,
    `  </channel>`,
    `</rss>`,
    "",
  ].join("\n");
}

export const FEED_TYPES: Record<FeedFormat, string> = {
  atom: "application/atom+xml; charset=utf-8",
  rss: "application/rss+xml; charset=utf-8",
};

/** The published cards a feed covers. An actor's feed of a party includes its people's cards. */
export function cardsFor(views: readonly CardView[], kind: FeedKind, key: string): CardView[] {
  const published = views.filter((v) => v.where === "promises");
  switch (kind) {
    case "all":
      return published;
    case "promise":
      return published.filter((v) => v.id === key);
    case "actor":
      return published.filter((v) => v.actor.id === key || v.party?.id === key);
    case "area":
      return published.filter((v) => v.card.area === key);
    case "ward":
      return published.filter((v) => v.card.links?.ward === key);
  }
}

export interface FeedFile {
  path: string;
  kind: FeedKind;
  key: string;
  locale: string;
  format: FeedFormat;
  contentType: string;
  body: string;
}

/** One feed document: the cards of one kind and key, in one language and format. */
export function buildFeed(views: readonly CardView[], kind: FeedKind, key: string, ctx: EntryContext, format: FeedFormat): FeedFile {
  const { config, w } = ctx;
  const p = paths(config);
  const selected = cardsFor(views, kind, key);
  const site = config.site.name;
  const actor = views.find((v) => v.actor.id === key)?.actor ?? views.find((v) => v.party?.id === key)?.party ?? ctx.actors?.get(key) ?? null;
  const who = actor ? actorName(actor, w.locale, config) : (ctx.actorName?.(key) ?? key);
  const title =
    kind === "all"
      ? w.t("feed.all", { site })
      : kind === "promise"
        ? w.t("feed.card", { site, headline: selected[0] ? headline(selected[0], w.locale, config) : key })
        : kind === "actor"
          ? w.t("feed.actor", { site, who })
          : kind === "area"
            ? w.t("feed.area", { site, area: areaLabel(config, key, w.locale) })
            : w.t("feed.ward", { site, ward: key });
  const pagePath = kind === "all" ? p.promises(w.locale) : kind === "promise" ? p.card(key, w.locale) : kind === "actor" ? p.actor(key, w.locale) : kind === "area" ? p.area(key, w.locale) : p.promises(w.locale);
  const path = p.feed(kind, key, w.locale, format);
  const meta: FeedMeta = {
    id: tagUri(config, kind === "all" ? "feed/all" : `feed/${kind}/${key}`, w.locale),
    title,
    subtitle:
      kind === "all"
        ? w.t("feed.sub.all")
        : kind === "promise"
          ? w.t("feed.sub.card")
          : kind === "actor"
            ? w.t(actor?.kind === "party" ? "feed.sub.party" : "feed.sub.actor", { who })
            : kind === "area"
              ? w.t("feed.sub.area", { area: lowerFirst(areaLabel(config, key, w.locale)) })
              : w.t("feed.sub.ward", { ward: key }),
    self: absolute(config, path),
    page: absolute(config, pagePath),
    fallbackDate: selected.map((v) => v.card.made_on).sort().at(-1) ?? "2026-01-01",
  };
  const ids = new Set(selected.map((v) => v.id));
  const own = (ctx.siteEntries ?? []).filter((e) => (e.locale ?? config.locales.default) === w.locale && e.date <= ctx.today && (e.card ? ids.has(e.card) : kind === "all"));
  const entries = newestFirst([...selected.flatMap((v) => cardEntries(v, ctx)), ...own]);
  const body = format === "atom" ? atomFeed(meta, entries, config, w) : rssFeed(meta, entries, config, w);
  return { path, kind, key, locale: w.locale, format, contentType: FEED_TYPES[format], body };
}
