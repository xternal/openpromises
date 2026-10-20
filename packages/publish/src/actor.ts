import { deadlineOf, isOpen, type Config } from "@openpromises/core";
import { lowerFirst } from "./format";
import { words } from "./messages";
import { spotlight } from "./spotlight";
import { actorName, eventLabel, headline, listOf, pick, type CardView } from "./view";

/**
 * What an actor's page needs to read as a whole (decision 34): every dated
 * thing on their promises in one timeline, the promises to look at first,
 * and how many they made each month. Built only from the published cards,
 * by the same rules for every actor (principle 5); nothing is chosen by hand.
 */

/** Whole days from one day to another (YYYY-MM-DD): 0 on the day itself, negative once it has passed. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

const published = (views: readonly CardView[]) => views.filter((v) => v.where === "promises");
const byId = (a: CardView, b: CardView) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const newestFirst = (a: CardView, b: CardView) => b.card.made_on.localeCompare(a.card.made_on) || byId(a, b);

/** What changed last on a promise, and when. */
export interface Change {
  /** YYYY-MM-DD: the same day as lastChanged(). */
  date: string;
  /**
   * An event's type (a status id, "reworded", "restated", "deadline",
   * "deadline_missed"), "reply", or, for the words first recorded,
   * "promised" when they were recorded the day they were said and
   * "recorded" when later.
   */
  type: string;
  /** "deadline_moved" on a rewording that moves the deadline. */
  subtype?: string;
}

/**
 * The latest change to a promise up to today: its day is lastChanged()'s.
 * Of several changes that day, an event that moves the promise wins over a
 * rewording, a rewording over a reply, a reply over a deadline marker, and a
 * marker over the words first recorded; of two events, the later recorded.
 */
export function lastChange(v: Pick<CardView, "card">, today: string): Change | undefined {
  const c = v.card;
  const first = c.versions[0];
  const all: (Change & { weight: number })[] = [
    ...(first ? [{ date: first.recorded_on, type: first.recorded_on === c.made_on ? "promised" : "recorded", weight: 0 }] : []),
    ...c.versions.slice(1).map((x) => ({ date: x.recorded_on, type: "reworded", weight: 3 })),
    ...(c.replies ?? []).map((r) => ({ date: r.date, type: "reply", weight: 2 })),
    ...c.events.map((e) => ({ date: e.date, type: e.type, ...(e.subtype ? { subtype: e.subtype } : {}), weight: e.type === "promised" ? 0 : e.type === "deadline" ? 1 : 4 })),
  ];
  const last = all
    .filter((x) => x.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.weight - b.weight)
    .at(-1);
  if (!last) return undefined;
  const { weight: _, ...change } = last;
  return change;
}

export interface KeyPromises {
  /** Open promises due next, nearest first, with the days left (0 on the day). */
  due: { view: CardView; deadline: string; days: number }[];
  /** The latest changes, newest first, with what changed and when. */
  recent: { view: CardView; change?: Change }[];
}

/**
 * The promises to look at first on an actor's page: the home page's rule
 * (spotlight(), decision 30) over that actor's views, so the same cards are
 * chosen however the page is reached, with the days left to each deadline
 * and what changed last. Pass one actor's views (a party's with its people's).
 */
export function keyPromises(views: readonly CardView[], config: Config, today: string, opts: { recent?: number; due?: number } = {}): KeyPromises {
  const s = spotlight(views, config, today, opts);
  return {
    due: s.due.map((view) => {
      const deadline = deadlineOf(view.card)!;
      return { view, deadline, days: daysBetween(today, deadline) };
    }),
    recent: s.recent.map((view) => {
      const change = lastChange(view, today);
      return change ? { view, change } : { view };
    }),
  };
}

/** One promise on a day of the timeline. */
export interface TimelineCard {
  view: CardView;
  /** What the card records about that day, in the reader's language: an event's text, a reply, a deadline marker's words. */
  texts: string[];
  /** Evidence and sources for that day's events, as the card links them. */
  links: string[];
}

