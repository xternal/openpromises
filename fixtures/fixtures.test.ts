import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatPath } from "@openpromises/core";
import { checkFolder, folderSource, loadConfig, readContent, toYaml } from "@openpromises/files";

/**
 * The real cards copied from Public Ledger and Borough Book, and the invented
 * bilingual set, converted to format v1 and validated with each site's own
 * configuration. Every problem v1 finds in a site's data is listed in that
 * site's expected-issues.txt (and explained in docs/COMPARISON.md); this test
 * fails on any problem not listed, and on any listed problem that has gone.
 *
 * UPDATE_FIXTURES=1 pnpm test rewrites expected-issues.txt after a deliberate change.
 */

const SITES = ["public-ledger", "borough-book", "synthetic-bilingual"] as const;
const update = !!process.env.UPDATE_FIXTURES;

async function site(name: (typeof SITES)[number]) {
  const dir = join(import.meta.dirname, name);
  const { config, contentDir } = await loadConfig(join(dir, "openpromises.config.ts"));
  return { dir, config, v1: contentDir, source: join(dir, "source") };
}

const yamlFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort() : []);

describe.each(SITES)("%s", (name) => {
  it("converts every card and actor in source/ to exactly the committed v1/", async () => {
    const s = await site(name);
    const read = readContent(folderSource(s.source), s.config);
    expect(read.issues).toEqual([]);
    const written = new Map([...read.input.cards, ...read.input.actors].map((f) => [f.file, f]));
    for (const [file, f] of written) {
      const kind = file.startsWith("actors/") ? "actor" : "card";
      expect(readFileSync(join(s.v1, file), "utf8"), file).toBe(toYaml(f.data, kind));
    }
    for (const dir of ["promises", "drafts", "actors"]) {
      expect(yamlFiles(join(s.v1, dir)).map((f) => `${dir}/${f}`)).toEqual([...written.keys()].filter((f) => f.startsWith(`${dir}/`)).sort());
    }
  });

  it("passes every rule in v1, except the problems in expected-issues.txt", async () => {
    const s = await site(name);
    const r = checkFolder(s.v1, s.config, { base: null });
    expect(r.issues.filter((i) => i.rule === "schema")).toEqual([]);
    const lines = r.issues.map((i) => `${i.severity === "error" ? "error" : "warn "}  ${i.file}  ${formatPath(i.path)}  (${i.rule})`);
    const file = join(s.dir, "expected-issues.txt");
    const header = "# Problems format v1 finds in this site's converted data; explained in docs/COMPARISON.md.\n";
    if (update) writeFileSync(file, header + lines.map((l) => `${l}\n`).join(""));
    const expected = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"));
    expect(lines).toEqual(expected);
  });
});

describe("the converted fixtures", () => {
  it("cover every card copied from Public Ledger and Borough Book", async () => {
    for (const [name, count] of [
      ["public-ledger", 45],
      ["borough-book", 18],
    ] as const) {
      const s = await site(name);
      expect(yamlFiles(join(s.source, "promises"))).toHaveLength(count);
      expect(yamlFiles(join(s.v1, "promises"))).toHaveLength(count);
    }
  });
});
