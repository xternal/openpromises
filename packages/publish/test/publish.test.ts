import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { resolveConfig, validateContent } from "@openpromises/core";
import { folderSource, loadConfig, readContent } from "@openpromises/files";
import {
  absolute,
  areaSlug,
  buildFeed,
  canSubmit,
  cardJsonLd,
  cardMarkdown,
  cardViews,
  changedPages,
  climb,
  costText,
  csvField,
  endings,
  indexNowPayload,
  jsonLdText,
  llmsTxt,
  longDate,
  money,
  openDataCsv,
  openDataJson,
  paths,
  plural,
  publishFiles,
  quoteIn,
  sitemapEntries,
  sitemapXml,
  slugify,
  tagUri,
  wordDiff,
  words,
  xmlEscape,
} from "@openpromises/publish";
import { ROOT, site } from "./helpers";

const xmlOk = (text: string) => {
  const doc = new new JSDOM("").window.DOMParser().parseFromString(text, "application/xml");
  return doc.getElementsByTagName("parsererror").length === 0;
};

describe("words", () => {
  const config = resolveConfig({ site: { name: "T" }, locales: { default: "ru", all: ["ru", "en"] }, messages: { en: { "card.timeline": "Timeline" } } });

  it("come in each language, with the site's own words on top", () => {
    expect(words(config, "en").t("card.timeline")).toBe("Timeline");
    expect(words(config, "ru").t("card.timeline")).toBe("Что произошло");
    expect(words(config, "en").t("cost.costs", { low: "£1bn", high: "£2bn", per: "a year" })).toBe("Costs £1bn to £2bn a year");
  });

  it("choose plural forms by each language's rules", () => {
    const ru = words(config, "ru");
    expect([1, 3, 5, 21].map((n) => plural(ru.m, "coming.count", n, { when: "в октябре" }).split(" ").slice(0, 2).join(" "))).toEqual(["1 обещание", "3 обещания", "5 обещаний", "21 обещание"]);
    expect(plural(words(config, "en").m, "coming.count", 1, { when: "October" })).toBe("1 promise is due from October, nearest first.");
  });

  it("show an unknown key as itself, so a gap is visible", () => {
    expect(words(config, "en").t("no.such.key")).toBe("no.such.key");
  });
});

describe("money and dates", () => {
  const gbp = resolveConfig({ site: { name: "T" }, money: { currency: "GBP", unit: "bn" } });
  const gbpM = resolveConfig({ site: { name: "T" }, money: { currency: "GBP", unit: "m" } });
  const rub = resolveConfig({ site: { name: "T" }, locales: { default: "ru", all: ["ru", "en"] }, money: { currency: "RUB", unit: "bn" } });
  const en = words(gbp, "en");

  it("write amounts as each language does", () => {
    expect(money(en, gbp, 0.4)).toBe("£0.4bn");
    expect(money(en, gbp, 115)).toBe("£115bn");
    expect(money(en, gbpM, 45)).toBe("£45m");
    expect(money(words(rub, "ru"), rub, 52.5)).toBe("52,5 млрд ₽");
    expect(money(words(rub, "en"), rub, 52.5)).toBe("₽52.5bn");
    expect(money(words(rub, "ru"), rub, 520.5)).toBe("521 млрд ₽");
  });

  it("say a cost as Public Ledger does, and money coming in as raised", () => {
    expect(costText(en, gbp, { range: [0.36, 0.4, 0.44] })).toBe("Costs £0.36bn to £0.44bn a year");
    expect(costText(en, gbp, { range: [-15, -12, -10] })).toBe("Raises £10bn to £15bn a year");
    expect(costText(en, gbp, undefined)).toBe("Cost not stated");
    expect(costText(en, gbp, { note: { en: "None published." } })).toBe("No costing published");
    expect(costText(en, gbp, undefined, { costable: false })).toBe("Not costable");
    expect(costText(en, gbpM, { range: [7.2, 8, 8.8] }, { period: "total" })).toBe("Costs £7.2m to £8.8m in all");
  });

  it("write days as days, in the reader's language", () => {
    expect(longDate(en, "2026-10-06")).toBe("6 October 2026");
    expect(longDate(words(rub, "ru"), "2026-10-06")).toBe("6 октября 2026 г.");
  });
});

