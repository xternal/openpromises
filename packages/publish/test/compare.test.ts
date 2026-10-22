import { describe, expect, it } from "vitest";
import { compare, ConfigError, resolveConfig } from "@openpromises/core";
import { comparisonLines, shownComparisons, words } from "@openpromises/publish";

// Decision 28 (RFC-0002): one fixed basket per site, neutral words, ranges in and ranges out.
const source = { title: "Source", url: "https://example.org/s", quality: "sourced" };
const units = [
  { id: "nurse", label: { en: { one: "nurse's pay for a year", other: "nurses' pay for a year" }, ru: { one: "годовая зарплата медсестры", few: "годовые зарплаты медсестёр", many: "годовых зарплат медсестёр", other: "годовой зарплаты медсестёр" } }, cost: [32_000, 35_000, 39_000], type: "recurring", price_year: "2026-27", source },
  { id: "teacher", label: { en: { one: "teacher's pay for a year", other: "teachers' pay for a year" }, ru: { one: "годовая зарплата учителя", few: "годовые зарплаты учителей", many: "годовых зарплат учителей", other: "годовой зарплаты учителей" } }, cost: [34_000, 47_000, 53_000], type: "recurring", price_year: "2026", source },
  { id: "pension", label: { en: { one: "full State Pension for a year", other: "full State Pensions for a year" }, ru: { one: "годовая пенсия", few: "годовые пенсии", many: "годовых пенсий", other: "годовой пенсии" } }, cost: [12_548, 12_548, 12_548], type: "recurring", price_year: "2026-27", source: { ...source, quality: "approx" } },
  { id: "hospital", label: { en: { one: "new hospital", other: "new hospitals" }, ru: { one: "новая больница", few: "новые больницы", many: "новых больниц", other: "новой больницы" } }, cost: [1.04e9, 1.61e9, 2.61e9], type: "one_off", price_year: "nominal", source },
] as const;
const basket = {
  population: { value: 69_483_900, year: "mid-2025", source },
  households: { value: 29_000_000, year: "2025", source },
  total: { value: 1_419e9, year: "2026-27", source, label: { en: "a year's public spending", ru: "годовых госрасходов" } },
  units: units.map((u) => ({ ...u, cost: [...u.cost] as [number, number, number], label: u.label as Record<string, Record<string, string>> })),
};
const config = resolveConfig({ site: { name: "T" }, locales: { default: "en", all: ["en", "ru"] }, money: { currency: "GBP", unit: "bn" }, comparisons: basket });
const en = words(config, "en");
const ru = words(config, "ru");
const yearly = { range: [1.8, 2.4, 3.2] as [number, number, number] };

describe("compare", () => {
  it("divides the low cost by the high unit cost, and the high by the low", () => {
    const nurse = compare(yearly, config).find((c) => c.id === "nurse")!;
    expect(nurse.value[0]).toBeCloseTo(1.8e9 / 39_000);
    expect(nurse.value[1]).toBeCloseTo(2.4e9 / 35_000);
    expect(nurse.value[2]).toBeCloseTo(3.2e9 / 32_000);
  });

  it("compares a yearly cost with recurring units, and a one-off cost with one-off units", () => {
    expect(compare(yearly, config).map((c) => c.id)).toEqual(["person", "household", "share", "nurse", "teacher", "pension"]);
    expect(compare({ range: [3, 4, 5] }, config, { oneOff: true }).map((c) => c.id)).toEqual(["person", "household", "hospital"]);
  });

  it("is nothing without a basket or a range", () => {
    expect(compare(yearly, resolveConfig({ site: { name: "T" }, money: { currency: "GBP", unit: "bn" } }))).toEqual([]);
    expect(compare({ note: { en: "None." } }, config)).toEqual([]);
  });

  it("refuses a basket of fewer than 3 units, or a unit without a language's plural forms", () => {
    expect(() => resolveConfig({ site: { name: "T" }, comparisons: { ...basket, units: basket.units.slice(0, 2) } })).toThrow("at least 3 units");
    const noFew = basket.units.map((u, i) => (i === 0 ? { ...u, label: { ...u.label, ru: { one: "медсестра", other: "медсестры" } } } : u));
    expect(() => resolveConfig({ site: { name: "T" }, locales: { default: "en", all: ["en", "ru"] }, comparisons: { ...basket, units: noFew } })).toThrow(ConfigError);
  });
});

