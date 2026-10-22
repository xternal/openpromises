import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { actorJsonLd, cardJsonLd, relatedCards, words } from "@openpromises/publish";
import { ActorIndex, AreaIndex, Breadcrumbs, ComingUp, JsonLd, Ladder, PromiseCard, PromiseList, StatusPill } from "@openpromises/react";
import { site } from "../../publish/test/helpers";

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("PromiseCard", () => {
  it("shows the forecast at the time beside the target (decision 36)", async () => {
    const s = await site("public-ledger");
    const v = s.views.find((x) => x.id === "uk-bus-cap-2-2026")!;
    const baseline = {
      value: 2.8,
      unit: "£",
      for: "2027-03-31",
      by: { kind: "independent" as const, name: "Transport Research Unit" },
      published_on: "2026-07-01",
      source: { title: "Bus fares outlook", url: "https://example.org/outlook" },
    };
    const current = { ...v.current, parameters: { ...v.current.parameters!, baseline } };
    const out = html(<PromiseCard view={{ ...v, current, card: { ...v.card, versions: [...v.card.versions.slice(0, -1), current] } }} config={s.config} today={s.today} />);
    expect(out).toContain("Forecast at the time");
    expect(out).toContain('2.8 £ by 31 March 2027, as forecast by Transport Research Unit on 1 July 2026, before the promise (<a href="https://example.org/outlook">Bus fares outlook</a>)');
  });

  it("renders a LedgerGov.UK card in its reading order, with no script", async () => {
    const s = await site("public-ledger");
    const v = s.views.find((x) => x.id === "uk-bus-cap-2-2026")!;
    const out = html(<PromiseCard view={v} config={s.config} today={s.today} related={relatedCards(v, s.views)} />);
    expect(out).not.toContain("<script");
    const order = ["Cap bus fares at £2", "“I’ve done it before", "At a glance", "Where it stands", "What has happened", "About the cost", "More detail", "Related promises"].map((t) => out.indexOf(t));
    expect(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1]!))).toBe(true);
    expect(out).toContain('<li aria-current="step"><span class="op-ladder__bar" aria-hidden="true"></span><span class="op-ladder__label">In plan</span></li>');
    expect(out).toContain('<dd class="op-fact__figure">£0.4bn</dd><dd class="op-muted">range £0.36bn to £0.44bn</dd><dd class="op-muted">Central figure: Department for Transport (official)</dd>');
    expect(out).toContain("(to come)");
    expect(out).toContain('<details class="op-fold"><summary>Sources (6)</summary>');
  });

  it("links the quote's source and its archived copy", async () => {
    const s = await site("borough-book");
    const v = s.views.find((x) => x.id === "lab-2026-affordable-homes")!;
    const out = html(<PromiseCard view={v} config={s.config} today={s.today} />);
    expect(out).toContain(`<a href="${v.current.source_url}" rel="noopener noreferrer">source</a>`);
    expect(v.current.archived_url).toBeTruthy();
    expect(out).toContain(`<a href="${v.current.archived_url}" rel="noopener noreferrer">archived copy</a>`);
  });

  it("says how far the card has been verified, naming only the editors who chose it (decision 23)", async () => {
    const s = await site("public-ledger");
    const v = s.views.find((x) => x.id === "uk-bus-cap-2-2026")!;
    const reviews = [...(v.card.reviews ?? []), { by: "Ada", kind: "editor" as const, on: "2026-10-12", approves: true }, { by: "Ben", kind: "editor" as const, on: "2026-10-12", approves: true }];
    const shown = { ...v, card: { ...v.card, reviews }, verification: { level: "editors" as const, named: ["Ada"], counted: 1, automated: ["Junior Editor"] } };
    const out = html(<PromiseCard view={shown} config={s.config} today={s.today} />);
    expect(out).toContain('<span class="op-verified op-verified--editors">Verified by Ada and 1 independent editor, checked by Junior Editor</span>');
    expect(out).toContain("Approved by Ada, editor, on 12 October 2026");
    expect(out).toContain("Approved by an independent editor on 12 October 2026");
    expect(out).not.toContain("Ben");
    const unchecked = { ...v, verification: { level: "none" as const, named: [], counted: 0, automated: [] } };
    expect(html(<PromiseCard view={unchecked} config={s.config} today={s.today} />)).toContain('<span class="op-verified op-verified--none">Not yet verified by an editor</span>');
    expect(html(<PromiseCard view={unchecked} config={s.config} today={s.today} verification={false} />)).not.toContain("op-verified");
    expect(html(<PromiseCard view={v} config={s.config} today={s.today} />)).not.toContain("op-verified");
  });

  it("says what was checked of the quote: an editor's check at the source, else a machine's match in a stored copy, else not yet (decision 35)", async () => {
    const s = await site("public-ledger");
    const v = s.views.find((x) => x.id === "uk-bus-cap-2-2026")!;
    const versions = v.card.versions.map(({ quote_checked_on: _, ...x }) => x);
    const unchecked = { ...v, card: { ...v.card, versions }, current: versions.at(-1)! };
    const out = (view: typeof v, locale?: string) => html(<PromiseCard view={view} config={s.config} today={s.today} {...(locale ? { locale } : {})} />);
    const checked = out(v);
    expect(checked).toContain("<span>Quote checked word for word at its source on 6 October 2026</span>");
    expect(checked).toContain("<li>Version 1, 22 July 2026: Quote checked word for word at its source on 6 October 2026</li>");
    const matched = out({ ...unchecked, quoteMatched: [true] });
    expect(matched).toContain("<span>Quote matches a stored copy of its source word for word</span>");
    expect(matched).toContain("<li>Version 1, 22 July 2026: Quote matches a stored copy of its source word for word</li>");
    expect(matched).not.toContain("not yet checked");
    const neither = out(unchecked);
    expect(neither).toContain("<span>Quote not yet checked against its source</span>");
    expect(neither).not.toContain("<li>Version 1");
    expect(out({ ...unchecked, quoteMatched: [true] }, "ru")).toContain("Цитата дословно совпадает с сохранённой копией источника");
  });

  it("says who brought the outcome about, beside the status", async () => {
    const s = await site("public-ledger");
    const out = html(<PromiseCard view={s.views.find((x) => x.id === "uk-snp-two-child-cap-2024")!} config={s.config} today={s.today} />);
    expect(out).toContain('<span title="The UK Government removed the limit; the SNP is not in government at Westminster.">Brought about by HM Government</span>');
  });

  it("shows corrections in words, with the old and new values", async () => {
    const s = await site("public-ledger");
    const out = html(<PromiseCard view={s.views.find((x) => x.id === "uk-nato-5pc-2035-2025")!} config={s.config} today={s.today} />);
    expect(out).toContain("Corrections: what we fixed, in public (4)");
    expect(out).toContain("Was: Costs £32.4bn to £39.6bn a year");
  });

  it("marks today on the timeline only when asked", async () => {
    const s = await site("public-ledger");
    const v = s.views.find((x) => x.id === "uk-bus-cap-2-2026")!;
    expect(html(<PromiseCard view={v} config={s.config} today={s.today} />)).not.toContain("We are here");
    expect(html(<PromiseCard view={v} config={s.config} today={s.today} markToday />)).toContain('<li data-today="true">');
  });

  it("speaks the reader's language, shows our translation beside the original, and diffs a reworded promise", async () => {
    const s = await site("synthetic-bilingual");
    const v = s.views.find((x) => x.id === "example-governor-schools-2028")!;
    const en = html(<PromiseCard view={v} config={s.config} locale="en" today={s.today} />);
    expect(en).toContain('lang="en">“A hundred new schools will open in the region by the end of 2028.”</h1>');
    expect(en).toContain('Our translation. Original: <span lang="ru">“Сто новых школ появятся в области до конца 2028 года.”</span>');
    expect(en).toContain("At least 100 школ by 31 December 2028");
    expect(en).toContain("Deadline moved");
    const ru = html(<PromiseCard view={v} config={s.config} locale="ru" today={s.today} />);
    expect(ru).toContain('lang="ru">«Сто новых школ появятся в области до конца 2028 года.»</h1>');
    expect(ru).toContain("<del>");
    expect(ru).toContain("Что произошло");
  });

  it("says a draft is a draft", async () => {
    const s = await site("synthetic-bilingual");
    const out = html(<PromiseCard view={s.views.find((x) => x.where === "drafts")!} config={s.config} today={s.today} />);
    expect(out).toContain("Черновик: ждёт редакторов, не опубликован");
  });

  it("puts the site's own actions and module sections in their places", async () => {
    const s = await site("borough-book");
    const v = s.views.find((x) => x.id === "lab-2026-affordable-homes")!;
    const out = html(
      <PromiseCard view={v} config={s.config} today={s.today} actions={<a href="/follow">Follow</a>}>
        <section id="decisions">Council decisions</section>
      </PromiseCard>,
    );
    expect(out.indexOf("Follow")).toBeLessThan(out.indexOf("Council decisions"));
    expect(out.indexOf("Council decisions")).toBeLessThan(out.indexOf("More detail"));
    expect(out).toContain('href="/party/labour"');
    expect(out).toContain('href="/topic/housing-and-homelessness"');
  });
});