describe("views and paths", () => {
  it("join each card with its actor, party and role on the day", async () => {
    const s = await site("public-ledger");
    const bus = s.views.find((v) => v.id === "uk-bus-cap-2-2026")!;
    expect([bus.actor.id, bus.party?.id, bus.role?.en]).toEqual(["andy-burnham", "labour", "Prime Minister"]);
    expect(s.views[0]!.card.made_on >= s.views.at(-1)!.card.made_on).toBe(true);
  });

  it("keep Public Ledger's page and feed addresses", async () => {
    const { config } = await site("public-ledger");
    const p = paths(config);
    expect([p.card("uk-bus-cap-2-2026", "en"), p.actor("labour", "en"), p.area("economic_affairs", "en"), p.markdown("uk-bus-cap-2-2026", "en")]).toEqual([
      "/promise/uk-bus-cap-2-2026",
      "/actor/labour",
      "/promises/area/transport-and-economy",
      "/promise/uk-bus-cap-2-2026.md",
    ]);
    expect([p.feed("all", "", "en", "atom"), p.feed("promise", "uk-bus-cap-2-2026", "en", "atom"), p.feed("area", "economic_affairs", "en", "atom")]).toEqual([
      "/feeds/all.xml",
      "/feeds/promise/uk-bus-cap-2-2026.xml",
      "/feeds/area/economic_affairs.xml",
    ]);
  });

  it("keep Borough Book's addresses: party pages, topic slugs and a feed beside each page", async () => {
    const { config } = await site("borough-book");
    const p = paths(config);
    expect(p.area("Care for older and disabled adults", "en")).toBe("/topic/care-for-older-and-disabled-adults");
    expect(slugify("Streets, waste & transport")).toBe("streets-waste-and-transport");
    expect([p.feed("all", "", "en", "rss"), p.feed("actor", "labour", "en", "rss"), p.feed("area", "Parks, libraries and leisure", "en", "rss")]).toEqual([
      "/promises/feed.xml",
      "/party/labour/feed.xml",
      "/topic/parks-libraries-and-leisure/feed.xml",
    ]);
  });

  it("put other languages under their own prefix", async () => {
    const { config } = await site("synthetic-bilingual");
    const p = paths(config);
    expect([p.card("x", "ru"), p.card("x", "en"), p.feed("all", "", "en", "rss"), p.llms("en"), areaSlug(config, "07")]).toEqual(["/promise/x", "/en/promise/x", "/en/feeds/all.rss", "/en/llms.txt", "07"]);
  });

  it("show a quote in its own language, or our translation marked as such", async () => {
    const { config, views } = await site("synthetic-bilingual");
    const v = views.find((x) => x.id === "example-party-roads-2026")!;
    expect(quoteIn(v.current, "ru", config)).toMatchObject({ translated: false, text: v.current.text });
    expect(quoteIn(v.current, "en", config)).toMatchObject({ translated: true, text: "We will repair every rural road that leads to a school or a hospital.", originalLang: "ru" });
  });

  it("climb the ladder to delivered; not met and undone are endings", async () => {
    const { config } = await site("public-ledger");
    expect(climb(config)).toEqual(["promised", "in_plan", "legislated", "funded", "delivering", "delivered"]);
    expect(endings(config)).toEqual(["failed", "quietly_dropped"]);
  });

  it("diff two wordings word by word", () => {
    expect(wordDiff("By the end of 2027 we will build 100 schools", "By the end of 2028 we will build 100 schools")).toEqual([
      { kind: "same", text: "By the end of" },
      { kind: "removed", text: "2027" },
      { kind: "added", text: "2028" },
      { kind: "same", text: "we will build 100 schools" },
    ]);
  });
});

