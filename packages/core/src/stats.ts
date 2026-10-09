import { categoryOf, type Config } from "./config";
import type { Category } from "./ladder";
import { approvers } from "./rules";
import type { Actor, Editor } from "./schema";
import type { ValidCard } from "./validate";

export interface Stats {
  published: number;
  drafts: number;
  byStatus: Record<string, number>;
  byCategory: Record<Category, number>;
  byActor: Record<string, number>;
  byArea: Record<string, number>;
  /** Published cards with at least one correction, and the corrections in all. */
  corrected: number;
  corrections: number;
  /** Drafts with every approval they need, and drafts still waiting. */
  draftsApproved: number;
  draftsWaiting: number;
}

const bump = (m: Record<string, number>, k: string) => {
  m[k] = (m[k] ?? 0) + 1;
};

/** Counts across a content folder, for `openpromises stats`. Published cards only, except the draft counts. */
export function contentStats(cards: readonly ValidCard[], config: Config, actors: ReadonlyMap<string, Actor>, editors: readonly Editor[] | null): Stats {
  const s: Stats = {
    published: 0,
    drafts: 0,
    byStatus: {},
    byCategory: { open: 0, progress: 0, finished: 0, off_ladder: 0 },
    byActor: {},
    byArea: {},
    corrected: 0,
    corrections: 0,
    draftsApproved: 0,
    draftsWaiting: 0,
  };
  for (const { card, where } of cards) {
    if (where === "drafts") {
      s.drafts++;
      if (approvers(card, { actors, editors }).size >= config.editorial.approvals) s.draftsApproved++;
      else s.draftsWaiting++;
      continue;
    }
    s.published++;
    bump(s.byStatus, card.status);
    const c = categoryOf(config, card.status);
    if (c) s.byCategory[c]++;
    bump(s.byActor, card.actor_id);
    bump(s.byArea, card.area);
    const n = card.corrections?.length ?? 0;
    if (n) s.corrected++;
    s.corrections += n;
  }
  return s;
}
