import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { formatPath } from "@openpromises/core";
import { checkFolder, loadConfig } from "@openpromises/files";
import { cardViews, paths, publishFiles } from "@openpromises/publish";

/**
 * Decision 13: what an upgrade never breaks. Each released version left a
 * folder here: a copy of the fixture sites' v1 cards and configurations as
 * they were, and what that version made of them. Every later version must
 *
 * - find no new error in those cards (a valid card stays valid; a new rule
 *   arrives as a warning first),
 * - still publish every feed, feed entry id, page address, Markdown file and
 *   sitemap address, and every open-data column in the same place,
 * - still export every name the packages exported.
 *
 * A folder is written once, when its version is released
 * (UPDATE_COMPAT=1 pnpm test), and never rewritten.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const PACKAGES = ["quotes", "core", "files", "publish", "react", "cli"] as const;
const TODAY = "2026-10-09";
const update = process.env.UPDATE_COMPAT === "1";
const versions = readdirSync(import.meta.dirname, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

interface Snapshot {
  /** Errors, as "file  path  (rule)". */
  errors: string[];
  /** Every feed's path and its entries' ids. */
  feeds: Record<string, string[]>;
  /** Every other published path: Markdown, llms.txt, the sitemap, open data. */
  files: string[];
  /** Card page addresses. */
  pages: string[];
  sitemap: string[];
  csvHeader: string[];
}

async function snapshot(dir: string): Promise<Snapshot> {
  const { config, contentDir } = await loadConfig(join(dir, "openpromises.config.ts"));
  const r = checkFolder(contentDir, config, { base: null });
  const views = cardViews(r.cards, r.actors);
  const files = publishFiles({ config, views, today: TODAY });
  const feeds: Record<string, string[]> = {};
  const other: string[] = [];
  for (const f of files) {
    if (/atom|rss/.test(f.contentType)) feeds[f.path] = [...f.body.matchAll(/<(?:id|guid[^>]*)>([^<]+)<\/(?:id|guid)>/g)].map((m) => m[1]!).sort();
    else other.push(f.path);
  }
  const p = paths(config);
  return {
    errors: r.issues.filter((i) => i.severity === "error").map((i) => `${i.file}  ${formatPath(i.path)}  (${i.rule})`).sort(),
    feeds,
    files: other.sort(),
    pages: views.filter((v) => v.where === "promises").flatMap((v) => config.locales.all.map((l) => p.card(v.id, l))).sort(),
    sitemap: [...(files.find((f) => f.path === p.sitemap())?.body ?? "").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!).sort(),
    csvHeader: (files.find((f) => f.path === p.data("csv"))?.body ?? "").split(/\r?\n/)[0]!.split(","),
  };
}

/** Every name a package exports, values and types, read from its source with the TypeScript compiler. */
function exportedNames(): Record<string, string[]> {
  const files = PACKAGES.map((p) => join(ROOT, "packages", p, "src", "index.ts"));
  const program = ts.createProgram(files, {
    strict: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2023,
    paths: Object.fromEntries(PACKAGES.map((p) => [`@openpromises/${p}`, [join(ROOT, "packages", p, "src", "index.ts")]])),
  });
  const checker = program.getTypeChecker();
  return Object.fromEntries(
    PACKAGES.map((p, i) => {
      const symbol = checker.getSymbolAtLocation(program.getSourceFile(files[i]!)!)!;
      return [p, checker.getExportsOfModule(symbol).map((s) => s.name).sort()];
    }),
  );
}

describe.each(versions)("compatibility with %s", (version) => {
  const base = join(import.meta.dirname, version);
  const sites = readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  it.each(sites)("%s: no new errors, and nothing published has gone", async (name) => {
    const dir = join(base, name);
    const file = join(dir, "expected.json");
    const now = await snapshot(dir);
    if (update && !existsSync(file)) writeFileSync(file, `${JSON.stringify(now, null, 2)}\n`);
    const then = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
    expect(now.errors.filter((e) => !then.errors.includes(e)), "errors in cards that were valid").toEqual([]);
    for (const [path, ids] of Object.entries(then.feeds)) {
      expect(now.feeds[path], `the feed ${path}`).toBeDefined();
      expect(ids.filter((id) => !now.feeds[path]!.includes(id)), `entries gone from ${path}`).toEqual([]);
    }
    for (const k of ["files", "pages", "sitemap"] as const) expect(then[k].filter((x) => !now[k].includes(x)), `${k} gone`).toEqual([]);
    expect(now.csvHeader.slice(0, then.csvHeader.length), "open-data columns, in order").toEqual(then.csvHeader);
  });

  it("exports every name it exported", () => {
    const file = join(base, "exports.json");
    const now = exportedNames();
    if (update && !existsSync(file)) writeFileSync(file, `${JSON.stringify(now, null, 2)}\n`);
    const then = JSON.parse(readFileSync(file, "utf8")) as Record<string, string[]>;
    for (const p of PACKAGES) expect((then[p] ?? []).filter((n) => !now[p]!.includes(n)), `@openpromises/${p}`).toEqual([]);
  }, 60_000);
});
