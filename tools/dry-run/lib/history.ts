import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { relative, sep } from "node:path";
import { appendOnlyIssues, type Config } from "@openpromises/core";
import { gitRoot, gitSource, readContent } from "@openpromises/files";

/**
 * Every change the site has merged, replayed through the engine's
 * append-only check: each commit on the main line that touched published
 * cards, compared with the commit before it. The site accepted every one of
 * them, so each one the engine refuses is either a rewrite the site missed
 * (better) or a false alarm (worse). Read-only: git log, ls-tree and show.
 */

export interface Replayed {
  commit: string;
  date: string;
  subject: string;
  /** Published cards compared. */
  compared: number;
  issues: { file: string; message: string }[];
}

const git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });

export function replayHistory(contentDir: string, config: Config, ref: string): Replayed[] {
  const top = gitRoot(contentDir);
  if (!top) throw new Error(`${contentDir} is not in a git repository`);
  const prefix = relative(realpathSync(top), realpathSync(contentDir)).split(sep).join("/");
  const promises = [prefix, "promises"].filter(Boolean).join("/");
  const log = git(top, ["log", "--first-parent", "--format=%H%x09%cs%x09%s", ref, "--", promises]).trim();
  const commits = log ? log.split("\n").map((l) => l.split("\t") as [string, string, string]).reverse() : [];

  // Many commits share a tree of cards; read each tree once.
  const byTree = new Map<string, Map<string, unknown>>();
  const cardsAt = (commit: string): Map<string, unknown> => {
    let tree: string;
    try {
      tree = git(top, ["rev-parse", `${commit}:${promises}`]).trim();
    } catch {
      return new Map();
    }
    let cards = byTree.get(tree);
    if (!cards) {
      const read = readContent(gitSource(contentDir, commit), config, { publishedOnly: true });
      cards = new Map(read.input.cards.map((c) => [c.file, c.data]));
      byTree.set(tree, cards);
    }
    return cards;
  };

  return commits.map(([commit, date, subject]) => {
    const before = cardsAt(`${commit}^1`);
    const after = cardsAt(commit);
    const issues: Replayed["issues"] = [];
    for (const [file, was] of before) {
      const now = after.get(file);
      if (now === undefined) issues.push({ file, message: "was deleted or renamed" });
      else for (const i of appendOnlyIssues(was, now, config.legacy ? { legacy: config.legacy } : {})) issues.push({ file, message: i.message });
    }
    return { commit: commit.slice(0, 7), date, subject, compared: before.size, issues };
  });
}

export function headCommit(dir: string): string {
  return git(dir, ["rev-parse", "--short", "HEAD"]).trim();
}
