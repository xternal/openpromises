import { describe, expect, it } from "vitest";
import { lastChanged, spotlight } from "@openpromises/publish";
import { site } from "./helpers";

// Decision 30: promises for the first screen, chosen by rule, the same for every party.
describe("spotlight", async () => {
  const s = await site("public-ledger");
  const today = "2026-10-09";
  const out = spotlight(s.views, s.config, today);

  it("counts every published promise and where they stand", () => {
    const published = s.views.filter((v) => v.where === "promises");
    expect(out.total).toBe(published.length);
    expect(out.counts.reduce((n, c) => n + c.count, 0)).toBe(published.length);
  });

  it("shows the latest changes first, then open promises due next, never the same card twice", () => {
    const dates = out.recent.map((v) => lastChanged(v, today)!);
    expect(dates).toEqual([...dates].sort().reverse());
    const due = out.due.map((v) => v.current.parameters!.deadline!);
    expect(due).toEqual([...due].sort());
    expect(due.every((d) => d >= today)).toBe(true);
    expect(out.due.some((v) => out.recent.includes(v))).toBe(false);
  });

  it("chooses the same cards whoever made them", () => {
    const swapped = s.views.map((v) => ({ ...v, party: null, actor: { ...v.actor, id: `x-${v.actor.id}`, party_id: undefined } }));
    expect(spotlight(swapped, s.config, today).recent.map((v) => v.id)).toEqual(out.recent.map((v) => v.id));
    expect(spotlight(swapped, s.config, today).due.map((v) => v.id)).toEqual(out.due.map((v) => v.id));
  });

  it("ignores reviews and anything dated after today", () => {
    const v = s.views[0]!;
    const reviewed = { ...v, card: { ...v.card, reviews: [{ by: "Ada", kind: "editor" as const, on: "2026-10-08", approves: true }], events: [...v.card.events, { date: "2030-01-01", type: "deadline", text: { en: "Due" } }] } };
    expect(lastChanged(reviewed, today)).toBe(lastChanged(v, today));
  });
});