describe("lists and indexes", () => {
  it("list cards as links, with where each party stands", async () => {
    const s = await site("borough-book");
    const out = html(<PromiseList views={s.views} config={s.config} today={s.today} id="cards" />);
    expect(out.match(/<li data-op-card=""/g)).toHaveLength(18);
    expect(out).toContain('data-actor="conservative"');
    expect(out).not.toContain('data-actor="labour labour"');
    const withStanding = html(<PromiseList views={s.views} config={s.config} today={s.today} actors={new Map(s.views.flatMap((v) => [[v.actor.id, v.actor] as const]))} />);
    expect(withStanding).toContain("In opposition");
    expect(withStanding).toContain("In power");
    expect(html(<PromiseList views={[]} config={s.config} today={s.today} />)).toContain("No promises match.");
  });

  it("show what is coming up, nearest first, and late ones as late", async () => {
    const s = await site("public-ledger");
    const out = html(<ComingUp views={s.views} config={s.config} today="2026-10-09" months={3} />);
    expect(out).toContain("due from October 2026 to December 2026");
    const dates = [...out.matchAll(/<time dateTime="([^"]+)"/g)].map((m) => m[1]!);
    expect(dates).toEqual([...dates].sort());
  });

  it("mark the page the reader is on", async () => {
    const s = await site("public-ledger");
    expect(html(<ActorIndex views={s.views} config={s.config} current="labour" />)).toContain('<a href="/actor/labour" aria-current="page">Labour Party</a>');
    expect(html(<AreaIndex views={s.views} config={s.config} current="health" />)).toContain('aria-current="page">Health</a>');
    expect(html(<Breadcrumbs config={s.config} items={[{ name: "LedgerGov.UK", href: "/" }, { name: "Promises", href: "/promises" }]} />)).toContain('<span aria-current="page">Promises</span>');
  });

  it("render the ladder for an unscoreable card as a note, and pills with words", async () => {
    const s = await site("public-ledger");
    const v = s.views.find((x) => x.card.status === "unscoreable")!;
    expect(html(<Ladder view={v} config={s.config} />)).toContain("Unscoreable: too vague to track.");
    expect(html(<StatusPill status="failed" config={s.config} />)).toBe('<span class="op-pill" data-category="finished">Not met</span>');
  });

  it("print structured data safely", async () => {
    const s = await site("public-ledger");
    const v = s.views[0]!;
    const out = html(<JsonLd data={[...cardJsonLd(v, { config: s.config, w: words(s.config, "en"), today: s.today }), ...actorJsonLd(v.actor, v.party, [v], { config: s.config, w: words(s.config, "en"), today: s.today })]} />);
    expect(out.startsWith('<script type="application/ld+json">[{"@context":"https://schema.org","@type":"Article"')).toBe(true);
  });
});

