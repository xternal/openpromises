import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { relatedCards } from "@openpromises/publish";
import { Breadcrumbs, PromiseCard } from "@openpromises/react";
import { ACCEPTED, MUTATIONS } from "./ledgergov";
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
    const run = await runEngine(join(import.meta.dirname, "ledgergov.config.ts"), CONTENT);
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
    const all = [
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