describe("feeds", () => {
  it("keep Public Ledger's entry ids and words", async () => {
    const s = await site("public-ledger");
    const f = buildFeed(s.views, "promise", "uk-nato-5pc-2035-2025", { config: s.config, w: words(s.config, "en"), today: s.today }, "atom");
    expect(xmlOk(f.body)).toBe(true);
    expect([...f.body.matchAll(/<entry>\s*<id>([^<]+)<\/id>/g)].map((m) => m[1])).toEqual([
      "tag:ledgergov.uk,2026:promise/uk-nato-5pc-2035-2025/cost/correction/1",
      "tag:ledgergov.uk,2026:promise/uk-nato-5pc-2035-2025/event/1",
      "tag:ledgergov.uk,2026:promise/uk-nato-5pc-2035-2025/event/0",
    ]);
    // A cost correction, as Public Ledger's feeds word it since 9 October 2026.
    expect(f.body).toContain("<title type=\"text\">Cost changed: now costs £36bn to £44bn a year, was costs £32.4bn to £39.6bn a year (Keir Starmer)</title>");
    expect(f.body).toContain(
      "<title type=\"text\">In plan: Defence Investment Plan restates the 3.5% of GDP core defence commitment for 2035; funding set out to 2029-30 at 2.7% (Keir Starmer)</title>",
    );
    expect(f.body).toContain("Keir Starmer, 24 June 2025: “That is why, as part of this strategy, we make a historic commitment to spend 5% of our GDP on national security by 2035.”\nStatus now: In plan.");
    // The 2035 deadline marker is not a change, so it is not an entry.
    expect(f.body).not.toContain("event/2");
  });

  it("keep Borough Book's RSS item ids", async () => {
    const s = await site("borough-book");
    const f = buildFeed(s.views, "all", "", { config: s.config, w: words(s.config, "en"), today: s.today }, "rss");
    expect(xmlOk(f.body)).toBe(true);
    expect(f.path).toBe("/promises/feed.xml");
    expect(f.body).toContain('<guid isPermaLink="false">tag:borough-ledger,2026:promise/lab-2026-affordable-homes/event/1</guid>');
    expect(f.body).toContain("<pubDate>Mon, 14 Sep 2026 12:00:00 GMT</pubDate>");
  });

  it("include rewordings and replies, in the reader's language, and mark entries in other languages", async () => {
    const s = await site("synthetic-bilingual");
    const en = buildFeed(s.views, "promise", "example-governor-schools-2028", { config: s.config, w: words(s.config, "en"), today: s.today }, "atom");
    expect(en.body).toContain("<id>tag:example.org,2026:promise/example-governor-schools-2028/version/2#en</id>");
    expect(en.body).toContain("Was: “By the end of 2027 we will build a hundred new schools in the region.”");
    const ru = buildFeed(s.views, "promise", "example-governor-schools-2028", { config: s.config, w: words(s.config, "ru"), today: s.today }, "atom");
    expect(ru.body).toContain("<id>tag:example.org,2026:promise/example-governor-schools-2028/version/2</id>");
    expect(ru.body).toContain("Срок перенесён");
  });

  it("leave out entries after the build day", async () => {
    const s = await site("public-ledger", "2026-07-01");
    const f = buildFeed(s.views, "all", "", { config: s.config, w: words(s.config, "en"), today: "2026-07-01" }, "atom");
    expect(f.body).not.toContain("2026-07-22T");
  });

  it("need a fixed tag, and drop characters XML cannot hold", async () => {
    const s = await site("public-ledger");
    expect(() => tagUri({ ...s.config, publish: { feeds: "atom" } }, "x")).toThrow("publish.tag is needed");
    expect(xmlEscape("a\u0000b & <c>")).toBe("ab &amp; &lt;c&gt;");
  });
});

