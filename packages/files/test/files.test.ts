import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "@openpromises/core";
import { appendToList, setField, checkFolder, commentLines, findConfig, folderSource, gitSource, loadConfig, placeComments, readContent, readYaml, resolveBase, toYaml } from "@openpromises/files";

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "fixtures");
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "openpromises-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const write = (path: string, text: string) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};

describe("toYaml", () => {
  it("writes fields in a fixed order, quotes dates, folds long text and keeps ranges on one line", () => {
    const card = {
      status: "promised",
      id: "x",
      format: "openpromises/1",
      versions: [{ parameters: { cost: { quality: "sourced", range: [1, 2, 3] } }, text: "Short", version: 1, recorded_on: "2026-01-01" }],
      headline: { en: "A long headline that goes on and on and on so that it is well over eighty characters" },
    };
    expect(toYaml(card, "card")).toBe(`format: openpromises/1
id: x
headline:
  en: >-
    A long headline that goes on and on and on so that it is well over eighty characters
status: promised
versions:
  - version: 1
    text: Short
    recorded_on: "2026-01-01"
    parameters:
      cost:
        range: [1, 2, 3]
        quality: sourced
`);
  });

  it("quotes text that older YAML readers would take for something else", () => {
    const out = toYaml({ format: "openpromises/1", id: "x", area: "yes", status: "on", x: { code: "01", time: "1:20" } }, "card");
    expect(out).toContain('area: "yes"');
    expect(out).toContain('status: "on"');
    expect(out).toContain('code: "01"');
    expect(readYaml(out)).toEqual({ format: "openpromises/1", id: "x", area: "yes", status: "on", x: { code: "01", time: "1:20" } });
  });

  it("keeps every character of a quote, whatever the spaces", () => {
    const text = "Two  spaces,\ttabs, a trailing space and “curly quotes” —  kept. ".repeat(3);
    expect((readYaml(toYaml({ versions: [{ text }] }, "card")) as { versions: { text: string }[] }).versions[0]!.text).toBe(text);
  });
});

describe("appendToList", () => {
  const event = { date: "2027-01-02", type: "deadline_missed", text: { en: "The deadline passed." }, auto: true };

  it("adds only the new lines to a real card, leaving the rest as written", () => {
    const original = readFileSync(join(FIXTURES, "public-ledger", "source", "promises", "uk-nato-5pc-2035-2025.yaml"), "utf8");
    const out = appendToList(original, "events", [event], "event");
    const added = out.split("\n").filter((_, i, all) => !original.split("\n").includes(all[i]!));
    expect(added).toEqual(['  - date: "2027-01-02"', "    type: deadline_missed", "    text:", "      en: The deadline passed.", "    auto: true"]);
    expect(out.replace(added.join("\n") + "\n", "")).toBe(original);
  });

  it("turns an empty list into a block list, and adds a list the file does not have", () => {
    const review = { by: "Sam", kind: "editor", on: "2026-10-09", approves: true };
    expect(appendToList("id: x\nreviews: []\nx: {}\n", "reviews", [review], "review")).toBe('id: x\nreviews:\n  - by: Sam\n    kind: editor\n    "on": "2026-10-09"\n    approves: true\nx: {}\n');
    expect(appendToList("id: x\n", "reviews", [review], "review")).toBe('id: x\nreviews:\n  - by: Sam\n    kind: editor\n    "on": "2026-10-09"\n    approves: true\n');
  });

  it("follows the file's own indentation", () => {
    const out = appendToList('events:\n- date: "2026-01-01"\n  type: promised\nreplies: []\n', "events", [event], "event");
    expect(readYaml(out)).toEqual({ events: [{ date: "2026-01-01", type: "promised" }, event], replies: [] });
  });
});

describe("setField", () => {
  it("changes only the one line, whether the field is there or not", () => {
    const text = `id: x\nversions:\n  - version: 1\n    text: >-\n      A long quote folded over\n      two lines.\n    quote_checked_on: null\n    parameters:\n      deadline: "2027-01-01"\n`;
    expect(setField(text, ["versions", 0], "quote_checked_on", "2026-10-09")).toBe(text.replace("quote_checked_on: null", 'quote_checked_on: "2026-10-09"'));
    const without = text.replace("    quote_checked_on: null\n", "");
    expect(setField(without, ["versions", 0], "quote_checked_on", "2026-10-09")).toBe(`${without}    quote_checked_on: "2026-10-09"\n`);
  });
});

