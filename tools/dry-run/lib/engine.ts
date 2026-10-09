import { execFileSync } from "node:child_process";
import { todayIn, validateContent, type Config, type ContentInput, type ContentResult, type FileIssue } from "@openpromises/core";
import { folderSource, loadConfig, readContent, type ContentSource, type ReadResult } from "@openpromises/files";
import { cardViews, publishFiles, type CardView, type PublishedFile } from "@openpromises/publish";

/**
 * The engine's side of the dry run: the site's content read as it is, checked
 * by the rules, and everything the engine would publish for it, built in
 * memory. Nothing is written to the site's folder.
 */

const UNKNOWN_FIELD = /is not a field of format v\d+/;

export interface Lifted {
  file: string;
  /** Where the field was: "versions.0.parameters.costed_by". */
  path: string;
}

export interface Checked {
  read: ReadResult;
  /** The engine as it is: fields format v1 has no place for are errors. */
  strict: ContentResult;
  /**
   * The same content with those fields taken out, so everything else can be
   * compared. A field taken out here is lost from every page, feed and file
   * the engine would make; the report says which.
   */
  result: ContentResult;
  lifted: Lifted[];
}

/** Check content, then again without the fields format v1 cannot hold. */
export function checkLifting(read: ReadResult): Checked {
  const strict = validateContent(read.input);
  const lifted: Lifted[] = [];
  let input: ContentInput = read.input;
  let result = strict;
  for (let round = 0; round < 3; round++) {
    const unknown = result.issues.filter((i) => i.rule === "schema" && UNKNOWN_FIELD.test(i.message) && i.path.length);
    if (!unknown.length) break;
    const cards = input.cards.map((c) => ({ ...c, data: structuredClone(c.data) }));
    for (const i of unknown) {
      const card = cards.find((c) => c.file === i.file);
      if (!card || !deletePath(card.data, i.path)) continue;
      lifted.push({ file: i.file, path: i.path.join(".") });
    }
    input = { ...input, cards };
    result = validateContent(input);
  }
  return { read, strict, result, lifted };
}

function deletePath(data: unknown, path: readonly (string | number)[]): boolean {
  let at: unknown = data;
  for (const key of path.slice(0, -1)) {
    if (!at || typeof at !== "object") return false;
    at = (at as Record<string | number, unknown>)[key];
  }
  if (!at || typeof at !== "object") return false;
  const last = path.at(-1)!;
  if (!(last in at)) return false;
  delete (at as Record<string | number, unknown>)[last];
  return true;
}

export interface EngineRun extends Checked {
  config: Config;
  contentDir: string;
  today: string;
  views: CardView[];
  /** Published cards only: what readers see. */
  published: CardView[];
  files: Map<string, PublishedFile>;
}

export async function runEngine(configFile: string, contentDir: string, today?: string): Promise<EngineRun> {
  const { config } = await loadConfig(configFile);
  const checked = checkLifting(readContent(folderSource(contentDir), config));
  const views = cardViews(checked.result.cards, checked.result.actors);
  const day = today ?? todayIn(config.timezone);
  const files = new Map(publishFiles({ config, views, today: day }).map((f) => [f.path, f]));
  return { ...checked, config, contentDir, today: day, views, published: views.filter((v) => v.where === "promises"), files };
}

/** A content source with some files replaced (or removed, with null). */
export function overlay(base: ContentSource, files: Record<string, string | null>): ContentSource {
  return {
    label: base.label,
    read: (path) => (path in files ? files[path]! : base.read(path)),
    list: (dir) => {
      const names = new Set(base.list(dir));
      for (const [path, text] of Object.entries(files)) {
        const slash = path.lastIndexOf("/");
        if (path.slice(0, slash) !== dir) continue;
        if (text === null) names.delete(path.slice(slash + 1));
        else names.add(path.slice(slash + 1));
      }
      return [...names].sort();
    },
  };
}

export const errorsOf = (issues: readonly FileIssue[], file?: string) => issues.filter((i) => i.severity === "error" && (!file || i.file === file));

/** The engine's version and commit, for the report. */
export function engineVersion(repo: string): string {
  const git = (args: string[]) => {
    try {
      return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return "";
    }
  };
  const commit = git(["rev-parse", "--short", "HEAD"]);
  const dirty = git(["status", "--porcelain", "--", "packages"]) ? " with uncommitted changes" : "";
  return `OpenPromises working copy at ${commit || "an unknown commit"}${dirty}`;
}