describe("Comparisons (decision 28)", () => {
  it("shows the first units and a table of them all, with prices and sources, and nothing without a basket", async () => {
    const { resolveConfig } = await import("@openpromises/core");
    const { Comparisons } = await import("@openpromises/react");
    const s = await site("public-ledger");
    const source = { title: "Pay scales", url: "https://example.org/pay", locator: "Table 1", quality: "sourced" };
    const unit = (id: string, one: string, other: string, cost: [number, number, number]) => ({ id, label: { en: { one, other } }, cost, type: "recurring" as const, price_year: "2026-27", source });
    const comparisons = resolveConfig({
      site: { name: "T" },
      comparisons: { units: [unit("nurse", "nurse", "nurses", [32_000, 35_000, 39_000]), unit("teacher", "teacher", "teachers", [34_000, 47_000, 53_000]), unit("pension", "pension", "pensions", [12_000, 12_500, 13_000])], show: 2 },
    }).comparisons;
    const v = s.views.find((x) => x.id === "uk-bus-cap-2-2026")!;
    const out = renderToStaticMarkup(<Comparisons view={v} config={{ ...s.config, comparisons }} />);
    expect(out).toContain("<li>Equal to the cost of 9,200–14,000 nurses</li>");
    expect(out).not.toContain("<li>Equal to the cost of 28,000–37,000 pensions</li>");
    expect(out).toContain("<td>Equal to the cost of 28,000–37,000 pensions</td>");
    expect(out).toContain('<a href="https://example.org/pay" rel="noopener noreferrer">Pay scales</a>, Table 1');
    expect(renderToStaticMarkup(<PromiseCard view={v} config={{ ...s.config, comparisons }} today={s.today} />)).toContain("What the cost compares with");
    expect(renderToStaticMarkup(<Comparisons view={v} config={s.config} />)).toBe("");
  });

  it("puts the comparisons beside the cost section, not inside it, and shows them for a bare range", async () => {
    const { resolveConfig } = await import("@openpromises/core");
    const s = await site("public-ledger");
    const source = { title: "Pay scales", url: "https://example.org/pay", quality: "sourced" };
    const comparisons = resolveConfig({
      site: { name: "T" },
      comparisons: {
        units: (["nurse", "teacher", "pension"] as const).map((id) => ({ id, label: { en: { one: id, other: `${id}s` } }, cost: [32_000, 35_000, 39_000] as [number, number, number], type: "recurring" as const, price_year: "2026-27", source })),
      },
    }).comparisons;
    const v = s.views.find((x) => x.id === "uk-bus-cap-2-2026")!;
    const config = { ...s.config, comparisons };
    const out = renderToStaticMarkup(<PromiseCard view={v} config={config} today={s.today} />);
    const cost = out.indexOf(`<h2 id="op-cost-${v.id}">`);
    const compare = out.indexOf(`<h2 id="op-compare-${v.id}">`);
    expect(cost).toBeGreaterThan(-1);
    expect(compare).toBeGreaterThan(out.indexOf("</section>", cost));

    const { note, method, sources, ...range } = v.current.parameters!.cost!;
    void note, void method, void sources;
    const bare = { ...v, current: { ...v.current, parameters: { ...v.current.parameters, cost: range } } };
    const shown = renderToStaticMarkup(<PromiseCard view={bare} config={config} today={s.today} />);
    expect(shown).not.toContain(`id="op-cost-${v.id}"`);
    expect(shown).toContain("What the cost compares with");
  });
});

