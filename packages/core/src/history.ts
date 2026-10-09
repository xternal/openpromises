import { CORRECTION_PATH } from "./schema";
import { issue, type Issue } from "./issues";

/**
 * Nothing is rewritten (RFC-0001 principle 3). Versions, events and replies
 * only grow; our own mistakes are fixed with a recorded correction, and
 * undoing the corrections must give back what was published. Ported from
 * Public Ledger's corrections and append-only check, with Russia Ledger's
 * guard against unsafe paths.
 */

/** JSON with sorted keys, so two values compare equal whatever order their keys were written in. Absent and undefined are the same. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

export const same = (a: unknown, b: unknown) => stable(a) === stable(b);

const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);

/** Read a field by a correction path's tail (".parameters.cost.note") inside one entry; absent reads as null. */
export function fieldAt(entry: unknown, tail: string): unknown {
  let v: unknown = entry;
  for (const k of tail.split(".").filter(Boolean)) v = v && typeof v === "object" && !UNSAFE.has(k) ? (v as Record<string, unknown>)[k] : undefined;
  return v === undefined ? null : v;
}

/** A copy of the entry with one field set (or removed, when the value is null). Refuses paths that would reach Object.prototype. */
export function withField(entry: unknown, tail: string, value: unknown): unknown {
  const keys = tail.split(".").filter(Boolean);
  if (!keys.length || keys.some((k) => UNSAFE.has(k))) throw new Error(`unsafe correction path: ${tail}`);
  const copy = structuredClone(entry) as Record<string, unknown>;
  let o = copy;
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== "object") o[k] = {};
    o = o[k] as Record<string, unknown>;
  }
  const last = keys.at(-1)!;
  if (value === null || value === undefined) delete o[last];
  else o[last] = value;
  return copy;
}

export interface ParsedPath {
  list: "versions" | "events" | "replies";
  index: number;
  /** ".parameters.cost.range" */
  tail: string;
}

export function parseCorrectionPath(path: string): ParsedPath | null {
  const m = CORRECTION_PATH.exec(path);
  return m ? { list: m[1] as ParsedPath["list"], index: Number(m[2]), tail: m[3]! } : null;
}

const HISTORY = ["versions", "events", "replies"] as const;

/**
 * Fields added to the format after cards were published (decision 13.1).
 * Filling one in on a published entry that never had it is not a rewrite of
 * history, so it needs no correction; once it has a value, changing it is a
 * correction like any other. Listed in docs/FORMAT.md §9, with the date each
 * was added.
 */
export const LATE_FIELDS: Readonly<Record<(typeof HISTORY)[number], readonly string[]>> = {
  // Who made a cost's central figure (decision 14), added 9 October 2026.
  versions: [".parameters.cost.by"],
  events: [],
  replies: [],
};

/** The entry as it stands, without any late field the published entry did not have. */
function withoutLateFields(key: (typeof HISTORY)[number], published: unknown, now: unknown): unknown {
  let out = now;
  for (const tail of LATE_FIELDS[key]) if (fieldAt(published, tail) === null && fieldAt(out, tail) !== null) out = withField(out, tail, null);
  return out;
}

const list = (o: Record<string, unknown>, k: string): unknown[] => (Array.isArray(o[k]) ? (o[k] as unknown[]) : []);

/**
 * Compare a published card (before) with the card now (after), both in the
 * same format. Every entry in versions, events and replies must still be
 * there, in the same place, and unchanged, unless corrections appended in this
 * change record exactly what changed: undoing them, newest first, must give
 * back the published entry. Corrections and reviews never change either.
 * A late field (LATE_FIELDS) may be filled in once where the published entry
 * lacked it. Key order and YAML style never matter.
 */
export function appendOnlyIssues(before: unknown, after: unknown): Issue[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const out: Issue[] = [];
  const add = (path: (string | number)[], message: string) => out.push(issue("append-only", path, message));

  if (b.id !== undefined && a.id !== b.id) add(["id"], `the id changed from "${String(b.id)}" to "${String(a.id)}"; a published card keeps its id`);

  const oldCorrections = list(b, "corrections");
  const allCorrections = list(a, "corrections");
  oldCorrections.forEach((c, i) => {
    if (!same(c, allCorrections[i])) add(["corrections", i], "was changed or removed; corrections are history too (add a new correction instead)");
  });
  const oldReviews = list(b, "reviews");
  const reviews = list(a, "reviews");
  oldReviews.forEach((r, i) => {
    if (!same(r, reviews[i])) add(["reviews", i], "was changed or removed; reviews are history (add a new review instead)");
  });

  const fresh = allCorrections.slice(oldCorrections.length) as { path?: unknown; was?: unknown }[];
  for (const key of HISTORY) {
    const was = list(b, key);
    const now = list(a, key).map((entry, i) => (i < was.length && entry !== undefined ? withoutLateFields(key, was[i], entry) : entry));
    was.forEach((item, i) => {
      if (same(item, now[i])) return;
      if (now[i] === undefined) {
        add([key, i], "was removed; history is append-only (record what happened as a new entry instead)");
        return;
      }
      const prefix = `${key}[${i}].`;
      const fixes = fresh.filter((c): c is { path: string; was?: unknown } => typeof c.path === "string" && c.path.startsWith(prefix));
      if (!fixes.length) {
        add([key, i], "was changed; history is append-only (add a new entry, or record our own mistake as a correction)");
        return;
      }
      // Undo the recorded corrections, newest first; what is left must be the published entry.
      let undone: unknown = now[i];
      try {
        for (const c of [...fixes].reverse()) undone = withField(undone, c.path.slice(prefix.length - 1), c.was ?? null);
      } catch (e) {
        add([key, i], (e as Error).message);
        return;
      }
      if (!same(undone, item)) add([key, i], "changed in ways its corrections do not record: undoing them does not give back the published entry");
    });
  }
  return out;
}
