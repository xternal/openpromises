import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { paths, relatedCards } from "@openpromises/publish";
import { Breadcrumbs, PromiseCard } from "@openpromises/react";
import {
  accessibilityArea,
  cardPagesArea,
  checksArea,
  feedsArea,
  fetchCards,
  historyArea,
  liveFeedPaths,
  llmsArea,
  markdownArea,
  openDataArea,
  readingArea,
  sitemapArea,
  structuredDataArea,
  titlesArea,
} from "./areas";
import { engineVersion, runEngine } from "./engine";
import { headCommit, replayHistory } from "./history";
import { Live } from "./live";
import { runMutations, type Mutation } from "./mutations";
import { applyAccepted, writeReport, type Accepted, type Finding } from "./report";
import { siteParts } from "./siteparts";

/**
 * One site's dry run: everything OpenPromises would publish for it, against
 * what the live site serves now, area by area. Reads the site's checkout and
 * its live pages; changes neither. Each site gives a profile (ledgergov.ts,
 * boroughbook.ts) and calls dryRun from its own *.dry.tsx.
 */

export interface SiteProfile {
  /** "Public Ledger" */
  name: string;
  /** The folder under .dry-run/: "ledgergov". */
  slug: string;
  /** The live site, unless DRY_RUN_LIVE says otherwise. */
  live: string;
  /** The site's checkout: an environment variable naming it, and where it usually is, relative to this repository. */
  repo: { env: string; default: string };
  /** The site's configuration for the move. */
  config: string;
  mutations: readonly Mutation[];
  accepted: readonly Accepted[];
  /** What the site keeps making itself: feed entries by kind, Markdown sections by title. */
  own: { entries: readonly string[]; sections: readonly string[] };
  /** A page that links every feed (Public Ledger's /feeds). Without one, feeds are found on the pages and at the engine's own feed addresses. */
  feedsIndex?: string;
  /** The site's own data API, if it has one. */
  api?: string;
}

export const AREAS = [
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

const ROOT = resolve(import.meta.dirname, "../../..");

export function dryRun(profile: SiteProfile): void {
  const repo = resolve(process.env[profile.repo.env] ?? join(ROOT, profile.repo.default));
  const content = join(repo, "content");
  const liveUrl = process.env.DRY_RUN_LIVE ?? profile.live;
  const out = join(ROOT, ".dry-run", profile.slug);
  const offline = process.env.DRY_RUN_OFFLINE === "1";
  let findings: Finding[] = [];

  describe.skipIf(!existsSync(content))(`dry run: ${profile.name} (${liveUrl})`, () => {
    beforeAll(async () => {
      const started = new Date();
      const live = new Live(liveUrl, join(out, "cache"), offline);
      // What the site keeps making itself, handed to the engine as its own code would.
      const first = await runEngine(profile.config, content);
      const firstPages = await fetchCards(first, live);
      const feedPaths = await liveFeedPaths(first, live, firstPages, profile.feedsIndex);
      const own = await siteParts(live, feedPaths, firstPages.markdown, profile.own);
      const run = await runEngine(profile.config, content, { site: { entries: own.entries, sections: (v) => own.sections.get(v.id) ?? [] } });
      const L = run.config.locales.default;
      const p = paths(run.config);
      const html = new Map(
        run.published.map((v) => [
          v.id,
          renderToStaticMarkup(
            <main>
              <Breadcrumbs config={run.config} items={[{ name: run.config.site.name, href: "/" }, { name: "Promises", href: p.promises(L) }, { name: v.id, href: p.card(v.id, L) }]} />
              <PromiseCard view={v} config={run.config} locale={L} today={run.today} related={relatedCards(v, run.published)} />
            </main>,
          ),
        ]),
      );
      const pages = await fetchCards(run, live);
      // Both sides as plain files, to read or diff: engine/ is what the engine would publish, live/ what the site serves.
      const save = (dir: string, files: Iterable<[string, string]>) => {
        rmSync(join(out, dir), { recursive: true, force: true });
        for (const [path, body] of files) {
          const file = join(out, dir, path.replace(/^\//, ""));
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, body);
        }
      };
      save("engine", [...[...run.files.values()].map((f): [string, string] => [f.path, f.body]), ...[...html].map(([id, h]): [string, string] => [`promise/${id}.html`, h])]);
      save("live", [...[...pages.markdown].map(([id, md]): [string, string] => [`promise/${id}.md`, md]), ...[...pages.card].map(([id, page]): [string, string] => [`promise/${id}.html`, page.mainHtml])]);
      const kinds = new Map<string, number>();
      for (const e of own.entries) {
        const kind = /^tag:[^:]+:(?:promise\/[^/]+\/)?([a-z]+)\//.exec(e.id)?.[1] ?? "other";
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      }
      const siteOwn: Finding[] = [];
      if (kinds.size)
        siteOwn.push({
          area: "Feeds",
          verdict: "site",
          what: `The site's own entries stay the site's to make: ${[...kinds].map(([k, n]) => `${n} "${k}"`).join(", ")}. The dry run handed them to the engine (PublishInput.site.entries) as the site's code would; the comparison below shows where they land.`,
        });
      const sections = [...own.sections.values()].flat().length;
      if (sections)
        siteOwn.push({
          area: "Markdown",
          verdict: "site",
          what: `The site's own sections stay the site's to make: ${sections} (${profile.own.sections.join(", ")}), handed to the engine (PublishInput.site.sections); they follow "About the cost", as on the card page.`,
        });
      const all = [
        ...siteOwn,
        ...(await readingArea(run, live)),
        ...checksArea(run, runMutations(content, run.config, profile.mutations)),
        ...historyArea(replayHistory(content, run.config, "HEAD")),
        ...(await feedsArea(run, live, feedPaths)),
        ...markdownArea(run, pages),
        ...(await llmsArea(run, live)),
        ...(await sitemapArea(run, live)),
        ...structuredDataArea(run, pages),
        ...cardPagesArea(run, pages, { html }),
        ...(await accessibilityArea(run, live, { html })),
        ...titlesArea(run, pages),
        ...(await openDataArea(run, live, profile.api)),
      ];
      findings = applyAccepted(all, profile.accepted);
      const md = writeReport(
        out,
        {
          site: profile.name,
          live: liveUrl,
          content: repo,
          contentCommit: headCommit(repo),
          engine: engineVersion(ROOT),
          started: `${started.toISOString()} (${started.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })} UK time)`,
          pagesFetched: live.count,
          offline,
        },
        AREAS,
        findings,
      );
      console.log(`\n${md.split("\n## ")[0]}\nFull report: ${join(out, "report.md")}\n`);
    }, 20 * 60_000);

    it.each(AREAS)("%s: good or better", (area) => {
      expect(findings.filter((f) => f.area === area && f.verdict === "worse").map((f) => f.what)).toEqual([]);
    });
  });
}