describe("what delivery takes (decision 28)", () => {
  it("shows staff, time and the steps done at a glance, in the reader's language", async () => {
    const s = await site("synthetic-bilingual");
    const v = s.views.find((x) => x.where === "promises")!;
    const sources = [{ title: "Источник", url: "https://example.org/w" }];
    const estimate = {
      people: { staff: { range: [600, 650, 700] as [number, number, number], unit: { ru: "учителей", en: "teachers" }, sources } },
      path: [{ step: "budget_line" }, { step: "recruitment" }],
    };
    const shown = { ...v, current: { ...v.current, parameters: { ...v.current.parameters!, estimate } } };
    const ru = renderToStaticMarkup(<PromiseCard view={shown} config={s.config} today={s.today} locale="ru" />);
    expect(ru).toContain("<dt>Нужно сотрудников</dt><dd>от 600 до 700 (учителей)</dd>");
    expect(ru).toContain("<dd>выполнено 0 из 2</dd>");
    expect(ru).toContain("Строка в бюджете");
    expect(renderToStaticMarkup(<PromiseCard view={shown} config={s.config} today={s.today} locale="en" />)).toContain("<dt>Staff needed</dt><dd>600 to 700 teachers</dd>");
  });
});

describe("PromiseStory (decision 29)", () => {
  it("lays the story out as one dated list, quotes the words, links the evidence", async () => {
    const { PromiseStory } = await import("@openpromises/react");
    const s = await site("public-ledger");
    const v = s.views.find((x) => x.id === "uk-bus-cap-2-2026")!;
    const out = html(<PromiseStory view={v} config={s.config} today={s.today} />);
    expect(out).toContain('<h2 id="op-story-uk-bus-cap-2-2026">The story so far</h2>');
    expect(out).toMatch(/<li class="op-story__item op-story__item--promised"><time dateTime="[\d-]+">[^<]+<\/time><strong class="op-story__label">Promised<\/strong><blockquote>“/);
    expect(out).toContain('rel="noopener noreferrer">source</a>');
  });
});