describe("comparisons in words", () => {
  it("speaks neutrally, in ranges rounded to two figures", () => {
    expect(comparisonLines(yearly, config, en).map((l) => l.text)).toEqual([
      "£26–£46 a person a year",
      "£62–£110 a household a year",
      "0.13%–0.23% of a year's public spending",
      "Equal to the cost of 46,000–100,000 nurses' pay for a year",
      "Equal to the cost of 34,000–94,000 teachers' pay for a year",
      "Equal to the cost of 140,000–260,000 full State Pensions for a year",
    ]);
  });

  it("says about when the range rounds to one figure, and agrees in Russian", () => {
    expect(comparisonLines({ range: [1.254, 1.2548, 1.256] }, config, en).at(-1)!.text).toBe("Equal to the cost of about 100,000 full State Pensions for a year");
    expect(comparisonLines({ range: [1.6, 1.61, 1.62] }, config, en, { oneOff: true }).at(-1)!.text).toBe("Equal to the cost of 0.61–1.6 new hospitals");
    expect(comparisonLines({ range: [5, 8, 12] }, config, ru, { oneOff: true }).at(-1)!.text).toBe("Столько же стоит: 1,9–12 новых больниц");
    expect(comparisonLines(yearly, config, ru)[0]!.text).toBe("26 £–46 £ на жителя в год");
  });

  it("never says what the money could have bought", () => {
    for (const w of [en, ru]) for (const l of comparisonLines(yearly, config, w)) expect(l.text).not.toMatch(/could|instead|можно|вместо/i);
  });

  it("shows three units on the card and keeps the rest for the table", () => {
    const more = resolveConfig({ site: { name: "T" }, money: { currency: "GBP", unit: "bn" }, comparisons: { ...basket, show: 2 } });
    expect(shownComparisons(comparisonLines(yearly, more, words(more, "en")), more).map((l) => l.comparison.id)).toEqual(["person", "household", "share", "nurse", "teacher"]);
  });
});

describe("comparisons in every output", async () => {
  const { site } = await import("./helpers");
  const { cardMarkdown, openDataCsv, openDataJson } = await import("@openpromises/publish");
  const s = await site("public-ledger");
  const c = { ...s.config, comparisons: resolveConfig({ site: { name: "T" }, comparisons: basket }).comparisons };
  const v = s.views.find((x) => x.id === "uk-bus-cap-2-2026")!;
  const w = words(c, "en");
  const lines = comparisonLines(v.current.parameters?.cost, c, w).map((l) => l.text);

  it("is a section of the card's Markdown, with prices and sources", () => {
    expect(lines[0]).toBe("£5.2–£6.3 a person a year");
    const md = cardMarkdown(v, { config: c, w, today: s.today });
    expect(md).toContain("## What the cost compares with");
    expect(md).toContain(`- ${lines[0]} (prices of mid-2025; [Source](https://example.org/s))`);
  });

  it("is in the open data by card id, in every language, and in a CSV column at the end", () => {
    const data = openDataJson(s.views, c, s.today);
    expect(data.comparisons?.[v.id]?.cost.map((x) => x.text.en)).toEqual(lines);
    expect(openDataJson(s.views, s.config, s.today).comparisons).toBeUndefined();
    const [head, ...rows] = openDataCsv(s.views, c, w, s.today).split("\r\n");
    expect(head!.split(",").at(-7)).toBe("comparisons");
    expect(rows.find((r) => r.startsWith(`${v.id},`))).toContain(`"${lines.join("; ")}"`);
  });
});