/** What happened on a day, the same for every card in it. */
export interface TimelineEntry {
  /** "Promised, Prime Minister's Questions", "In plan", "Promised and in plan", "Deadline", "Deadline passed", "Reply from …" */
  label: string;
  /** What happened, in the order it is told: words first, then the ladder, then deadlines, then replies. The last is the furthest the cards got that day. */
  types: string[];
  /** Ordered by headline, as the reader's language sorts them. */
  cards: TimelineCard[];
}

export interface TimelineDay {
  /** YYYY-MM-DD */
  date: string;
  /** Days from today: negative before it, 0 on it, positive after. */
  days: number;
  entries: TimelineEntry[];
}

export interface ActorTimeline {
  today: string;
  /** Deadlines still to come, from today on, latest first: time runs upwards, so they sit above today. */
  toCome: TimelineDay[];
  /** What was promised and what has happened since, up to today, newest first. */
  past: TimelineDay[];
  /** Open promises that name no deadline, newest promise first: they never appear above today. */
  undated: CardView[];
}

interface Mark {
  date: string;
  view: CardView;
  type: string;
  subtype?: string;
  label: string;
  text?: string;
  link?: string;
  venue?: string;
}

/** The order things are told in a day: the words, the ladder in its order, then deadlines, then what was said back. */
function rank(config: Config, type: string): number {
  if (type === "promised") return 0;
  if (type === "reworded") return 1;
  if (type === "restated") return 2;
  const step = config.ladder.statuses.findIndex((s) => s.id === type);
  if (step >= 0) return 10 + step;
  if (type === "deadline_missed") return 100;
  if (type === "deadline") return 101;
  if (type === "reply") return 102;
  return 103;
}

/**
 * Everything dated on an actor's published promises (decision 34), grouped
 * by day, each entry linking to its cards: when each was promised (and
 * where), rewordings and restatements, every step on the ladder and every
 * ending (not met, undone), replies, and the deadline of each open promise
 * still to come. A deadline that has passed shows as its outcome: the event
 * that ended or moved the promise, the "Deadline passed" the deadline job
 * recorded or, while the card is open and nothing is recorded yet, "Deadline
 * passed" on the day. Deadlines come from each card's current version
 * (deadlineOf()), as on the card; a finished promise's deadline is not shown.
 * Pass one actor's views (a party's with its people's); the rule is the same
 * for every actor.
 */