describe("PromiseSpotlight (decision 30)", () => {
  it("puts the count, the latest changes and what is due next on the first screen, each a link to its card", async () => {
    const { PromiseSpotlight } = await import("@openpromises/react");
    const s = await site("public-ledger");
    const out = html(<PromiseSpotlight views={s.views} config={s.config} today={s.today} />);
    expect(out).toMatch(/<h2 id="op-spotlight">Promises<\/h2><p class="op-spotlight__count"><a href="\/promises">\d+ promises tracked<\/a>: /);
    expect(out).toContain("<h3>Latest changes</h3>");
    expect(out).toContain('<span class="op-row__open" aria-hidden="true">Open the promise →</span>');
    expect(out).toContain('<a href="/promises">All promises →</a>');
    expect(html(<PromiseSpotlight views={[]} config={s.config} today={s.today} />)).toBe("");
  });
});

describe("AreaCoverage (decision 33)", () => {
  it("lists every area, empty ones too, with where each one's promises stand", async () => {
    const { AreaCoverage } = await import("@openpromises/react");
    const s = await site("public-ledger");
    const one = s.views.filter((v) => v.actor.id === "andy-burnham");
    const out = html(<AreaCoverage views={one} config={s.config} />);
    expect(out).toContain('<h2 id="op-coverage">Promises by area</h2>');
    const values = s.config.areas.kind === "enum" ? s.config.areas.values : [];
    expect(out.match(/<tr data-empty="true">/g)?.length ?? 0).toBe(values.length - new Set(one.filter((v) => v.where === "promises").map((v) => v.card.area)).size);
    expect(out).toMatch(/<tr data-empty="true"><th scope="row">[^<]+<\/th><td>None recorded<\/td><td><\/td><\/tr>/);
    expect(out).toMatch(/<th scope="row"><a href="\/promises\/area\/[a-z-]+">[^<]+<\/a><\/th><td>\d+<\/td><td>\d+ [a-z ]+/);
    expect(html(<AreaCoverage views={[]} config={s.config} headingLevel={3} />)).toContain('<h3 id="op-coverage">Promises by area</h3>');
  });
});

