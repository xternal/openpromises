import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { actorJsonLd, cardJsonLd, relatedCards, words } from "@openpromises/publish";
import { ActorIndex, AreaIndex, Breadcrumbs, ComingUp, JsonLd, Ladder, PromiseCard, PromiseList, StatusPill } from "@openpromises/react";
import { site } from "../../publish/test/helpers";

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("PromiseCard", () => {
  it("renders a Public Ledger card in its reading order, with no script", async () => {
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
    expect(html(<Breadcrumbs config={s.config} items={[{ name: "Public Ledger", href: "/" }, { name: "Promises", href: "/promises" }]} />)).toContain('<span aria-current="page">Promises</span>');
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