describe("configuration files", () => {
  it("finds the configuration in a folder or above, and reads YAML and JSON", async () => {
    const d = tmp();
    write(join(d, "openpromises.config.yaml"), "site: { name: Test }\nladder: local\ncontent: cards\n");
    mkdirSync(join(d, "cards", "promises"), { recursive: true });
    expect(findConfig(join(d, "cards", "promises"))).toBe(join(d, "openpromises.config.yaml"));
    const loaded = await loadConfig(join(d, "openpromises.config.yaml"));
    expect(loaded.config.ladder.name).toBe("local");
    expect(loaded.contentDir).toBe(join(d, "cards"));
    write(join(d, "openpromises.config.json"), JSON.stringify({ site: { name: "Json" }, editorial: { approvals: 1 } }));
    await expect(loadConfig(join(d, "openpromises.config.json"))).rejects.toThrow("should be 2 or more");
  });
});

describe("reading a content folder", () => {
  it("reports YAML that does not parse", () => {
    const d = tmp();
    write(join(d, "promises", "bad.yaml"), "id: [unclosed\n");
    const r = readContent(folderSource(d), resolveConfig({ site: { name: "T" } }));
    expect(r.issues.map((i) => `${i.file}: ${i.message.split(":")[0]}`)).toEqual(["promises/bad.yaml: is not valid YAML"]);
  });

  it("refuses paths outside the content folder", () => {
    expect(() => folderSource(tmp()).read("../secret")).toThrow("outside the content folder");
  });
});

// ---------------------------------------------------------------- against a git base

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.org", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const CONFIG = "site: { name: Test }\nmodules: [lever]\nlegacy: public-ledger\n";
const ACTOR = "format: openpromises/1\nid: ada\nkind: person\nname: { en: Ada }\n";
const EDITORS = 'editors:\n  - { handle: Sam, since: "2026-01-01", party: null }\n  - { handle: Alex, since: "2026-01-01", party: null }\n';
const CARD = {
  format: "openpromises/1",
  id: "bus-fares",
  headline: { en: "Cap bus fares at £2" },
  actor_id: "ada",
  made_on: "2026-05-01",
  area: "Transport",
  status: "promised",
  versions: [{ version: 1, text: "We will cap bus fares at £2.", recorded_on: "2026-05-01", source_url: "https://example.org/s", quote_checked_on: "2026-05-01", parameters: { deadline: "2027-01-01" } }],
  events: [{ date: "2026-05-01", type: "promised", text: { en: "Promised" } }],
  reviews: [
    { by: "Sam", kind: "editor", on: "2026-05-02", approves: true },
    { by: "Alex", kind: "editor", on: "2026-05-02", approves: true },
  ],
};

/** A repository with one published card on main, and a branch to change it on. */
function repo(card: unknown = CARD): { root: string; content: string; config: ReturnType<typeof resolveConfig> } {
  const root = tmp();
  git(root, "init", "-q", "-b", "main");
  write(join(root, "openpromises.config.yaml"), CONFIG);
  write(join(root, "content", "actors", "ada.yaml"), ACTOR);
  write(join(root, "content", "editors.yaml"), EDITORS);
  write(join(root, "content", "promises", "bus-fares.yaml"), toYaml(card, "card"));
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "publish");
  git(root, "checkout", "-q", "-b", "change");
  return { root, content: join(root, "content"), config: resolveConfig(readYaml(CONFIG)) };
}

const appendOnly = (r: ReturnType<typeof repo>) =>
  checkFolder(r.content, r.config, { base: "main" })
    .issues.filter((i) => i.rule === "append-only")
    .map((i) => `${i.file} ${i.path.join(".")}: ${i.message}`);
const edit = (r: ReturnType<typeof repo>, change: (c: typeof CARD) => void) => {
  const c = structuredClone(CARD);
  change(c);
  writeFileSync(join(r.content, "promises", "bus-fares.yaml"), toYaml(c, "card"));
};

