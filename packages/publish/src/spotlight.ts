import { categoryOf, type Config } from "@openpromises/core";
import { statusCounts, type CardView } from "./view";

/**
 * Promises for the first screen (decision 30): how many there are and where
 * they stand, the ones that changed most recently and the ones due next.
 * Chosen by rule, never by hand, so the same rule picks every party's
 * promises: a hand-picked "most interesting" list on the most visible spot
 * of the site would read as the site's own view.
 */
export interface Spotlight {
  total: number;
  counts: { status: string; count: number }[];
  /** Latest change first: an event, a rewording or a reply, up to today. */
  recent: CardView[];
  /** Open promises with a deadline from today on, nearest first, not already in `recent`. */
  due: CardView[];
}

/** The day a promise last changed: its latest event, rewording or reply up to today (reviews and our own corrections are not changes to the promise). */
export function lastChanged(v: Pick<CardView, "card">, today: string): string | undefined {
  const c = v.card;
  return [...c.events.map((e) => e.date), ...c.versions.map((x) => x.recorded_on), ...(c.replies ?? []).map((r) => r.date)]
    .filter((d) => d <= today)
    .sort()
    .at(-1);
}

export function spotlight(views: readonly CardView[], config: Config, today: string, opts: { recent?: number; due?: number } = {}): Spotlight {
  const published = views.filter((v) => v.where === "promises");
  const byId = (a: CardView, b: CardView) => (a.id < b.id ? -1 : 1);
  const recent = published
    .map((v) => ({ v, at: lastChanged(v, today) ?? "" }))
    .sort((a, b) => b.at.localeCompare(a.at) || byId(a.v, b.v))
    .slice(0, opts.recent ?? 3)
    .map((x) => x.v);
  const shown = new Set(recent.map((v) => v.id));
  const due = published
    .filter((v) => !shown.has(v.id) && ["open", "progress"].includes(categoryOf(config, v.card.status) ?? ""))
    .map((v) => ({ v, deadline: v.current.parameters?.deadline ?? "" }))
    .filter((x) => x.deadline >= today)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || byId(a.v, b.v))
    .slice(0, opts.due ?? 3)
    .map((x) => x.v);
  return { total: published.length, counts: statusCounts(published, config), recent, due };
}
