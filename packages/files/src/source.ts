import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

/**
 * Where content is read from: a folder on disk, or the same folder at a git
 * ref (the base branch, for the append-only check). Paths are relative to the
 * content folder and use "/". Git runs locally; nothing here uses the network.
 */
export interface ContentSource {
  /** What this is, for messages: "content/" or "origin/main:content/". */
  label: string;
  /** A file's text, or null when it does not exist. */
  read(path: string): string | null;
  /** The names of the files in a folder (not recursive), sorted; empty when the folder does not exist. */
  list(dir: string): string[];
}

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A content folder on disk. */
export function folderSource(dir: string): ContentSource {
  const root = resolve(dir);
  const inside = (path: string) => {
    const full = resolve(root, path);
    if (full !== root && !full.startsWith(root + sep)) throw new Error(`${path} is outside the content folder`);
    return full;
  };
  return {
    label: `${relative(process.cwd(), root) || "."}/`,
    read(path) {
      const full = inside(path);
      return existsSync(full) && statSync(full).isFile() ? readFileSync(full, "utf8") : null;
    },
    list(d) {
      const full = inside(d);
      if (!existsSync(full) || !statSync(full).isDirectory()) return [];
      return readdirSync(full, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .sort(byCodeUnit);
    },
  };
}

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/** The top of the git repository a folder is in, or null when it is not in one. */
export function gitRoot(dir: string): string | null {
  return git(dir, ["rev-parse", "--show-toplevel"])?.trim() ?? null;
}

/** A content folder as it is at a git ref, read with `git show` and `git ls-tree`. */
export function gitSource(contentDir: string, ref: string): ContentSource {
  const top = gitRoot(contentDir);
  if (!top) throw new Error(`${contentDir} is not in a git repository`);
  // Git reports real paths (on macOS /var is a link to /private/var), so compare real paths.
  const real = existsSync(contentDir) ? realpathSync(contentDir) : resolve(contentDir);
  const prefix = relative(realpathSync(top), real).split(sep).join("/");
  const at = (path: string) => [prefix, path].filter(Boolean).join("/");
  return {
    label: `${ref}:${prefix ? `${prefix}/` : ""}`,
    read(path) {
      return git(top, ["show", `${ref}:${at(path)}`]);
    },
    list(d) {
      // "<mode> <type> <object>\t<name>" per entry; only files (blobs).
      const out = git(top, ["ls-tree", `${ref}:${at(d)}`]);
      if (out === null) return [];
      return out
        .split("\n")
        .map((line) => /^\d+ blob [0-9a-f]+\t(.+)$/.exec(line)?.[1])
        .filter((name): name is string => !!name)
        .sort(byCodeUnit);
    },
  };
}

/**
 * The base a change is compared with: --base if given, else VALIDATE_BASE,
 * else origin/$GITHUB_BASE_REF (in a GitHub pull request), else origin/main.
 * The first one that exists; null when none does.
 */
export function resolveBase(dir: string, explicit?: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = explicit ? [explicit] : [env.VALIDATE_BASE, env.GITHUB_BASE_REF && `origin/${env.GITHUB_BASE_REF}`, "origin/main"];
  for (const ref of candidates) {
    if (ref && git(dir, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== null) return ref;
  }
  return null;
}