describe("structured data", () => {
  it("describes a card as an Article whose main entity is the quotation, never a rating", async () => {
    const s = await site("public-ledger");
    const v = s.views.find((x) => x.id === "uk-nato-5pc-2035-2025")!;
    const [article, crumbs] = cardJsonLd(v, { config: s.config, w: words(s.config, "en"), today: s.today }) as [Record<string, unknown>, Record<string, unknown>];
    expect(article["@type"]).toBe("Article");
    expect(article.mainEntity).toMatchObject({ "@type": "Quotation", dateCreated: "2025-06-24", spokenByCharacter: { "@type": "Person", name: "Keir Starmer", affiliation: { name: "Labour Party" } } });
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(JSON.stringify(article)).not.toMatch(/ClaimReview|reviewRating|ratingValue/);
  });

  it("names an actor's official pages from its outside ids, when the configuration gives a template", async () => {
    const s = await site("public-ledger");
    const config = { ...s.config, actors: { ...s.config.actors, ids: { parliament_member_id: "https://members.parliament.uk/member/{id}" } } };
    const v = s.views.find((x) => x.id === "uk-nato-5pc-2035-2025")!;
    const [article] = cardJsonLd(v, { config, w: words(config, "en"), today: s.today }) as [{ mainEntity: { spokenByCharacter: { sameAs: string[] } } }];
    expect(article.mainEntity.spokenByCharacter.sameAs[0]).toBe("https://members.parliament.uk/member/4514");
  });

  it("is safe inside a script element", () => {
    expect(jsonLdText({ text: "</script><script>alert(1)" })).toBe('{"text":"\\u003c/script>\\u003cscript>alert(1)"}');
  });
});

