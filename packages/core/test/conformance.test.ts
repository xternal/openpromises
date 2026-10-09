import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { standingOf, validateContent, type Actor, type ContentInput, type FileIssue } from "@openpromises/core";
import { folderSource, loadConfig, readContent } from "@openpromises/files";

/**
 * Principle 5, one standard: no rule, label or code path depends on which
 * party is involved. Run on every card of every site in the fixtures, with
 * two editors' approvals added so the party check has something to judge.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");
const SITES = ["public-ledger", "borough-book", "synthetic-bilingual"] as const;

type Raw = Record<string, unknown>;
const clone = <T>(v: T): T => structuredClone(v);

async function world(name: string): Promise<ContentInput> {
  const { config, contentDir } = await loadConfig(join(ROOT, "fixtures", name, "openpromises.config.ts"));
  return readContent(folderSource(contentDir), config).input;
}

const parties = (input: ContentInput) =>
  input.actors
    .map((a) => a.data as Raw)
    .filter((a) => a.kind === "party")
    .map((a) => String(a.id))
    .sort();

/**
 * One editor per party and one with none. Every card gets an approval from an
 * editor of its own party (which the party check must refuse), and two more
 * that count, so the party check runs for every party.
 */
function withEditors(input: ContentInput): ContentInput {
  const ids = parties(input);
  const handle = (party: string | null) => (party === null ? "Editor Free" : `Editor ${ids.indexOf(party) + 1}`);
  const out = clone({ ...input, quoteCheck: undefined, sourceText: undefined });
  out.editors = {
    file: "editors.yaml",
    data: { editors: [...ids, null].map((party) => ({ handle: handle(party), since: "2020-01-01", party })) },
  };
  const actors = new Map(input.actors.map((a) => [String((a.data as Raw).id), a.data as Raw]));
  for (const c of out.cards) {
    const card = c.data as Raw;
    const actor = actors.get(String(card.actor_id));
    const own = actor?.kind === "party" ? String(actor.id) : typeof actor?.party_id === "string" ? actor.party_id : null;
    const other = ids.find((p) => p !== own)!;
    const by = [...(own ? [own] : []), null, other].map(handle);
    card.reviews = by.map((b) => ({ by: b, kind: "editor", on: "2030-01-01", approves: true }));
  }
  return { ...out, ...(input.quoteCheck ? { quoteCheck: input.quoteCheck } : {}), ...(input.sourceText ? { sourceText: input.sourceText } : {}) };
}

/** Rename parties everywhere a party id is used: actor ids and files, party_id, card actors, reply actors, editors' parties. */
function relabel(input: ContentInput, rename: Map<string, string>): ContentInput {
  const r = (id: unknown) => (typeof id === "string" ? (rename.get(id) ?? id) : id);
  const out = clone({ ...input, quoteCheck: undefined, sourceText: undefined });
  for (const a of out.actors) {
    const actor = a.data as Raw;
    actor.id = r(actor.id);
    actor.party_id = r(actor.party_id);
    if (actor.party_id === undefined) delete actor.party_id;
    a.file = `actors/${String(actor.id)}.yaml`;
  }
  for (const c of out.cards) {
    const card = c.data as Raw;
    card.actor_id = r(card.actor_id);
    for (const reply of (card.replies as Raw[] | undefined) ?? []) reply.from_actor_id = r(reply.from_actor_id);
  }
  for (const e of ((out.editors?.data as Raw | undefined)?.editors as Raw[] | undefined) ?? []) e.party = r(e.party);
  return { ...out, ...(input.quoteCheck ? { quoteCheck: input.quoteCheck } : {}), ...(input.sourceText ? { sourceText: input.sourceText } : {}) };
}

/** An issue as text, with party ids renamed, for comparing two worlds. */
function key(i: FileIssue, rename = new Map<string, string>()): string {
  const s = `${i.severity} ${i.file} ${i.path.join(".")} ${i.rule} ${i.message}`;
  if (!rename.size) return s;
  // One pass, longest ids first, so a renamed id is never renamed again.
  const ids = [...rename.keys()].sort((a, b) => b.length - a.length);
  return s.replace(new RegExp(`(?<![a-z0-9-])(${ids.join("|")})(?![a-z0-9-])`, "g"), (m) => rename.get(m)!);
}