export function actorTimeline(views: readonly CardView[], config: Config, today: string, locale: string = config.locales.default): ActorTimeline {
  const w = words(config, locale);
  const intl = w.m.intl;
  const marks: Mark[] = [];
  const cards = published(views);
  for (const v of cards) {
    const c = v.card;
    const venue = pick(c.venue_label, locale, config);
    marks.push({ date: c.made_on, view: v, type: "promised", label: w.t("event.promised"), ...(venue ? { venue } : {}) });
    for (const e of c.events) {
      if (e.type === "promised" || e.type === "deadline") continue; // the words stand for the first; deadlines come from the current version
      const text = pick(e.text, locale, config);
      marks.push({ date: e.date, view: v, type: e.type, ...(e.subtype ? { subtype: e.subtype } : {}), label: eventLabel(config, w, e.type, e.subtype), ...(text ? { text } : {}), ...(e.evidence_url ? { link: e.evidence_url } : {}) });
    }
    for (const r of c.replies ?? []) {
      const who = r.from_actor_id === v.actor.id ? actorName(v.actor, locale, config) : (r.from ?? r.from_actor_id ?? "");
      marks.push({ date: r.date, view: v, type: "reply", label: w.t("story.reply", { who }), text: w.q(r.text), ...(r.url ? { link: r.url } : {}) });
    }
    const deadline = deadlineOf(c);
    if (!deadline || !isOpen(c, config)) continue;
    if (deadline >= today) {
      const marker = c.events.find((e) => e.type === "deadline" && e.date === deadline);
      const text = marker ? pick(marker.text, locale, config) : undefined;
      marks.push({ date: deadline, view: v, type: "deadline", label: eventLabel(config, w, "deadline"), ...(text ? { text } : {}) });
    } else if (!c.events.some((e) => e.type === "deadline_missed" && e.date >= deadline)) {
      marks.push({ date: deadline, view: v, type: "deadline_missed", label: eventLabel(config, w, "deadline_missed") });
    }
  }

  const days = (list: Mark[]): TimelineDay[] => {
    const byDay = new Map<string, Map<string, Mark[]>>();
    for (const m of list) {
      const day = byDay.get(m.date) ?? new Map<string, Mark[]>();
      day.set(m.view.id, [...(day.get(m.view.id) ?? []), m]);
      byDay.set(m.date, day);
    }
    return [...byDay]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, perCard]) => {
        const entries = new Map<string, TimelineEntry & { top: number }>();
        for (const ms of perCard.values()) {
          const sorted = [...ms].sort((a, b) => rank(config, a.type) - rank(config, b.type));
          const labels = [...new Set(sorted.map((m) => m.label))];
          const only = sorted.length === 1 ? sorted[0]! : undefined;
          const label = only?.venue ? w.t("timeline.at", { label: only.label, venue: only.venue }) : listOf(w, labels.map((l, i) => (i ? lowerFirst(l) : l)));
          const entry = entries.get(label) ?? { label, types: [...new Set(sorted.map((m) => m.type))], cards: [], top: rank(config, sorted.at(-1)!.type) };
          entry.cards.push({ view: sorted[0]!.view, texts: [...new Set(sorted.flatMap((m) => (m.text ? [m.text] : [])))], links: [...new Set(sorted.flatMap((m) => (m.link ? [m.link] : [])))] });
          entries.set(label, entry);
        }
        return {
          date,
          days: daysBetween(today, date),
          entries: [...entries.values()]
            .sort((a, b) => b.top - a.top || a.label.localeCompare(b.label, intl))
            .map(({ top: _, ...e }) => ({ ...e, cards: e.cards.sort((a, b) => headline(a.view, locale, config).localeCompare(headline(b.view, locale, config), intl) || byId(a.view, b.view)) })),
        };
      });
  };

  const ahead = (m: Mark) => m.type === "deadline" || m.date > today;
  return {
    today,
    toCome: days(marks.filter(ahead)),
    past: days(marks.filter((m) => !ahead(m))),
    undated: cards.filter((v) => isOpen(v.card, config) && !deadlineOf(v.card)).sort(newestFirst),
  };
}

export interface MonthCount {
  /** YYYY-MM */
  month: string;
  /** Promises made that month (by the day they were made, not recorded). */
  count: number;
  /** The month today is in, still running: its count is so far. */
  soFar: boolean;
}

/**
 * How many published promises were made each calendar month, from the month
 * of the first to today's, empty months included, so a quiet month shows as
 * plainly as a busy one (decision 34). The same for every actor; pass one
 * actor's views for their page. `config` keeps the call alike to the other
 * functions for an actor's page.
 */
export function promisesByMonth(views: readonly CardView[], _config: Config, today: string): MonthCount[] {
  const made = published(views)
    .map((v) => v.card.made_on)
    .filter((d) => d <= today)
    .map((d) => d.slice(0, 7))
    .sort();
  if (!made.length) return [];
  const now = today.slice(0, 7);
  const out: MonthCount[] = [];
  let [y, m] = made[0]!.split("-").map(Number) as [number, number];
  for (let month = made[0]!; month <= now; month = `${y}-${String(m).padStart(2, "0")}`) {
    out.push({ month, count: made.filter((x) => x === month).length, soFar: month === now });
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return out;
}