describe("Markdown", () => {
  it("lays a card out facts first, as Public Ledger does", async () => {
    const s = await site("public-ledger");
    const md = cardMarkdown(s.views.find((x) => x.id === "uk-bus-cap-2-2026")!, { config: s.config, w: words(s.config, "en"), today: s.today });
    expect(md.split("\n").slice(0, 8)).toEqual([
      "# Cap bus fares at £2",
      "",
      "> “I’ve done it before and I will do it again now: a £2 cap on bus fares for millions across the country.”",
      ">",
      "> — Andy Burnham, Prime Minister, Labour Party; Government announcement, 22 July 2026",
      "",
      "- **Status:** In plan",
      "- **Status ladder:** Promised → In plan → Legislated → Funded → Delivering → Delivered",
    ]);
    expect(md).toContain("- **Cost a year:** Costs £0.36bn to £0.44bn a year (central £0.4bn by Department for Transport, official)");
    expect(md).toContain("(checked word for word at its source on 6 October 2026)");
    expect(md).toContain("- 1 January 2027, Deadline (to come): Due to start");
  });

  it("writes corrections in words, with the old and new values", async () => {
    const s = await site("public-ledger");
    const md = cardMarkdown(s.views.find((x) => x.id === "uk-nato-5pc-2035-2025")!, { config: s.config, w: words(s.config, "en"), today: s.today });
    expect(md).toContain("Corrected on 8 October 2026: the cost range in version 1.");
    expect(md).toContain("Was: Costs £32.4bn to £39.6bn a year. Now: Costs £36bn to £44bn a year.");
  });

  it("shows our translation with the original words beside it", async () => {
    const s = await site("synthetic-bilingual");
    const md = cardMarkdown(s.views.find((x) => x.id === "example-party-roads-2026")!, { config: s.config, w: words(s.config, "en"), today: s.today });
    expect(md).toContain("> Our translation. Original: “Мы отремонтируем все сельские дороги, ведущие к школам и больницам.”");
  });

  it("lists every published card in llms.txt", async () => {
    const s = await site("public-ledger");
    const text = llmsTxt(s.views, { config: s.config, w: words(s.config, "en"), today: s.today });
    expect(text.startsWith("# Public Ledger\n\n> What UK governments")).toBe(true);
    expect(text.match(/^- \[.*\]\(https:\/\/ledgergov\.uk\/promise\//gm)).toHaveLength(54);
  });
});

describe("sitemap and IndexNow", () => {
  it("lists every page, with each language's address", async () => {
    const s = await site("synthetic-bilingual");
    const entries = sitemapEntries(s.views, s.config, s.today);
    expect(entries[0]).toMatchObject({ loc: "https://example.org/promises", alternates: { ru: "https://example.org/promises", en: "https://example.org/en/promises" } });
    expect(entries.some((e) => e.loc.includes("example-party-c-tax-2026"))).toBe(false);
    expect(xmlOk(sitemapXml(entries))).toBe(true);
  });

  it("names the pages a change touches, and submits only the site's own", async () => {
    const s = await site("public-ledger");
    const before = s.views.map((v) => v.card);
    const changed = s.views.map((v) => (v.id === "uk-bus-cap-2-2026" ? { ...v, card: { ...v.card, status: "funded" } } : v));
    expect(changedPages(before, changed, s.config)).toEqual([
      "https://ledgergov.uk/actor/andy-burnham",
      "https://ledgergov.uk/actor/labour",
      "https://ledgergov.uk/promise/uk-bus-cap-2-2026",
      "https://ledgergov.uk/promises",
      "https://ledgergov.uk/promises/area/transport-and-economy",
    ]);
    expect(indexNowPayload(s.config, "a1b2c3d4e5f6a7b8", ["https://ledgergov.uk/promises", "https://evil.example/x"]).urlList).toEqual(["https://ledgergov.uk/promises"]);
    expect([canSubmit("https://ledgergov.uk"), canSubmit("http://localhost:3000"), canSubmit("https://x.localhost")]).toEqual([true, false, false]);
  });
});

describe("open data", () => {
  it("has published cards only, as JSON and CSV", async () => {
    const s = await site("synthetic-bilingual");
    const json = openDataJson(s.views, s.config, s.today);
    expect(json.cards).toHaveLength(3);
    const csv = openDataCsv(s.views, s.config, words(s.config, "ru"), s.today);
    expect(csv.split("\r\n")[0]!.startsWith("id,url,headline,actor_id")).toBe(true);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(4);
    expect(csv).not.toContain("example-party-c-tax-2026");
  });

  it("quotes fields that need it and defuses spreadsheet formulas", () => {
    expect([csvField('He said "no", twice'), csvField("=HYPERLINK(1)"), csvField(-12.5), csvField(null)]).toEqual(['"He said ""no"", twice"', "'=HYPERLINK(1)", "-12.5", ""]);
  });
});

describe("publishing a whole site", () => {
  it("writes every file once, never a draft, in every language", async () => {
    for (const name of ["public-ledger", "borough-book", "synthetic-bilingual"] as const) {
      const s = await site(name);
      const files = publishFiles(s);
      expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
      for (const f of files) {
        if (f.path.endsWith(".xml") || f.path.endsWith(".rss")) expect(xmlOk(f.body), f.path).toBe(true);
        for (const d of s.views.filter((v) => v.where === "drafts")) expect(f.body, f.path).not.toContain(d.id);
      }
    }
    const s = await site("synthetic-bilingual");
    const files = publishFiles(s).map((f) => f.path);
    expect(files).toContain("/en/llms-full.txt");
    expect(files).toContain("/feeds/all.rss");
    expect(files).toContain("/en/promise/example-pensions-2027.md");
  });

  it("needs the site's address", async () => {
    const s = await site("public-ledger");
    expect(() => absolute({ site: { ...s.config.site, url: undefined } }, "/")).toThrow("site.url is needed");
    expect(cardViews([], new Map())).toEqual([]);
  });
});

describe("what Public Ledger showed the dry run was missing", () => {
  it("writes an amount under £0.1bn in millions, so a small range stays a range", async () => {
    const gbp = resolveConfig({ site: { name: "T" }, money: { currency: "GBP", unit: "bn" } });
    const en = words(gbp, "en");
    expect(costText(en, gbp, { range: [0.014, 0.016, 0.018] })).toBe("Costs £14m to £18m a year");
    expect(money(en, gbp, -0.05)).toBe("−£50m");
    expect(money(en, gbp, 0.36)).toBe("£0.36bn");
  });

  it("names who made a cost and who brought the outcome about", async () => {
    const s = await site("public-ledger");
    const v = s.views.find((x) => x.id === "uk-snp-two-child-cap-2024")!;
    const md = cardMarkdown(v, { config: s.config, w: words(s.config, "en"), today: s.today });
    expect(md).toContain("- **Status:** Delivered, brought about by HM Government (The UK Government removed the limit; the SNP is not in government at Westminster.)");
    expect(v.responsible?.id).toBe("hm-government");
  });

  it("gives every actor and every configured area a feed, even with no cards yet", async () => {
    const { config, contentDir } = await loadConfig(join(ROOT, "fixtures", "public-ledger", "openpromises.config.ts"));
    const r = validateContent(readContent(folderSource(contentDir), config).input);
    const files = publishFiles({ config, views: cardViews(r.cards, r.actors), today: "2026-10-09", actors: r.actors });
    const feeds = files.map((f) => f.path).filter((p) => p.startsWith("/feeds/"));
    expect(feeds).toContain("/feeds/actor/welsh-government.xml");
    expect(feeds).toContain("/feeds/area/culture.xml");
    const empty = files.find((f) => f.path === "/feeds/actor/welsh-government.xml")!.body;
    expect(empty).toContain("<title type=\"text\">Public Ledger: promises by Welsh Government</title>");
    expect(empty).not.toContain("<entry>");
  });

  it("puts the site's own entries in the feeds of their card, and the rest only in the feed of everything", async () => {
    const s = await site("public-ledger");
    const entry = (id: string, card?: string) => ({ id: tagUri(s.config, id), title: id, date: "2026-10-08", link: "https://ledgergov.uk/", content: id, ...(card ? { card } : {}) });
    const site_ = { entries: [entry("promise/uk-nato-5pc-2035-2025/contract/x/0", "uk-nato-5pc-2035-2025"), entry("edition/EFO-2026-03")] };
    const ctx = { config: s.config, w: words(s.config, "en"), today: s.today, siteEntries: site_.entries };
    const ids = (kind: "all" | "promise" | "actor" | "area", key: string) => [...buildFeed(s.views, kind, key, ctx, "atom").body.matchAll(/<id>(tag:[^<]+)<\/id>/g)].map((m) => m[1]!);
    expect(ids("promise", "uk-nato-5pc-2035-2025")).toContain("tag:ledgergov.uk,2026:promise/uk-nato-5pc-2035-2025/contract/x/0");
    expect(ids("actor", "labour")).toContain("tag:ledgergov.uk,2026:promise/uk-nato-5pc-2035-2025/contract/x/0");
    expect(ids("area", "defence")).not.toContain("tag:ledgergov.uk,2026:edition/EFO-2026-03");
    expect(ids("all", "")).toContain("tag:ledgergov.uk,2026:edition/EFO-2026-03");
    expect(ids("promise", "uk-bus-cap-2-2026")).not.toContain("tag:ledgergov.uk,2026:promise/uk-nato-5pc-2035-2025/contract/x/0");
  });

  it("adds the site's own Markdown sections after the cost, shows a quote's licence and a reviewer's current name", async () => {
    const s = await site("public-ledger");
    const config = resolveConfig({
      ...(await import("../../../fixtures/public-ledger/openpromises.config")).default,
      quotes: { archive: "optional", require: "editor", licences: [{ hosts: ["gov.uk"], name: "Open Government Licence v3.0" }], otherLicence: "Rights stay with the publisher" },
      editorial: { renamed: { "Junior Editor": "AI Journalist" } },
    });
    const v = s.views.find((x) => x.id === "uk-bus-cap-2-2026")!;
    const md = cardMarkdown(v, { config, w: words(config, "en"), today: s.today, sections: (x) => (x.id === v.id ? [{ title: "Contracts behind delivery", lines: ["None linked yet."] }] : []) });
    expect(md.indexOf("## Contracts behind delivery")).toBeGreaterThan(md.indexOf("## About the cost"));
    expect(md.indexOf("## Contracts behind delivery")).toBeLessThan(md.indexOf("## Sources"));
    expect(md).toContain("checked word for word at its source on 6 October 2026; Open Government Licence v3.0)");
    expect(md).not.toContain("Junior Editor");
  });

  it("adds the new open-data columns at the end, so no column moves", async () => {
    const s = await site("public-ledger");
    const header = openDataCsv(s.views, s.config, words(s.config, "en"), s.today).split("\r\n")[0]!.split(",");
    expect(header.slice(-5)).toEqual(["last_updated", "cost_by_kind", "cost_by_name", "responsible_id", "brought_about_by_id"]);
  });
});
