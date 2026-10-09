import { readFileSync, existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { appendOnlyIssues, validateContent, type Config, type ContentResult, type FileIssue } from "@openpromises/core";
import { readContent, type Migrated } from "./read";
import { folderSource, gitSource, resolveBase } from "./source";

/**
 * The whole check `openpromises validate` runs on a content folder: every
 * file against the format and the rules, then every published card against
 * the base branch (append-only).
 */

export interface CheckOptions {
  /** The git ref to compare with; undefined finds one (VALIDATE_BASE, then origin/$GITHUB_BASE_REF, then origin/main); null skips the comparison. */
  base?: string | null;
  /** An editors list outside the content folder. */
  editorsFile?: string;
}

export interface CheckResult extends ContentResult {
  issues: FileIssue[];
  /** Files read in the older format and converted on the way in. */
  migrated: Migrated[];
  base: { ref: string | null; compared: number; note?: string };
}

export function checkFolder(contentDir: string, config: Config, opts: CheckOptions = {}): CheckResult {
  const source = folderSource(contentDir);
  let editors: { file: string; text: string | null } | undefined;
  if (opts.editorsFile) {
    const path = resolve(opts.editorsFile);
    editors = { file: relative(contentDir, path) || path, text: existsSync(path) ? readFileSync(path, "utf8") : null };
    if (editors.text === null) throw new Error(`there is no editors list at ${opts.editorsFile}`);
  }
  const read = readContent(source, config, editors ? { editors } : {});
  const result = validateContent(read.input);
  const issues = [...read.issues, ...result.issues];

  const base: CheckResult["base"] = { ref: null, compared: 0 };
  if (opts.base !== null) {
    const ref = resolveBase(contentDir, opts.base);
    if (!ref) {
      if (opts.base) throw new Error(`the base "${opts.base}" is not a commit or branch in this repository`);
      base.note = "no base branch to compare with (VALIDATE_BASE, origin/$GITHUB_BASE_REF or origin/main), so the append-only check was skipped";
    } else {
      base.ref = ref;
      const before = readContent(gitSource(contentDir, ref), config, { publishedOnly: true });
      const now = new Map(read.input.cards.map((c) => [c.file, c]));
      const drafts = new Set(read.input.cards.filter((c) => c.where === "drafts").map((c) => c.file.slice("drafts/".length)));
      for (const was of before.input.cards) {
        base.compared++;
        const name = was.file.slice("promises/".length);
        const current = now.get(was.file);
        if (!current) {
          issues.push({
            file: was.file,
            rule: "append-only",
            severity: "error",
            path: [],
            message: drafts.has(name)
              ? `was published on ${ref} and is back in drafts/; a published card never returns to drafts`
              : `was published on ${ref} and has been deleted or renamed; published cards are never removed (record what happened as an event or a correction)`,
          });
          continue;
        }
        for (const i of appendOnlyIssues(was.data, current.data)) issues.push({ file: was.file, ...i });
      }
      if (!before.input.cards.length) base.note = `nothing is published on ${ref} yet, so there was nothing to compare`;
    }
  }
  return { ...result, issues, migrated: read.migrated, base };
}