describe("an actor's page (decision 34)", async () => {
  const { ActorTimeline, KeyPromises, PromisesByMonth } = await import("@openpromises/react");
  const s = await site("public-ledger");
  const burnham = s.views.filter((v) => v.actor.id === "andy-burnham");
  const today = "2026-10-20";

  it("KeyPromises: the open promises due next, with the days left, then the latest changes, each a link to its card", () => {
    const out = html(<KeyPromises views={burnham} config={s.config} today={today} recent={1} />);
    expect(out).toContain('<h2 id="op-key">Key promises</h2>');
    expect(out.indexOf("<h3>Due next</h3>")).toBeLessThan(out.indexOf("<h3>Latest changes</h3>"));
    expect(out).toContain(
      '<a class="op-key__card" href="/promise/uk-mental-health-strategy-2026"><span class="op-key__days">65 days left</span><span class="op-key__headline">Present a mental health strategy before Christmas</span><span class="op-key__meta">Due 24 December 2026, Health</span></a>',
    );
    expect(out).toContain('<a class="op-key__card" href="/promise/uk-electricity-vat-2026"><span class="op-key__change">Delivered 1 October 2026</span><span class="op-key__headline">Cut taxes on energy bills</span><span class="op-key__meta">Taxes</span></a>');
    // A deadline marker that has come is a change (lastChanged()), so a card is due today only without one.
    const unmarked = burnham.map((v) => ({ ...v, card: { ...v.card, events: v.card.events.filter((e) => e.type !== "deadline") } }));
    const onTheDay = html(<KeyPromises views={unmarked} config={s.config} today="2026-12-24" recent={1} headingLevel={3} />);
    expect(onTheDay).toContain('<h3 id="op-key">Key promises</h3>');
    expect(onTheDay).toContain('<h4>Due next</h4><ul class="op-key__list" data-list="due"><li><a class="op-key__card" href="/promise/uk-mental-health-strategy-2026"><span class="op-key__days">Due today</span>');
    expect(html(<KeyPromises views={[]} config={s.config} today={today} />)).toBe("");
  });

  it("ActorTimeline: deadlines above today, latest first; what happened below, newest first; undated promises apart", () => {
    const out = html(<ActorTimeline views={burnham} config={s.config} today={today} />);
    expect(out).not.toContain("<script");
    expect(out).toContain('<h2 id="op-actor-timeline">Promises over time</h2>');
    const order = ["2027-04-01", "2027-01-01", "2026-12-24", 'aria-current="date"', "2026-10-01", "2026-09-07", "2026-07-21"].map((t) => out.indexOf(t));
    expect(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1]!))).toBe(true);
    expect(out).toContain('<li class="op-actor-timeline__today" aria-current="date"><span class="op-actor-timeline__date">Today</span><time dateTime="2026-10-20">20 October 2026</time></li>');
    expect(out).toContain('<strong class="op-actor-timeline__label">Deadline, in 65 days</strong><ul class="op-actor-timeline__cards"><li><a href="/promise/uk-mental-health-strategy-2026">Present a mental health strategy before Christmas</a>');
    expect(out).toContain('<strong class="op-actor-timeline__label">Deadline</strong><ul class="op-actor-timeline__cards"><li><a href="/promise/uk-disabled-bus-pass-2026">');
    expect(out).toContain('<li data-mark="top"><span class="op-actor-timeline__dot" aria-hidden="true"></span><strong class="op-actor-timeline__label">Delivered</strong>');
    expect(out).toContain('<li data-mark="progress"><span class="op-actor-timeline__dot" aria-hidden="true"></span><strong class="op-actor-timeline__label">Promised and in plan</strong>');
    expect(out).not.toContain("No date given");
    const all = html(<ActorTimeline views={s.views} config={s.config} today={today} headingLevel={3} />);
    expect(all).toContain('<h3 id="op-actor-timeline">Promises over time</h3>');
    expect(all).toMatch(/<h4>No date given<\/h4><p class="op-muted">\d+ open promises name no deadline, so they never appear above today\.<\/p><ul><li><a href="\/promise\//);
    expect(html(<ActorTimeline views={[]} config={s.config} today={today} />)).toBe("");
  });

  it("PromisesByMonth: a labelled bar for each month, the current one so far, and the same numbers as a table", () => {
    const out = html(<PromisesByMonth views={burnham} config={s.config} today={today} />);
    expect(out).toContain('<h2 id="op-months">Promises made each month</h2>');
    expect(out).toContain('<ol class="op-months__bars" style="--op-months:4">');
    expect(out).toContain(
      '<li style="--op-bar:1"><span class="op-months__count" aria-hidden="true">2</span><span class="op-months__bar" aria-hidden="true"></span><span class="op-months__label" aria-hidden="true">Jul 2026</span><span class="op-sr-only">July 2026: 2 promises</span></li>',
    );
    expect(out).toContain('<span class="op-sr-only">August 2026: 1 promise</span>');
    expect(out).toContain('<li data-so-far="true" style="--op-bar:0"><span class="op-months__count" aria-hidden="true">0</span><span class="op-months__bar" aria-hidden="true"></span><span class="op-months__label" aria-hidden="true">Oct, so far</span>');
    expect(out).toContain('<details class="op-months__table"><summary>As a table</summary><table><thead><tr><th scope="col">Month</th><th scope="col">Promises made</th></tr></thead>');
    expect(out).toContain('<tr><th scope="row">October 2026, so far</th><td>0</td></tr>');
    expect(html(<PromisesByMonth views={[]} config={s.config} today={today} />)).toBe("");
  });

  it("says it in Russian", async () => {
    const b = await site("synthetic-bilingual");
    const out = html(
      <>
        <KeyPromises views={b.views} config={b.config} today={b.today} recent={1} />
        <ActorTimeline views={b.views} config={b.config} today={b.today} />
        <PromisesByMonth views={b.views} config={b.config} today={b.today} />
      </>,
    );
    for (const words of ["Главные обещания", "Скоро срок", "Хронология обещаний", "Сегодня", "Срок перенесён", "Обещания по месяцам", "на сегодня", "Таблицей"]) expect(out).toContain(words);
    expect(out).toMatch(/осталось \d+ дн/);
  });
});
