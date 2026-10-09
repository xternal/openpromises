import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { relatedCards } from "@openpromises/publish";
import { ActorIndex, AreaIndex, Breadcrumbs, ComingUp, PromiseCard, PromiseList } from "@openpromises/react";
import { site, type SiteName } from "../../publish/test/helpers";

/** Run axe-core (WCAG 2.1 A and AA, and best practice) on a whole page. Colour contrast needs a browser's layout; contrast.test.ts checks the colours. */
async function violations(page: string, lang: string) {
  const dom = new JSDOM(`<!doctype html><html lang="${lang}"><head><title>Test page</title></head><body>${page}</body></html>`, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(axe.source);
  const result = await (dom.window as unknown as { axe: typeof axe }).axe.run(dom.window.document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
}

describe.each([
  ["public-ledger", "uk-nato-5pc-2035-2025", "en"],
  ["borough-book", "hf-free-home-care", "en"],
  ["synthetic-bilingual", "example-governor-schools-2028", "ru"],
  ["synthetic-bilingual", "example-governor-schools-2028", "en"],
] as const)("accessibility: %s %s (%s)", (name, id, locale) => {
  it("has no WCAG A or AA problems axe can find on a card page", async () => {
    const s = await site(name as SiteName);
    const v = s.views.find((x) => x.id === id)!;
    const page = renderToStaticMarkup(
      <>
        <header>
          <Breadcrumbs config={s.config} locale={locale} items={[{ name: s.config.site.name, href: "/" }, { name: "Promises", href: "/promises" }, { name: v.id, href: `/promise/${v.id}` }]} />
        </header>
        <main>
          <PromiseCard view={v} config={s.config} locale={locale} today={s.today} related={relatedCards(v, s.views)} markToday />
        </main>
      </>,
    );
    expect(await violations(page, locale)).toEqual([]);
  });

  it("has no WCAG A or AA problems axe can find on a list page", async () => {
    const s = await site(name as SiteName);
    const page = renderToStaticMarkup(
      <>
        <header>
          <ActorIndex views={s.views} config={s.config} locale={locale} />
          <AreaIndex views={s.views} config={s.config} locale={locale} />
        </header>
        <main>
          <h1>Promises</h1>
          <ComingUp views={s.views} config={s.config} locale={locale} today={s.today} />
          <PromiseList views={s.views} config={s.config} locale={locale} today={s.today} id="cards" />
        </main>
      </>,
    );
    expect(await violations(page, locale)).toEqual([]);
  });
});

describe("the stylesheet", () => {
  it("is shipped with the package", () => {
    expect(readFileSync(join(import.meta.dirname, "..", "styles.css"), "utf8")).toContain("--op-bg: #101820;");
  });
});
