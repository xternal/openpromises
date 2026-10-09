import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run, type Io } from "@openpromises/cli";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "openpromises-cli-"));
  dirs.push(d);
  return d;
}

const write = (path: string, text: string) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};

/** Run a command line in a folder; returns the exit code and everything printed. */
async function op(cwd: string, line: string | string[], today = "2026-10-09", env: Record<string, string> = {}) {
  const out: string[] = [];
  const io: Io = { cwd, today, env, out: (l) => out.push(l), err: (l) => out.push(l) };
  const argv = Array.isArray(line) ? line : [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]!);
  const code = await run(argv, io);
  return { code, out: out.join("\n") };
}

describe("the README's two-minute example", () => {
  it("works as written", async () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    const example = readme.slice(readme.indexOf("## Two-minute example"), readme.indexOf("## Commands"));
    const yaml = [...example.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]!);
    const commands = [...example.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap((m) => m[1]!.split("\n")).filter((l) => l.startsWith("openpromises "));
    expect(yaml).toHaveLength(4);
    expect(commands.map((c) => c.split(" ")[1])).toEqual(["new", "validate", "review", "review", "validate"]);

    const d = tmp();
    write(join(d, "openpromises.config.yaml"), yaml[0]!);
    write(join(d, "content", "actors", "riverside-greens.yaml"), yaml[1]!);
    write(join(d, "content", "editors.yaml"), yaml[2]!);
    const [create, ...rest] = commands.map((c) => c.slice("openpromises ".length));
    expect((await op(d, create!)).code).toBe(0);
    expect(existsSync(join(d, "content", "drafts", "riverside-bins-2026.yaml"))).toBe(true);
    // The editor fills the draft in.
    write(join(d, "content", "drafts", "riverside-bins-2026.yaml"), yaml[3]!);
    for (const c of rest) {
      const r = await op(d, c);
      expect(r.code, `${c}\n${r.out}`).toBe(0);
    }
    expect(existsSync(join(d, "content", "promises", "riverside-bins-2026.yaml"))).toBe(true);
    expect((await op(d, "validate")).out).toContain("0 errors, 0 warnings");
  });
});

// ---------------------------------------------------------------- a small site to work on

const CONFIG = `site: { name: Test Tracker }
locales: { default: en, all: [en] }
money: { currency: GBP, unit: m, period: year }
actors: { kinds: [person, party], standing: none }
venues: [manifesto, speech]
areas: { kind: text }
ladder: national
quotes: { archive: optional, require: editor }
`;

const CARD = `format: openpromises/1
id: bus-fares
headline: { en: Cap bus fares at £2 }
actor_id: green-party
made_on: "2026-05-01"
venue: speech
area: Transport
status: promised
status_note: { en: Nothing has happened yet. }
versions:
  - version: 1
    text: "We will cap bus fares at £2 for every journey in the city by 2027."
    recorded_on: "2026-05-01"
    source_url: https://example.org/speech
    quote_checked_on: "2026-05-01"
    parameters:
      deadline: "2027-01-01"
events:
  - date: "2026-05-01"
    type: promised
    text: { en: Promised in a speech }
`;

function site(): string {
  const d = tmp();
  write(join(d, "openpromises.config.yaml"), CONFIG);
  write(join(d, "content", "actors", "green-party.yaml"), "format: openpromises/1\nid: green-party\nkind: party\nname: { en: Green Party }\n");
  write(join(d, "content", "actors", "blue-party.yaml"), "format: openpromises/1\nid: blue-party\nkind: party\nname: { en: Blue Party }\n");
  write(
    join(d, "content", "editors.yaml"),
    'editors:\n  - { handle: Sam, since: "2026-01-01", party: null }\n  - { handle: Alex, since: "2026-01-01", party: blue-party }\n  - { handle: Kim, since: "2026-01-01", party: green-party }\n',
  );
  write(join(d, "content", "drafts", "bus-fares.yaml"), CARD);
  return d;
}

const file = (d: string, path: string) => readFileSync(join(d, "content", path), "utf8");

