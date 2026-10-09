import { describe, expect, it } from "vitest";
import { categoryOf, ConfigError, defineConfig, resolveConfig, statusLabel } from "@openpromises/core";

const site = { name: "Test" };

describe("configuration", () => {
  it("fills in neutral defaults", () => {
    const c = resolveConfig({ site });
    expect(c.locales).toEqual({ default: "en", all: ["en"] });
    expect(c.ladder.name).toBe("national");
    expect(c.editorial).toEqual({ approvals: 2, partyConflict: true, editorsFile: "editors.yaml", renamed: {} });
    expect(c.quotes).toEqual({ archive: "optional", require: "editor", minWords: 6, licences: [] });
    expect(c.money.costedBy).toBe("optional");
    expect(c.actors).toMatchObject({ responsible: ["government"], responsibleRequired: false });
    expect(statusLabel(c, "failed")).toBe("Not met");
    expect(statusLabel(c, "quietly_dropped")).toBe("Undone");
    expect(categoryOf(c, "delivered")).toBe("finished");
    expect(c.content).toBe("content");
  });

  it("gives Russian neutral labels too", () => {
    const c = resolveConfig({ site, locales: { default: "ru", all: ["ru", "en"] } });
    expect(statusLabel(c, "failed", "ru")).toBe("Не выполнено");
    expect(statusLabel(c, "quietly_dropped", "ru")).toBe("Без продолжения");
    expect(statusLabel(c, "failed", "en")).toBe("Not met");
  });

  it("puts every local status in a category, with not_in_power off the ladder", () => {
    const c = resolveConfig({ site, ladder: "local" });
    expect(c.ladder.statuses.map((s) => `${s.id}:${s.category}`)).toEqual([
      "promised:open",
      "in_plan:progress",
      "budgeted:progress",
      "delivering:progress",
      "delivered:finished",
      "failed:finished",
      "quietly_dropped:finished",
      "not_in_power:off_ladder",
      "unscoreable:off_ladder",
    ]);
  });

  it("accepts a custom ladder with its own labels", () => {
    const c = resolveConfig({
      site,
      ladder: { custom: [{ id: "promised", category: "open" }, { id: "started", category: "progress" }, { id: "done", category: "finished" }] },
      labels: { en: { started: "Started", done: "Done" } },
    });
    expect(c.ladder.statuses.map((s) => s.id)).toEqual(["promised", "started", "done"]);
    expect(statusLabel(c, "started")).toBe("Started");
  });

  it("refuses fewer than two approvals, or turning off the party check (principle 4)", () => {
    expect(() => resolveConfig({ site, editorial: { approvals: 1 } })).toThrow("should be 2 or more");
    expect(() => resolveConfig({ site, editorial: { partyConflict: false } })).toThrow("cannot be turned off");
  });

  it("refuses a custom ladder that does not start with the promise, or uses an event type as a status", () => {
    const err = (() => {
      try {
        resolveConfig({ site, ladder: { custom: [{ id: "started", category: "progress" }, { id: "reply", category: "finished" }] }, labels: { en: { started: "S", reply: "R" } } });
      } catch (e) {
        return e as ConfigError;
      }
    })();
    expect(err?.problems).toEqual(['ladder.custom: the first status is "promised", in the "open" category', 'ladder.custom: "reply" is an event type, so it cannot be a status']);
  });

  it("needs a label for every status in every language, and words for the deadline event", () => {
    expect(() => resolveConfig({ site, locales: { default: "fr", all: ["fr"] } })).toThrow('status "promised" has no label in "fr"');
    expect(() =>
      resolveConfig({
        site,
        locales: { default: "fr", all: ["fr"] },
        labels: { fr: { promised: "Promis", in_plan: "Prévu", legislated: "Voté", funded: "Financé", delivering: "En cours", delivered: "Tenu", failed: "Non tenu", quietly_dropped: "Abandonné", unscoreable: "Non évaluable" } },
      }),
    ).toThrow('no words for the automatic deadline_missed event in "fr"');
  });

  it("refuses unknown keys and a default language outside the list", () => {
    expect(() => resolveConfig({ site, ladders: "national" })).toThrow(ConfigError);
    expect(() => resolveConfig({ site, locales: { default: "ru", all: ["en"] } })).toThrow('locales.default "ru" is not one of locales.all');
  });

  it("accepts RFC-0001's example modules, keeping corrections and reviews always on", () => {
    const c = resolveConfig({ site, modules: ["contracts", "corrections", "reviews"] });
    expect([...c.modules]).toEqual(["contracts"]);
  });

  it("defineConfig returns the configuration unchanged after checking it", () => {
    const input = { site, ladder: "local" as const };
    expect(defineConfig(input)).toBe(input);
    expect(() => defineConfig({ site, ladder: "regional" as never })).toThrow(ConfigError);
  });
});
