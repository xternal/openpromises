import type { Config } from "@openpromises/core";
import { correctionTarget, correctionValue } from "./corrections";
import { estimateWords } from "./estimate";
import { costText, longDate } from "./format";
import type { Words } from "./messages";
import { actorName, eventLabel, pick, quoteIn, type CardView } from "./view";

/**
 * A promise's whole story in one dated line (decision 29): the words as
 * first said, every rewording, every event with its evidence, replies, cost
 * changes, corrections, and what is still to come (deadlines, delivery steps
 * expected). Built only from the card, the same way for every party, in
 * neutral words; nothing is added that the card does not record.
 */

export type StoryKind = "promised" | "reworded" | "event" | "reply" | "cost" | "correction" | "deadline" | "step";

export interface StoryItem {
  /** YYYY-MM-DD */
  date: string;
  kind: StoryKind;
  /** "Promised", "In plan", "Reworded", "Reply from …", "Corrected" */
  label: string;
  /** What happened, in the reader's language. */
  text?: string;
  /** The speaker's words, quoted, when the item is words. */
  quote?: string;
  /** Where it is shown: the evidence, the source, the reply. */
  link?: string;
  /** Dated after today: a deadline or a step still to come. */
  toCome: boolean;
}

/** The order of items on the same day: words first, then what happened, then what was said back, then our own changes. */
const ORDER: StoryKind[] = ["promised", "reworded", "event", "step", "deadline", "cost", "reply", "correction"];

export function cardStory(v: CardView, config: Config, w: Words, today: string): StoryItem[] {
  const L = w.locale;
  const f = v.card;
  const out: StoryItem[] = [];
  const add = (item: Omit<StoryItem, "toCome">) => out.push({ ...item, toCome: item.date > today });

  f.versions.forEach((ver, k) => {
    const quote = w.q(quoteIn(ver, L, config).text);
    if (k === 0) return add({ date: f.made_on, kind: "promised", label: w.t("event.promised"), quote, link: ver.archived_url ?? ver.source_url });
    add({ date: ver.recorded_on, kind: "reworded", label: w.t("event.reworded"), quote, link: ver.archived_url ?? ver.source_url });
    const was = f.versions[k - 1]!.parameters?.cost;
    const now = ver.parameters?.cost;
    if (JSON.stringify(was?.range ?? null) !== JSON.stringify(now?.range ?? null))
      add({ date: ver.recorded_on, kind: "cost", label: w.t("story.cost"), text: w.t("story.cost_now", { now: costText(w, config, now), was: costText(w, config, was) }) });
  });

  for (const e of f.events) {
    if (e.type === "promised") continue; // the words themselves stand for it
    const deadline = e.type === "deadline";
    add({ date: e.date, kind: deadline ? "deadline" : "event", label: eventLabel(config, w, e.type, e.subtype), text: pick(e.text, L, config), ...(e.evidence_url ? { link: e.evidence_url } : {}) });
  }

  const steps = estimateWords(v, config, w).steps;
  (v.current.parameters?.estimate?.path ?? []).forEach((s, j) => {
    if (s.met_by_event !== undefined || !s.by) return; // a met step is its event; only steps still expected are added
    add({ date: s.by, kind: "step", label: w.t("story.step"), text: steps[j]?.label });
  });

  for (const r of f.replies ?? []) {
    const from = r.from_actor_id === v.actor.id ? actorName(v.actor, L, config) : (r.from ?? r.from_actor_id ?? "");
    add({ date: r.date, kind: "reply", label: w.t("story.reply", { who: from }), quote: w.q(r.text), ...(r.url ? { link: r.url } : {}) });
  }

  for (const c of f.corrections ?? []) {
    const reason = pick(c.reason, L, config);
    add({
      date: c.date,
      kind: "correction",
      label: w.t("story.correction"),
      text: w.t("story.correction_text", { target: correctionTarget(c, f, config, w), was: correctionValue(c, c.was, config, w), now: correctionValue(c, c.now, config, w) }) + (reason ? ` ${reason}` : ""),
      ...(c.source_url ? { link: c.source_url } : {}),
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

/** The story as Markdown lines: "- 6 October 2026, In plan: … ([evidence](…))". */
export function storyMarkdown(items: readonly StoryItem[], w: Words): string[] {
  const flat = (s: string) => s.replace(/\s+/g, " ").trim();
  return items.map((i) => {
    const body = [i.quote, i.text].filter((x): x is string => !!x).map(flat).join(" ");
    const when = `${longDate(w, i.date)}${i.toCome ? ` (${w.t("card.to_come")})` : ""}`;
    return `- ${when}, ${i.label}${body ? `: ${body}` : ""}${i.link ? ` ([${w.t("story.link")}](${i.link}))` : ""}`;
  });
}