describe("help and mistakes", () => {
  it("lists the commands and the rules", async () => {
    expect((await op(tmp(), "help")).out).toContain("openpromises validate");
    const rules = (await op(tmp(), "help rules")).out;
    for (const r of ["evidence", "first-event", "event-order", "approvals", "append-only", "quotes", "cost"]) expect(rules).toContain(r);
  });

  it("refuses an unknown command or flag, and a missing configuration", async () => {
    expect((await op(tmp(), "publish")).code).toBe(2);
    const d = site();
    expect(await op(d, "validate --bse main")).toEqual({ code: 2, out: "openpromises validate: validate has no --bse option (see: openpromises help validate)" });
    expect((await op(tmp(), "validate")).out).toContain("there is no openpromises.config.ts");
  });
});

describe("validate", () => {
  it("passes a good draft, and fails a bad card with the file, the field, the rule and a plain message", async () => {
    const d = site();
    const ok = await op(d, "validate");
    expect(ok.code).toBe(0);
    expect(ok.out).toContain("Checked 0 published cards, 1 draft and 2 actors in content/");
    expect(ok.out).toContain("the append-only check was skipped");
    write(join(d, "content", "drafts", "bus-fares.yaml"), CARD.replace("type: promised\n", "type: funded\n"));
    const bad = await op(d, "validate --no-base");
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('error  content/drafts/bus-fares.yaml  events[0].type: the first event is the promise itself ("promised"), not "funded"  (first-event)');
    expect(bad.out).toContain('events[0].evidence_url: a "funded" event needs an evidence_url');
  });

  it("speaks JSON for other tools", async () => {
    const r = JSON.parse((await op(site(), "validate --json --no-base")).out) as { errors: number; drafts: number };
    expect(r).toMatchObject({ errors: 0, drafts: 1 });
  });
});

describe("new", () => {
  it("writes a draft to fill in, which fails until it is filled", async () => {
    const d = site();
    expect((await op(d, "new school-meals --actor blue-party --made-on 2026-06-01 --venue manifesto")).code).toBe(0);
    expect(file(d, "drafts/school-meals.yaml")).toContain('made_on: "2026-06-01"');
    const v = await op(d, "validate --no-base");
    expect(v.code).toBe(1);
    expect(v.out).toContain("drafts/school-meals.yaml  headline.en: is empty  (schema)");
    expect((await op(d, "new school-meals --actor blue-party")).out).toContain("already exists");
    expect((await op(d, "new School_Meals --actor blue-party")).code).toBe(2);
  });
});

describe("review", () => {
  it("records two approvals and moves the card to promises/ on the second", async () => {
    const d = site();
    const first = await op(d, "review bus-fares --by Sam --note Checked");
    expect(first.out).toBe('Sam approved "bus-fares" (content/drafts/bus-fares.yaml). It needs 1 more editor\'s approval.');
    expect(file(d, "drafts/bus-fares.yaml")).toContain("- by: Sam\n    kind: editor\n    \"on\": \"2026-10-09\"\n    approves: true\n    note:\n      en: Checked\n");
    const second = await op(d, "review bus-fares --by Alex");
    expect(second.out).toContain("so it moved to content/promises/bus-fares.yaml");
    expect(existsSync(join(d, "content", "drafts", "bus-fares.yaml"))).toBe(false);
    expect((await op(d, "validate --no-base")).code).toBe(0);
  });

  it("refuses an unlisted editor, a second approval by the same editor, and an editor's own party", async () => {
    const d = site();
    expect((await op(d, "review bus-fares --by Robin")).out).toBe('refused: "Robin" is not in the editors list');
    expect((await op(d, "review bus-fares --by Kim")).out).toBe("refused: Kim may not approve a card about their own party; another editor does");
    await op(d, "review bus-fares --by Sam");
    expect((await op(d, "review bus-fares --by Sam")).out).toContain("has already approved");
  });

  it("will not publish a card that breaks a rule", async () => {
    const d = site();
    write(join(d, "content", "drafts", "bus-fares.yaml"), CARD.replace('    quote_checked_on: "2026-05-01"\n', ""));
    await op(d, "review bus-fares --by Sam");
    const r = await op(d, "review bus-fares --by Alex");
    expect(r.code).toBe(1);
    expect(r.out).toContain("cannot be published yet");
    expect(r.out).toContain("has not been confirmed at its source");
    expect(existsSync(join(d, "content", "drafts", "bus-fares.yaml"))).toBe(true);
    // Confirming the quote while approving lets it through.
    expect((await op(d, "review bus-fares --by Alex --quote-checked")).code).toBe(0);
    expect(file(d, "promises/bus-fares.yaml")).toContain('quote_checked_on: "2026-10-09"');
  });
});

