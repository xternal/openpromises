import { describe, expect, it } from "vitest";
import { areaCoverage } from "@openpromises/publish";
import { site } from "./helpers";

// Decision 33: every area the site lists, empty ones included, the same list for every actor.
describe("areaCoverage", async () => {
  const s = await site("public-ledger");
  const published = s.views.filter((v) => v.where === "promises");
  const values = s.config.areas.kind === "enum" ? s.config.areas.values : [];

  it("lists every configured area in order, empty ones included", () => {
    const one = published.filter((v) => v.actor.id === published[0]!.actor.id);
    const out = areaCoverage(one, s.config);
    expect(out.map((r) => r.area)).toEqual(values);
    expect(out.some((r) => r.count === 0)).toBe(true);
    expect(out.filter((r) => r.count === 0).every((r) => r.counts.length === 0)).toBe(true);
  });

  it("counts published cards only, and where they stand adds up", () => {
    const out = areaCoverage(s.views, s.config);
    expect(out.reduce((n, r) => n + r.count, 0)).toBe(published.length);
    for (const r of out) expect(r.counts.reduce((n, c) => n + c.count, 0)).toBe(r.count);
    const drafts = s.views.map((v) => ({ ...v, where: "drafts" as const }));
    expect(areaCoverage(drafts, s.config).every((r) => r.count === 0)).toBe(true);
  });

  it("frames every actor with the same list, whoever they are", () => {
    const swapped = s.views.map((v) => ({ ...v, party: null, actor: { ...v.actor, id: `x-${v.actor.id}`, party_id: undefined } }));
    expect(areaCoverage(swapped, s.config)).toEqual(areaCoverage(s.views, s.config));
    expect(areaCoverage([], s.config).map((r) => r.area)).toEqual(values);
  });

  it("shows only the areas cards use when the site's areas are free text", async () => {
    const b = await site("borough-book");
    expect(b.config.areas.kind).toBe("text");
    const out = areaCoverage(b.views, b.config);
    const used = [...new Set(b.views.filter((v) => v.where === "promises").map((v) => v.card.area))];
    expect(out.map((r) => r.area).sort()).toEqual(used.sort());
    expect(out.reduce((n, r) => n + r.count, 0)).toBe(b.views.filter((v) => v.where === "promises").length);
    expect(areaCoverage([], b.config)).toEqual([]);
  });

  it("orders free-text areas alphabetically in the reader's language, as AreaIndex does", async () => {
    const b = await site("borough-book");
    const one = b.views.find((v) => v.where === "promises")!;
    const named = (...areas: string[]) => areas.map((area, i) => ({ ...one, id: `${one.id}-${i}`, card: { ...one.card, area } }));
    // By character code "Ё" comes before "А", and capitals before small letters.
    expect(areaCoverage(named("Жильё", "Ёлки", "Аптеки"), b.config, "ru").map((r) => r.area)).toEqual(["Аптеки", "Ёлки", "Жильё"]);
    expect(areaCoverage(named("parks", "Waste", "housing"), b.config, "en").map((r) => r.area)).toEqual(["housing", "parks", "Waste"]);
  });
});
