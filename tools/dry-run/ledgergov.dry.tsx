import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { relatedCards } from "@openpromises/publish";
import { Breadcrumbs, PromiseCard } from "@openpromises/react";
import { ACCEPTED, MUTATIONS, OWN } from "./ledgergov";
import {
  accessibilityArea,
  cardPagesArea,
  checksArea,
  feedsArea,
  fetchCards,
  historyArea,
  llmsArea,
  markdownArea,
  openDataArea,
  readingArea,
  sitemapArea,
  structuredDataArea,
  titlesArea,
} from "./lib/areas";
import { engineVersion, runEngine } from "./lib/engine";
import { headCommit, replayHistory } from "./lib/history";
import { Live } from "./lib/live";
import { runMutations } from "./lib/mutations";
import { siteParts } from "./lib/siteparts";
import { applyAccepted, writeReport, type Finding } from "./lib/report";

/**
 * Dry run for Public Ledger (ledgergov.uk): is everything OpenPromises would
 * publish for it as good as what the site serves now, or better? Reads the
 * site's checkout and its live pages; changes neither. tools/dry-run/README.md.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const REPO = resolve(process.env.PUBLIC_LEDGER_DIR ?? join(ROOT, "../public-gov-ledger/open-pnl"));
const CONTENT = join(REPO, "content");
const LIVE = process.env.DRY_RUN_LIVE ?? "https://ledgergov.uk";
const OUT = join(ROOT, ".dry-run", "ledgergov");
const OFFLINE = process.env.DRY_RUN_OFFLINE === "1";

const AREAS = [
  "Reading the cards",
  "Checks",
  "History",
  "Feeds",
  "Markdown",
  "llms.txt",
  "Sitemap",
  "Structured data",
  "Card pages",
  "Accessibility",
  "Titles and descriptions",
  "Open data",
] as const;

let findings: Finding[] = [];

describe.skipIf(!existsSync(CONTENT))(`dry run: Public Ledger (${LIVE})`, () => {
  beforeAll(async () => {
    const started = new Date();
    const live = new Live(LIVE, join(OUT, "cache"), OFFLINE);
    const configFile = join(import.meta.dirname, "ledgergov.config.ts");
    // What the site keeps making itself (contract and figures entries, contracts sections), handed to the engine as its own code would.
    const first = await runEngine(configFile, CONTENT);
    const own = await siteParts(live, "/feeds", (await fetchCards(first, live)).markdown, OWN);
    const run = await runEngine(configFile, CONTENT, { site: { entries: own.entries, sections: (v) => own.sections.get(v.id) ?? [] } });
    const L = run.config.locales.default;
    const html = new Map(
      run.published.map((v) => [
        v.id,
        renderToStaticMarkup(
          <main>
            <Breadcrumbs config={run.config} items={[{ name: run.config.site.name, href: "/" }, { name: "Promises", href: "/promises" }, { name: v.id, href: `/promise/${v.id}` }]} />
            <PromiseCard view={v} config={run.config} locale={L} today={run.today} related={relatedCards(v, run.published)} />
          </main>,
        ),
      ]),
    );
    const pages = await fetchCards(run, live);
    // Both sides as plain files, to read or diff: engine/ is what the engine would publish, live/ what the site serves.
    const save = (dir: string, files: Iterable<[string, string]>) => {
      rmSync(join(OUT, dir), { recursive: true, force: true });
      for (const [path, body] of files) {
        const file = join(OUT, dir, path.replace(/^\//, ""));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, body);
      }
    };
    save("engine", [...[...run.files.values()].map((f): [string, string] => [f.path, f.body]), ...[...html].map(([id, h]): [string, string] => [`promise/${id}.html`, h])]);
    save("live", [...[...pages.markdown].map(([id, md]): [string, string] => [`promise/${id}.md`, md]), ...[...pages.card].map(([id, p]): [string, string] => [`promise/${id}.html`, p.mainHtml])]);
    const kinds = new Map<string, number>();
    for (const e of own.entries) {
      const kind = /^tag:[^:]+:(?:promise\/[^/]+\/)?([a-z]+)\//.exec(e.id)?.[1] ?? "other";
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    }
    const siteOwn: Finding[] = [
      {
        area: "Feeds",
        verdict: "site",
        what: `The site's own entries stay the site's to make: ${[...kinds].map(([k, n]) => `${n} "${k}"`).join(", ")}. The dry run handed them to the engine (PublishInput.site.entries) as the site's code would; the comparison below shows where they land.`,
      },
      {
        area: "Markdown",
        verdict: "site",
        what: `The site's own sections stay the site's to make: ${[...own.sections.values()].flat().length} (${OWN.sections.join(", ")}), handed to the engine (PublishInput.site.sections); they follow "About the cost", as on the card page.`,
      },
    ];
    const all = [
      ...siteOwn,
      ...(await readingArea(run, live)),
      ...checksArea(run, runMutations(CONTENT, run.config, MUTATIONS)),
      ...historyArea(replayHistory(CONTENT, run.config, "HEAD")),
      ...(await feedsArea(run, live, "/feeds")),
      ...markdownArea(run, pages),
      ...(await llmsArea(run, live)),
      ...(await sitemapArea(run, live)),
      ...structuredDataArea(run, pages),
      ...cardPagesArea(run, pages, { html }),
      ...(await accessibilityArea(run, live, { html })),
      ...titlesArea(run, pages),
      ...(await openDataArea(run, live, "/api/v1")),
    ];
    findings = applyAccepted(all, ACCEPTED);
    const md = writeReport(
      OUT,
      {
        site: "Public Ledger",
        live: LIVE,
        content: REPO,
        contentCommit: headCommit(REPO),
        engine: engineVersion(ROOT),
        started: `${started.toISOString()} (${started.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })} UK time)`,
        pagesFetched: live.count,
        offline: OFFLINE,
      },
      AREAS,
      findings,
    );
    console.log(`\n${md.split("\n## ")[0]}\nFull report: ${join(OUT, "report.md")}\n`);
  }, 20 * 60_000);

  it.each(AREAS)("%s: good or better", (area) => {
    expect(findings.filter((f) => f.area === area && f.verdict === "worse").map((f) => f.what)).toEqual([]);
  });
});