describe("a private editors list (decision 10)", () => {
  it("is read from outside the content folder, and no message names an editor's party", async () => {
    const d = site();
    const secret = join(tmp(), "editors.yaml");
    writeFileSync(secret, file(d, "editors.yaml"));
    rmSync(join(d, "content", "editors.yaml"));
    expect((await op(d, "review bus-fares --by Sam")).out).toContain("there is no editors list");
    expect((await op(d, "review bus-fares --by Sam", "2026-10-09", { OPENPROMISES_EDITORS: secret })).code).toBe(0);
    const refused = await op(d, ["review", "bus-fares", "--by", "Kim", "--editors", secret]);
    expect(refused.out).toBe("refused: Kim may not approve a card about their own party; another editor does");
    // An approval written into the card by hand is refused by validate, again without naming the party.
    write(join(d, "content", "drafts", "bus-fares.yaml"), `${file(d, "drafts/bus-fares.yaml")}  - { by: Kim, kind: editor, "on": "2026-10-09", approves: true }\n`);
    const v = await op(d, "validate --no-base", "2026-10-09", { OPENPROMISES_EDITORS: secret });
    expect(v.out).toContain("reviews[1].by: Kim may not approve a card about their own party; another editor does");
    expect(v.out).not.toContain("green-party");
    expect(v.out).not.toContain("blue-party");
  });
});

describe("importing an earlier approval (decision 11)", () => {
  it("records it with the day it was given and a note saying where", async () => {
    const d = site();
    const r = await op(d, ["review", "bus-fares", "--by", "Sam", "--on", "2026-06-12", "--note", "Approved on GitHub in pull request #12"]);
    expect(r.code).toBe(0);
    expect(file(d, "drafts/bus-fares.yaml")).toContain('- by: Sam\n    kind: editor\n    "on": "2026-06-12"\n    approves: true\n    note:\n      en: "Approved on GitHub in pull request #12"\n');
  });

  it("refuses a day in the future, a day before the person was an editor, and a quote check on an earlier day", async () => {
    const d = site();
    expect((await op(d, "review bus-fares --by Sam --on 2026-12-01")).out).toContain("is in the future");
    expect((await op(d, "review bus-fares --by Sam --on 2025-12-31")).out).toBe("refused: Sam is not an editor on 2025-12-31");
    expect((await op(d, "review bus-fares --by Sam --on 12/06/2026")).code).toBe(2);
    expect((await op(d, "review bus-fares --by Sam --on 2026-06-12 --quote-checked")).out).toContain("cannot be combined with --on");
  });
});

describe("deadlines", () => {
  it("adds one deadline_missed event to an open card whose deadline has passed, and only once", async () => {
    const d = site();
    await op(d, "review bus-fares --by Sam");
    await op(d, "review bus-fares --by Alex");
    expect((await op(d, "deadlines --dry-run", "2027-01-02")).out).toContain("Dry run: 1 deadline_missed event would be added");
    expect(file(d, "promises/bus-fares.yaml")).not.toContain("deadline_missed");
    expect((await op(d, "deadlines", "2027-01-02")).out).toContain("Added 1 deadline_missed event (2027-01-02).");
    expect(file(d, "promises/bus-fares.yaml")).toContain('  - date: "2027-01-02"\n    type: deadline_missed\n');
    expect((await op(d, "deadlines", "2027-01-03")).out).toContain("Added 0 deadline_missed events");
    expect((await op(d, "validate --no-base")).code).toBe(0);
  });
});

describe("lint", () => {
  it("finds judgement words in our text, and passes neutral text", async () => {
    const d = site();
    expect((await op(d, "lint")).code).toBe(0);
    write(join(d, "content", "drafts", "bus-fares.yaml"), CARD.replace("Nothing has happened yet.", "A broken promise so far."));
    const r = await op(d, "lint");
    expect(r.code).toBe(1);
    expect(r.out).toContain('drafts/bus-fares.yaml  status_note.en: "broken promise" passes judgement');
  });
});

