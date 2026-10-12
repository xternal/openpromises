import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveConfig, validateContent, type Verification } from "@openpromises/core";
import { folderSource, loadConfig, readContent } from "@openpromises/files";
import { buildFeed, cardMarkdown, cardViews, openDataCsv, openDataJson, verificationText, words } from "@openpromises/publish";
import { ROOT } from "./helpers";

// Decision 23: one function gives the words, and every output uses it.
const config = resolveConfig({ site: { name: "Test", url: "https://example.org" }, locales: { default: "en", all: ["en", "ru"] }, editorial: { renamed: { "Junior Editor": "AI Journalist" } } });
const en = words(config, "en");
const ru = words(config, "ru");
const v = (verification: Verification) => ({ verification });

describe("verificationText", () => {
  it("says plainly when no editor has verified a card", () => {
    expect(verificationText(v({ level: "none", named: [], counted: 0, automated: [] }), config, en)).toBe("Not yet verified by an editor");
    expect(verificationText(v({ level: "automated", named: [], counted: 0, automated: ["Junior Editor"] }), config, en)).toBe(
      "Checked automatically by AI Journalist, not yet verified by an editor",
    );
  });

  it("names the editors who chose it and counts the rest", () => {
    expect(verificationText(v({ level: "editors", named: ["Pavel Guzhikov"], counted: 1, automated: [] }), config, en)).toBe("Verified by Pavel Guzhikov and 1 independent editor");
    expect(verificationText(v({ level: "editors", named: [], counted: 2, automated: [] }), config, en)).toBe("Verified by 2 independent editors");
    expect(verificationText(v({ level: "editor", named: ["Pavel Guzhikov"], counted: 0, automated: [] }), config, en)).toBe("Verified by Pavel Guzhikov");
    expect(verificationText(v({ level: "editors", named: ["A", "B"], counted: 3, automated: [] }), config, en)).toBe("Verified by A, B and 3 independent editors");
  });

  it("speaks Russian with Russian plurals", () => {
    expect(verificationText(v({ level: "none", named: [], counted: 0, automated: [] }), config, ru)).toBe("Редактор ещё не подтвердил");
    expect(verificationText(v({ level: "editors", named: ["Павел Гужиков"], counted: 1, automated: [] }), config, ru)).toBe("Подтвердили: Павел Гужиков и 1 независимый редактор");
    expect(verificationText(v({ level: "editors", named: [], counted: 2, automated: [] }), config, ru)).toBe("Подтвердили: 2 независимых редактора");
    expect(verificationText(v({ level: "editors", named: [], counted: 5, automated: [] }), config, ru)).toBe("Подтвердили: 5 независимых редакторов");
  });

  it("takes the site's own words", () => {
    const own = resolveConfig({ site: { name: "Test", url: "https://example.org" }, messages: { en: { "verify.none": "Awaiting an editor" } } });
    expect(verificationText(v({ level: "none", named: [], counted: 0, automated: [] }), own, words(own, "en"))).toBe("Awaiting an editor");
  });

  it("is nothing without the editors list", () => {
    expect(verificationText({}, config, en)).toBeUndefined();
  });
});

describe("the label in every output", async () => {
  const { config: c, contentDir } = await loadConfig(join(ROOT, "fixtures", "synthetic-bilingual", "openpromises.config.ts"));
  const r = validateContent(readContent(folderSource(contentDir), c).input);
  const views = cardViews(r.cards, r.actors, r.editors);
  const bare = cardViews(r.cards, r.actors);
  const published = views.filter((x) => x.where === "promises");
  const one = published[0]!;
  const w = words(c, "en");
  const label = verificationText(one, c, w)!;

  it("comes with every view made with the editors list, and not without it", () => {
    expect(published.every((x) => x.verification)).toBe(true);
    expect(bare.some((x) => x.verification)).toBe(false);
    expect(label).toMatch(/^Verified by \d independent editors?$/);
  });

  it("is a fact in the card's Markdown", () => {
    expect(cardMarkdown(one, { config: c, w, today: "2026-10-12" })).toContain(`- **Verification:** ${label}`);
  });

  it("is in the open data, in every language, and in two new CSV columns", () => {
    const data = openDataJson(views, c, "2026-10-12");
    expect(data.verification?.[one.id]?.text.en).toBe(label);
    expect(data.verification?.[one.id]?.text.ru).toBe(verificationText(one, c, words(c, "ru")));
    expect(openDataJson(bare, c, "2026-10-12").verification).toBeUndefined();
    const [head, row] = openDataCsv(views, c, w, "2026-10-12").split("\r\n");
    expect(head!.split(",").slice(-2)).toEqual(["verification_level", "verification"]);
    expect(row).toContain(`,${one.verification!.level},${label}`);
  });

  it("is in the card's own feed", () => {
    const feed = buildFeed(views, "promise", one.id, { config: c, w, today: "2026-10-12" }, "atom");
    expect(feed.body).toContain(`${label}.</subtitle>`);
  });
});
