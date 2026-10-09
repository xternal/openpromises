import { describe, expect, it } from "vitest";
import { appendOnlyIssues, fieldAt, fromPublicLedger, LEGACY_LATE_FIELDS, stable, withField } from "@openpromises/core";
import { BASE, card } from "./helpers";

/** The same value with every object's keys in reverse order. */
function reversed(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reversed);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reversed(x)]));
  return v;
}

const messages = (before: unknown, after: unknown) => appendOnlyIssues(before, after).map((i) => `${i.path.join(".")}: ${i.message}`);

describe("stable", () => {
  it("ignores key order and undefined fields", () => {
    expect(stable({ b: 1, a: [{ y: 2, x: 1 }], c: undefined })).toBe(stable({ a: [{ x: 1, y: 2 }], b: 1 }));
    expect(stable({ a: [1, 2] })).not.toBe(stable({ a: [2, 1] }));
  });
});

describe("fieldAt and withField", () => {
  it("read and write a field by its path, absent reading as null", () => {
    const e = { parameters: { cost: { range: [1, 2, 3] } } };
    expect(fieldAt(e, ".parameters.cost.range")).toEqual([1, 2, 3]);
    expect(fieldAt(e, ".parameters.who")).toBeNull();
    expect(withField(e, ".parameters.cost.range", null)).toEqual({ parameters: { cost: {} } });
    expect(withField(e, ".parameters.who.en", "x")).toEqual({ parameters: { cost: { range: [1, 2, 3] }, who: { en: "x" } } });
    expect(e.parameters.cost.range).toEqual([1, 2, 3]);
  });

  it("refuse paths that would write to Object.prototype", () => {
    expect(() => withField({}, ".__proto__.polluted", 1)).toThrow("unsafe correction path");
    expect(() => withField({}, ".constructor", 1)).toThrow("unsafe correction path");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("append-only", () => {
  it("passes an unchanged card, whatever its key order", () => {
    const reordered = reversed(BASE);
    expect(Object.keys(reordered as object)[0]).toBe("reviews");
    expect(messages(BASE, reordered)).toEqual([]);
  });

  it("passes new entries at the end, and edits to what describes the present", () => {
    const after = card((c) => {
      c.events.push({ date: "2026-08-01", type: "funded", text: { en: "Funded" }, evidence_url: "https://example.org/f" });
      c.status = "funded";
      c.status_note = { en: "Now funded." };
      c.headline = { en: "Cap city bus fares at £2" };
      c.reviews!.push({ by: "AI Journalist", kind: "automated", on: "2026-08-02" });
    });
    expect(messages(BASE, after)).toEqual([]);
  });

  it("fails an edited, removed or reordered entry", () => {
    expect(messages(BASE, card((c) => (c.events[1]!.text = { en: "Rewritten" })))).toEqual([
      "events.1: was changed; history is append-only (add a new entry, or record our own mistake as a correction)",
    ]);
    expect(messages(BASE, card((c) => c.events.pop()))).toEqual(["events.1: was removed; history is append-only (record what happened as a new entry instead)"]);
    expect(messages(BASE, card((c) => c.events.reverse()))).toHaveLength(2);
  });

  it("passes a change that a new correction records exactly", () => {
    const after = card((c) => {
      c.versions[0]!.parameters!.cost!.range = [1.1, 1.3, 1.6];
      c.corrections = [{ date: "2026-10-01", path: "versions[0].parameters.cost.range", was: [1, 1.2, 1.5], now: [1.1, 1.3, 1.6], reason: { en: "Misread the budget table." } }];
    });
    expect(messages(BASE, after)).toEqual([]);
  });

  it("undoes several corrections of one entry, newest first", () => {
    const after = card((c) => {
      c.events[1]!.date = "2026-06-03";
      c.events[1]!.text = { en: "Named in the transport plan" };
      c.corrections = [
        { date: "2026-10-01", path: "events[1].date", was: "2026-06-01", now: "2026-06-02", reason: { en: "Wrong day." } },
        { date: "2026-10-02", path: "events[1].text", was: { en: "In the city's transport plan" }, now: { en: "Named in the transport plan" }, reason: { en: "Clearer." } },
        { date: "2026-10-03", path: "events[1].date", was: "2026-06-02", now: "2026-06-03", reason: { en: "Still wrong." } },
      ];
    });
    expect(messages(BASE, after)).toEqual([]);
  });

  it("fails a change its correction does not record", () => {
    const after = card((c) => {
      c.versions[0]!.parameters!.cost!.range = [1.1, 1.3, 1.6];
      c.versions[0]!.text = "Something else entirely.";
      c.corrections = [{ date: "2026-10-01", path: "versions[0].parameters.cost.range", was: [1, 1.2, 1.5], now: [1.1, 1.3, 1.6], reason: { en: "Misread." } }];
    });
    expect(messages(BASE, after)).toEqual(["versions.0: changed in ways its corrections do not record: undoing them does not give back the published entry"]);
  });

  it("fails a correction whose was is not the published value", () => {
    const after = card((c) => {
      c.versions[0]!.parameters!.cost!.range = [1.1, 1.3, 1.6];
      c.corrections = [{ date: "2026-10-01", path: "versions[0].parameters.cost.range", was: [9, 9, 9], now: [1.1, 1.3, 1.6], reason: { en: "Misread." } }];
    });
    expect(messages(BASE, after)).toHaveLength(1);
  });

  it("fails a changed or removed correction or review", () => {
    const corrected = card((c) => (c.corrections = [{ date: "2026-10-01", path: "events[0].date", was: "2026-05-01", now: "2026-05-01", reason: { en: "Checked." } }]));
    expect(messages(corrected, card())).toEqual(["corrections.0: was changed or removed; corrections are history too (add a new correction instead)"]);
    expect(messages(BASE, card((c) => (c.reviews![0]!.on = "2026-05-09")))).toEqual(["reviews.0: was changed or removed; reviews are history (add a new review instead)"]);
  });

  it("fails a changed id", () => {
    expect(messages(BASE, card((c) => (c.id = "other")))).toEqual(['id: the id changed from "test-bus-fares" to "other"; a published card keeps its id']);
  });

  it("refuses an unsafe correction path instead of following it", () => {
    const after = card((c) => {
      c.events[1]!.text = { en: "x" };
      c.corrections = [{ date: "2026-10-01", path: "events[1].__proto__", was: null, now: null, reason: { en: "x" } }];
    });
    expect(messages(BASE, after)[0]).toContain("unsafe correction path");
  });

  it("treats a format migration as no edit: a legacy card read in v1 equals the same card migrated", () => {
    const legacy = {
      id: "uk-test-2026",
      headline: "Cap bus fares at £2",
      actor_id: "ada-lovelace",
      made_on: "2026-05-01",
      policy_area: "transport",
      status: "promised",
      deadline: "2027-01-01",
      sources: [],
      versions: [{ version: 1, text: "We will cap fares.", recorded_on: "2026-05-01", source_url: "https://example.org/s", parameters: { who: "Passengers", how_much_bn_per_year: [1, 1.2, 1.4], cost_note: "From the budget." } }],
      events: [{ date: "2026-05-01", type: "promised", text: "Promised" }],
      corrections: [{ date: "2026-10-01", path: "versions[0].parameters.cost_note", was: "Old note.", now: "From the budget.", reason: "Fixed note." }],
    };
    // The migration change: base in the old format, now in v1, written back with keys in another order.
    const migrated = fromPublicLedger(legacy);
    const written = reversed(migrated) as { versions: { parameters: { cost: { range: number[] } } }[] };
    expect(messages(fromPublicLedger(legacy), written)).toEqual([]);
    // And a real edit made in the same change is still caught.
    written.versions[0]!.parameters.cost.range[0] = 0.5;
    expect(messages(fromPublicLedger(legacy), written)).toHaveLength(1);
  });
});

describe("late fields (decision 13.1)", () => {
  const by = { kind: "official", name: "Transport department" };
  const withBy = card((c) => (c.versions[0]!.parameters!.cost!.by = by as never));

  it("lets a field added to the format be filled in once on a published version, with no correction", () => {
    expect(messages(BASE, withBy)).toEqual([]);
  });

  it("treats a change to it, once filled in, as history like the rest", () => {
    const changed = card((c) => (c.versions[0]!.parameters!.cost!.by = { kind: "party", name: "Someone else" }));
    expect(messages(withBy, changed)).toEqual(["versions.0: was changed; history is append-only (add a new entry, or record our own mistake as a correction)"]);
    expect(messages(withBy, BASE)).toHaveLength(1);
  });
});

describe("Public Ledger's fields of 9 October 2026 (decision 14)", () => {
  const legacy = {
    id: "uk-test-2026",
    actor_id: "someone",
    made_on: "2026-07-22",
    policy_area: "economic_affairs",
    status: "delivered",
    outcome_by: { actor_id: "hm-government", note: "The government must act." },
    brought_about_by: { actor_id: "hm-government" },
    versions: [{ version: 1, text: "Words.", recorded_on: "2026-07-22", source_url: "https://example.org", parameters: { how_much_bn_per_year: [1, 2, 3], costed_by: { kind: "official", name: "OBR" } } }],
    events: [{ date: "2026-07-22", type: "promised", text: "Promised" }],
    corrections: [{ date: "2026-10-09", path: "versions[0].parameters.costed_by", was: null, now: { kind: "official", name: "OBR" }, reason: "Named the maker." }],
  };

  it("reads costed_by as cost.by, outcome_by as responsible and brought_about_by as brought_about_by", () => {
    const v1 = fromPublicLedger(legacy) as Record<string, any>;
    expect(v1.versions[0].parameters.cost).toEqual({ range: [1, 2, 3], by: { kind: "official", name: "OBR" } });
    expect(v1.responsible).toEqual({ actor_id: "hm-government", note: { en: "The government must act." } });
    expect(v1.brought_about_by).toEqual({ actor_id: "hm-government" });
    expect(v1.x).toBeUndefined();
    expect(v1.corrections[0].path).toBe("versions[0].parameters.cost.by");
    expect((fromPublicLedger({ ...legacy, outcome_by: null }) as Record<string, unknown>).responsible).toBeNull();
  });
});

describe("fields an older format had no place for (decision 15)", () => {
  const unlabelled = card((c) => delete c.versions[0]!.parameters!.cost!.quality);
  const labelled = card((c) => (c.versions[0]!.parameters!.cost!.quality = "sourced"));

  it("lets a site converted from Public Ledger add a cost's quality label once, with no correction", () => {
    expect(messages(unlabelled, labelled)).toHaveLength(1);
    expect(appendOnlyIssues(unlabelled, labelled, { legacy: "public-ledger" })).toEqual([]);
  });

  it("treats a change to the label, once there, as history like the rest", () => {
    const changed = card((c) => (c.versions[0]!.parameters!.cost!.quality = "approx"));
    expect(appendOnlyIssues(labelled, changed, { legacy: "public-ledger" })).toHaveLength(1);
  });

  it("lists, for each older format, only fields it had no place for", () => {
    expect(LEGACY_LATE_FIELDS["public-ledger"]).toEqual({ versions: [".parameters.cost.quality"] });
    expect(appendOnlyIssues(unlabelled, labelled, { legacy: "borough-book" })).toHaveLength(1);
  });
});