describe("check-quote", () => {
  it("checks a version's words in a stored copy and records the result for validate", async () => {
    const d = site();
    write(join(d, "copy.html"), "<p>She said: &ldquo;We will cap bus fares at &pound;2 for every journey in the city by 2027.&rdquo;</p>");
    const r = await op(d, "check-quote bus-fares --html copy.html --record");
    expect(r.code).toBe(0);
    expect(r.out).toContain("exact: the words of version 1 are in copy.html.");
    const record = JSON.parse(file(d, "quotes.json")) as Record<string, { match: string; url: string }>;
    expect(Object.values(record)).toMatchObject([{ match: "exact", url: "https://example.org/speech" }]);
    write(join(d, "other.txt"), "We will cap bus fares at £3 for every journey.");
    const none = await op(d, "check-quote bus-fares --text other.txt");
    expect(none.code).toBe(1);
    expect(none.out).toContain('none: the words are not there. The first 6 words of 15 match; it differs from: "£2 for every journey in the city by 2027."');
  });
});

describe("publish", () => {
  it("writes feeds, Markdown, llms.txt, a sitemap and open data for published cards only", async () => {
    const d = site();
    expect((await op(d, "publish --out public")).out).toContain("site.url is needed to publish");
    write(join(d, "openpromises.config.yaml"), `${CONFIG}site: { name: Test Tracker, url: "https://example.org" }\npublish: { tag: "example.org,2026" }\n`.replace("site: { name: Test Tracker }\n", ""));
    await op(d, "review bus-fares --by Sam");
    await op(d, "review bus-fares --by Alex");
    write(join(d, "content", "drafts", "secret-draft.yaml"), CARD.replace("id: bus-fares", "id: secret-draft"));
    const r = await op(d, "publish --out public");
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("Published 1 card as");
    const out = (path: string) => readFileSync(join(d, "public", path), "utf8");
    expect(out("feeds/all.xml")).toContain("<id>tag:example.org,2026:promise/bus-fares/event/0</id>");
    expect(out("promise/bus-fares.md").startsWith("# Cap bus fares at £2\n")).toBe(true);
    expect(out("llms.txt")).toContain("https://example.org/promise/bus-fares");
    expect(out("sitemap-promises.xml")).toContain("<loc>https://example.org/promise/bus-fares</loc>");
    expect(out("data/promises.csv").split("\r\n").filter(Boolean)).toHaveLength(2);
    for (const f of ["feeds/all.xml", "llms.txt", "llms-full.txt", "data/promises.json", "sitemap-promises.xml"]) expect(out(f)).not.toContain("secret-draft");
    expect(existsSync(join(d, "public", "promise", "secret-draft.md"))).toBe(false);
  });
});

describe("migrate and stats", () => {
  it("rewrites an older-format card in format v1, in place, and counts the content", async () => {
    const d = site();
    write(join(d, "openpromises.config.yaml"), `${CONFIG}legacy: public-ledger\n`);
    const legacy = readFileSync(join(ROOT, "fixtures", "public-ledger", "source", "promises", "uk-bus-cap-2-2026.yaml"), "utf8").replace("actor_id: andy-burnham", "actor_id: green-party");
    write(join(d, "content", "drafts", "uk-bus-cap-2-2026.yaml"), legacy);
    expect((await op(d, "validate --no-base")).out).toContain("Format: 1 card and 0 actors are in the public-ledger format and were read as format v1");
    const m = await op(d, "migrate");
    expect(m.out).toContain("Converted 1 card and 0 actors from the public-ledger format");
    expect(file(d, "drafts/uk-bus-cap-2-2026.yaml").startsWith("format: openpromises/1\nid: uk-bus-cap-2-2026\n")).toBe(true);
    const s = JSON.parse((await op(d, "stats --json")).out) as { drafts: number; draftsWaiting: number };
    expect(s).toMatchObject({ drafts: 2, draftsWaiting: 2 });
    expect((await op(d, "stats")).out).toContain("0 published cards; 2 drafts (0 with every approval, 2 waiting for editors)");
  });
});
