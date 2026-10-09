import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { Config, FileIssue } from "@openpromises/core";
import { checkFolder, folderSource, readContent } from "@openpromises/files";
import { checkLifting, overlay } from "./engine";

/**
 * Does the engine catch what the site's own checks catch? Each mutation
 * breaks one real card in memory the way one of the site's checks forbids,
 * and the engine must refuse it. History mutations are committed to a
 * throwaway git repository holding a copy of the content, then checked with
 * the engine's own `validate` path (append-only against the commit before).
 * The site's folder is only read.
 */

type Raw = Record<string, any>;

export interface Mutation {
  /** What is broken, in the site's words where it has a check for it. */
  check: string;
  /** What the site's own validator does: refuses it, warns, or has no check (null). */
  site: "error" | "warning" | null;
  card: string;
  kind: "validate" | "history";
  /** The card as committed before the change (history only); the card as it is when left out. */
  before?: (card: Raw) => Raw;
  /** The change; null deletes the card. */
  change: (card: Raw) => Raw | null;
  /** A change the site allows: the engine must not refuse it. */
  allowed?: boolean;
}

export interface Caught {
  mutation: Mutation;
  /** The strongest new issue the engine raised for the card: error, warning, or none. */
  engine: "error" | "warning" | null;
  rules: string[];
  message?: string;
}

const key = (i: FileIssue) => `${i.file}|${i.rule}|${i.path.join(".")}|${i.message}`;
const strongest = (fresh: FileIssue[]): Caught["engine"] => (fresh.some((i) => i.severity === "error") ? "error" : fresh.length ? "warning" : null);
const file = (id: string) => `promises/${id}.yaml`;
const write = (raw: Raw) => stringify(raw, { lineWidth: 0 });

export function runMutations(contentDir: string, config: Config, mutations: readonly Mutation[]): Caught[] {
  const base = folderSource(contentDir);
  const original = (id: string) => parse(base.read(file(id)) ?? "") as Raw;
  const baseline = new Set(checkLifting(readContent(base, config)).result.issues.map(key));

  const out: Caught[] = [];
  for (const m of mutations.filter((x) => x.kind === "validate")) {
    const changed = m.change(original(m.card));
    const checked = checkLifting(readContent(overlay(base, { [file(m.card)]: changed === null ? null : write(changed) }), config));
    const fresh = checked.result.issues.filter((i) => i.file === file(m.card) && !baseline.has(key(i)));
    out.push({ mutation: m, engine: strongest(fresh), rules: [...new Set(fresh.map((i) => i.rule))], message: fresh[0]?.message });
  }

  const history = mutations.filter((x) => x.kind === "history");
  if (history.length) {
    const repo = mkdtempSync(join(tmpdir(), "openpromises-dry-run-"));
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=dry run", "-c", "user.email=dry-run@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, stdio: "ignore" });
    try {
      const content = join(repo, "content");
      cpSync(contentDir, content, { recursive: true });
      git("init", "-q");
      git("add", "-A");
      git("commit", "-q", "-m", "copy of the content");
      for (const m of history) {
        const path = join(content, file(m.card));
        const card = original(m.card);
        if (m.before) {
          writeFileSync(path, write(m.before(card)));
          git("commit", "-q", "-am", "before");
        }
        const changed = m.change(m.before ? m.before(card) : card);
        if (changed === null) rmSync(path);
        else writeFileSync(path, write(changed));
        const fresh = checkFolder(content, config, { base: "HEAD" }).issues.filter((i) => i.rule === "append-only" && i.file === file(m.card));
        out.push({ mutation: m, engine: strongest(fresh), rules: [...new Set(fresh.map((i) => i.rule))], message: fresh[0]?.message });
        git("checkout", "-q", "--", ".");
        if (m.before) git("reset", "-q", "--hard", "HEAD~1");
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }
  return out;
}
