import { describe, expect, it } from "vitest";
import { cardStory, storyMarkdown, words } from "@openpromises/publish";
import { site } from "./helpers";

// Decision 29: a promise's whole story in one dated line, from the card alone, the same way for every party.
describe("cardStory", async () => {
  const s = await site("public-ledger");
  const base = s.views.find((x) => x.id === "uk-nato-5pc-2035-2025")!;
  const v1 = base.card.versions[0]!;
  const v2 = { ...v1, version: 2, recorded_on: "2026-09-01", text: "We will reach 5% by 2035, starting with 2.6% next year.", parameters: { ...v1.parameters!, cost: { ...v1.parameters!.cost!, range: [40, 45, 50] as [number, number, number] } } };
  const card = {
    ...base.card,
    versions: [v1, v2],
    replies: [{ from_actor_id: base.actor.id, date: "2026-09-10", text: "We stand by it.", url: "https://example.org/reply" }],
    events: [...base.card.events, { date: "2036-01-01", type: "deadline", text: { en: "Due" } }],
  };
  const v = { ...base, card, current: v2 };
  const w = words(s.config, "en");
  const story = cardStory(v, s.config, w, "2026-10-09");

  it("starts with the words as first said and keeps every dated item in order", () => {
    expect(story[0]).toMatchObject({ date: card.made_on, kind: "promised", label: "Promised" });
    expect(story.map((i) => i.date)).toEqual([...story.map((i) => i.date)].sort());
  });

  it("includes the rewording, the cost change, the reply, the correction and what is to come", () => {
    const kinds = story.map((i) => i.kind);
    for (const k of ["reworded", "cost", "reply", "correction", "deadline"] as const) expect(kinds).toContain(k);
    expect(story.find((i) => i.kind === "reworded")!.quote).toBe("“We will reach 5% by 2035, starting with 2.6% next year.”");
    expect(story.find((i) => i.kind === "cost")!.text).toMatch(/^Costs £40bn to £50bn a year \(was: Costs £\d+bn to £\d+bn a year\)$/);
    expect(story.find((i) => i.kind === "reply")).toMatchObject({ label: `Reply from ${base.actor.name.en}`, link: "https://example.org/reply" });
    expect(story.at(-1)).toMatchObject({ kind: "deadline", toCome: true });
  });

  it("is Markdown a page can share, with each item's source", () => {
    const md = storyMarkdown(story, w);
    expect(md[0]).toMatch(/^- \d+ \w+ \d{4}, Promised: “.+” \(\[source\]\(https:\/\/.+\)\)$/);
    expect(md.at(-1)).toBe("- 1 January 2036 (to come), Deadline: Due");
  });

  it("speaks Russian", async () => {
    const b = await site("synthetic-bilingual");
    const ru = cardStory(b.views.find((x) => x.where === "promises")!, b.config, words(b.config, "ru"), b.today);
    expect(ru[0]!.label).toBe("Обещано");
  });
});