describe.each(SITES)("one standard for every party: %s", (name) => {
  it("gives the same outcome when every party's identity is swapped round", async () => {
    const base = withEditors(await world(name));
    const ids = parties(base);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    // Each party takes the next one's name: a cycle through every party.
    const rename = new Map(ids.map((id, i) => [id, `${ids[(i + 1) % ids.length]!}`]));
    const tmp = new Map(ids.map((id) => [id, `tmp-${id}`]));
    const back = new Map(ids.map((id) => [`tmp-${id}`, rename.get(id)!]));
    const renamed = relabel(relabel(base, tmp), back);
    const before = validateContent(base).issues.map((i) => key(i, rename)).sort();
    const after = validateContent(renamed).issues.map((i) => key(i)).sort();
    expect(after).toEqual(before);
    // The check has teeth: every party's own editor is refused on that party's cards.
    for (const id of ids) expect(before.some((k) => k.includes(`may not approve a card about their own party (${rename.get(id)})`)), id).toBe(true);
  });

  it("gives a card the same outcome under any other party in the same position", async () => {
    const input = withEditors(await world(name));
    // Editors with no party, so the only thing that changes is who made the promise.
    (input.editors!.data as { editors: Raw[] }).editors.forEach((e) => (e.party = null));
    const { config } = input;
    const actors = new Map(input.actors.map((a) => [String((a.data as Raw).id), a.data as Actor]));
    const ids = parties(input);
    let compared = 0;
    for (const [i, c] of input.cards.entries()) {
      const card = c.data as Raw;
      const actor = actors.get(String(card.actor_id));
      if (!actor) continue;
      const own = actor.kind === "party" ? actor.id : actor.party_id;
      if (!own) continue;
      const position = standingOf(own, actors, config);
      const issues = (inp: ContentInput) =>
        validateContent(inp)
          .issues.filter((x) => x.file === c.file)
          .map((x) => key(x));
      const expected = issues(input);
      for (const other of ids) {
        if (other === own || standingOf(other, actors, config) !== position) continue;
        const moved = clone({ ...input, quoteCheck: undefined, sourceText: undefined }) as ContentInput;
        Object.assign(moved, { quoteCheck: input.quoteCheck, sourceText: input.sourceText });
        const m = moved.cards[i]!.data as Raw;
        if (actor.kind === "party") m.actor_id = other;
        else {
          // The same person, in another party.
          const person = moved.actors.find((a) => (a.data as Raw).id === actor.id)!.data as Raw;
          person.party_id = other;
        }
        expect(issues(moved), `${c.file} under ${other}`).toEqual(expected);
        compared++;
      }
    }
    if (name !== "borough-book") expect(compared).toBeGreaterThan(0);
  });
});

describe("no party in the code", () => {
  it("names no party or actor from the fixtures anywhere in the engine's source", async () => {
    const names = new Set<string>();
    for (const name of SITES) {
      for (const a of (await world(name)).actors) {
        const actor = a.data as Raw;
        // Parties and people; "government" is a kind of actor, not a name.
        if (actor.kind !== "party" && actor.kind !== "person") continue;
        names.add(String(actor.id));
        for (const v of Object.values((actor.name as Record<string, string>) ?? {})) names.add(v);
        for (const v of Object.values((actor.short_name as Record<string, string>) ?? {})) names.add(v);
      }
    }
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts")) files.push(p);
      }
    };
    for (const pkg of ["core", "files", "quotes", "cli"]) walk(join(ROOT, "packages", pkg, "src"));
    const found: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8").toLowerCase();
      for (const n of names) if (n.length > 3 && new RegExp(`(?<![a-z0-9-])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9-])`, "u").test(text)) found.push(`${f.slice(ROOT.length + 1)}: ${n}`);
    }
    expect(found).toEqual([]);
  });
});