describe("append-only against a git base", () => {
  it("passes an unchanged card, and one with an event added", () => {
    const r = repo();
    expect(checkFolder(r.content, r.config, { base: "main" }).issues).toEqual([]);
    edit(r, (c) => c.events.push({ date: "2026-06-01", type: "restated", text: { en: "Repeated" }, evidence_url: "https://example.org/r" } as never));
    expect(appendOnly(r)).toEqual([]);
  });

  it("fails an edited event, and passes it once a correction records the change", () => {
    const r = repo();
    edit(r, (c) => (c.events[0]!.text = { en: "Promised in a speech" }));
    expect(appendOnly(r)).toEqual(["promises/bus-fares.yaml events.0: was changed; history is append-only (add a new entry, or record our own mistake as a correction)"]);
    edit(r, (c) => {
      c.events[0]!.text = { en: "Promised in a speech" };
      Object.assign(c, { corrections: [{ date: "2026-10-09", path: "events[0].text", was: { en: "Promised" }, now: { en: "Promised in a speech" }, reason: { en: "Said where." } }] });
    });
    expect(appendOnly(r)).toEqual([]);
  });

  it("fails a deleted card and a card moved back to drafts", () => {
    const r = repo();
    rmSync(join(r.content, "promises", "bus-fares.yaml"));
    expect(appendOnly(r)[0]).toContain("has been deleted or renamed");
    write(join(r.content, "drafts", "bus-fares.yaml"), toYaml(CARD, "card"));
    expect(appendOnly(r)[0]).toContain("is back in drafts/");
  });

  it("ignores key order and YAML style", () => {
    const r = repo();
    writeFileSync(join(r.content, "promises", "bus-fares.yaml"), JSON.stringify(CARD, null, 1));
    expect(appendOnly(r)).toEqual([]);
  });

  it("does not count a migration to format v1 as rewriting history", () => {
    const legacy = readFileSync(join(FIXTURES, "public-ledger", "source", "promises", "uk-nato-5pc-2035-2025.yaml"), "utf8");
    const r = repo();
    write(join(r.content, "promises", "uk-nato-5pc-2035-2025.yaml"), legacy);
    git(r.root, "add", "-A");
    git(r.root, "commit", "-q", "-m", "a legacy card");
    git(r.root, "branch", "-q", "-f", "main");
    // The migration change: the same card, now in format v1.
    const migrated = readFileSync(join(FIXTURES, "public-ledger", "v1", "promises", "uk-nato-5pc-2035-2025.yaml"), "utf8");
    writeFileSync(join(r.content, "promises", "uk-nato-5pc-2035-2025.yaml"), migrated);
    expect(appendOnly(r)).toEqual([]);
    // A real edit hidden in the migration is still caught.
    writeFileSync(join(r.content, "promises", "uk-nato-5pc-2035-2025.yaml"), migrated.replace("range: [36, 40, 44]", "range: [30, 40, 44]"));
    expect(appendOnly(r)).toEqual(["promises/uk-nato-5pc-2035-2025.yaml versions.0: was changed; history is append-only (add a new entry, or record our own mistake as a correction)"]);
  });

  it("reads the content folder as it is at the base", () => {
    const r = repo();
    renameSync(join(r.content, "promises", "bus-fares.yaml"), join(r.content, "promises", "other.yaml"));
    const base = gitSource(r.content, "main");
    expect(base.list("promises")).toEqual(["bus-fares.yaml"]);
    expect(base.read("actors/ada.yaml")).toBe(ACTOR);
    expect(base.read("actors/none.yaml")).toBeNull();
  });
});

describe("finding the base", () => {
  it("uses VALIDATE_BASE, then origin/$GITHUB_BASE_REF, then origin/main, whichever exists", () => {
    const r = repo();
    git(r.root, "update-ref", "refs/remotes/origin/main", "main");
    git(r.root, "update-ref", "refs/remotes/origin/release", "main");
    expect(resolveBase(r.root, undefined, { VALIDATE_BASE: "main" })).toBe("main");
    expect(resolveBase(r.root, undefined, { GITHUB_BASE_REF: "release" })).toBe("origin/release");
    expect(resolveBase(r.root, undefined, { VALIDATE_BASE: "nope" })).toBe("origin/main");
    expect(resolveBase(r.root, undefined, {})).toBe("origin/main");
    expect(resolveBase(r.root, "nope", {})).toBeNull();
  });

  it("skips the comparison, saying so, when there is no base", () => {
    const d = tmp();
    write(join(d, "promises", "bus-fares.yaml"), toYaml(CARD, "card"));
    const r = checkFolder(d, resolveConfig({ site: { name: "T" } }), {});
    expect(r.base.note).toContain("the append-only check was skipped");
  });
});

describe("comments on migration (decision 16)", () => {
  const text = "# A note about the id\nid: someone\nroles:\n  - title: Mayor\n    # Source: https://example.org/mayor (\"Someone became mayor in May.\")\n    from: \"2026-05-01\"\n";
  const data = { format: "openpromises/1", id: "someone", kind: "person", roles: [{ title: { en: "Mayor" }, from: "2026-05-01" }] };
  const config = resolveConfig({ site: { name: "T" } });

  it("finds the field every comment stands above", () => {
    expect(commentLines(text).map((c) => [c.line, c.path])).toEqual([
      [1, ["id"]],
      [5, ["roles", 0, "from"]],
    ]);
  });

  it("leaves every comment of a format it does not know for an editor, and drops none", () => {
    const placed = placeComments("borough-book", "actor", text, data, config);
    expect(placed.data).toEqual(data);
    expect(placed.report.map((r) => r.outcome)).toEqual(["not placed", "not placed"]);
  });

  it("moves a Public Ledger role source into its field", () => {
    const placed = placeComments("public-ledger", "actor", text, data, config);
    expect((placed.data as { roles: { source?: unknown }[] }).roles[0]!.source).toEqual({ url: "https://example.org/mayor", quote: "Someone became mayor in May." });
    expect(placed.report.map((r) => r.outcome)).toEqual(["not placed", "moved"]);
  });
});
