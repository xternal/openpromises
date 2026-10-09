import { isPair, isSeq, LineCounter, parseDocument, visit, type Node, type Pair } from "yaml";
import type { Config } from "@openpromises/core";

/**
 * Decision 16: when `openpromises migrate` rewrites a file in format v1, the
 * notes an older format kept as YAML comments move into the fields made for
 * them, and every comment is accounted for in the report: moved, already said
 * by the configuration, or left for an editor. None is dropped silently.
 */

export interface CommentLine {
  /** 1-based line number in the original file. */
  line: number;
  /** The comment's text, without the "#". */
  text: string;
  /** The field the comment stands above, as a path in the original file: ["roles", 0, "from"]. */
  path: (string | number)[];
}

/** Every comment line in a YAML text, with the field it stands above. */
export function commentLines(text: string): CommentLine[] {
  const lines = text.split("\n");
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter });
  const at = new Map<number, (string | number)[]>();
  const pathOf = (ancestors: readonly unknown[]): (string | number)[] => {
    const out: (string | number)[] = [];
    let prev: unknown;
    for (const node of ancestors) {
      if (isPair(node)) out.push(String((node as Pair).key));
      if (isSeq(prev)) out.push(prev.items.indexOf(node as Node));
      prev = node;
    }
    return out;
  };
  visit(doc, {
    Pair(_, pair, path) {
      const key = pair.key as Node | null;
      if (key?.range) at.set(counter.linePos(key.range[0]).line, pathOf([...path, pair]));
    },
    Seq(_, seq, path) {
      seq.items.forEach((item, i) => {
        const node = item as Node | null;
        if (!node?.range) return;
        const line = counter.linePos(node.range[0]).line;
        // A map item's first key shares its line: keep the deeper path, which names the item too.
        if (!at.has(line)) at.set(line, [...pathOf(path), i]);
      });
    },
  });
  const out: CommentLine[] = [];
  lines.forEach((l, i) => {
    const m = /^\s*#\s?(.*)$/.exec(l);
    if (!m) return;
    let next = i + 1;
    while (next < lines.length && (/^\s*#/.test(lines[next]!) || !lines[next]!.trim())) next++;
    out.push({ line: i + 1, text: m[1]!.trim(), path: at.get(next + 1) ?? [] });
  });
  return out;
}

export type CommentOutcome = "moved" | "configuration" | "partly moved" | "not placed";

export interface CommentReport {
  line: number;
  text: string;
  outcome: CommentOutcome;
  /** Where it went, or why not. */
  detail: string;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "checked 8 Oct 2026" → "2026-10-08"; undefined when the text names no such date. */
function checkedOn(text: string): string | undefined {
  const m = /checked (\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})/.exec(text);
  const month = m ? MONTHS[m[2]!.toLowerCase()] : undefined;
  return m && month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : undefined;
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Move a converted file's comments into their fields. Only formats whose
 * comments are known are placed (Public Ledger's); in any other, every
 * comment is reported for an editor. `data` is the file already in format v1.
 */
export function placeComments(format: string, kind: "card" | "actor", text: string, data: unknown, config: Pick<Config, "actors" | "locales">): { data: unknown; report: CommentReport[] } {
  const lines = commentLines(text);
  if (!lines.length) return { data, report: [] };
  const out = structuredClone(data) as Raw;
  const lang = config.locales.default;
  const report: CommentReport[] = [];
  const done = (c: CommentLine, outcome: CommentOutcome, detail: string) => report.push({ line: c.line, text: c.text, outcome, detail });
  const left = (c: CommentLine) => done(c, "not placed", "no field holds it; an editor decides");

  // Consecutive comment lines above the same field are one note.
  const groups: CommentLine[][] = [];
  for (const c of lines) {
    const last = groups.at(-1);
    if (last && last.at(-1)!.line === c.line - 1 && JSON.stringify(last[0]!.path) === JSON.stringify(c.path)) last.push(c);
    else groups.push([c]);
  }

  for (const group of groups) {
    const [first] = group;
    const path = first!.path;
    if (format !== "public-ledger") {
      group.forEach(left);
      continue;
    }
    // A contract's reason for being linked.
    if (kind === "card" && path[0] === "contracts" && typeof path[1] === "number") {
      const links = isObj(out.links) ? out.links : undefined;
      const refs = links && Array.isArray(links.contracts) ? (links.contracts as unknown[]) : undefined;
      const ref = refs?.[path[1]];
      if (ref !== undefined && !(isObj(ref) && ref.note)) {
        refs![path[1]] = { ...(isObj(ref) ? ref : { ocid: ref }), note: { [lang]: group.map((c) => c.text).join(" ") } };
        group.forEach((c) => done(c, "moved", `links.contracts[${path[1]}].note`));
        continue;
      }
    }
    if (kind === "actor") {
      // When the official pages were checked.
      const date = path[0] === "same_as" && group.length === 1 ? checkedOn(first!.text) : undefined;
      if (date && out.same_as_checked_on === undefined) {
        out.same_as_checked_on = date;
        done(first!, "moved", `same_as_checked_on: ${date}`);
        continue;
      }
      // An identifier the configuration already describes, and links to by template.
      if (typeof path[0] === "string" && path.length === 1 && config.actors.ids && path[0] in config.actors.ids) {
        group.forEach((c) => done(c, "configuration", `the configuration describes ${path[0]} (actors.ids), so the comment adds nothing`));
        continue;
      }
      // Where a role is confirmed: "Source: <url> ("<words>")".
      if (path[0] === "roles" && typeof path[1] === "number") {
        const roles = Array.isArray(out.roles) ? (out.roles as Raw[]) : [];
        const role = roles[path[1]];
        for (const c of group) {
          const m = /^Source: (https?:\/\/\S+)(?:\s+\((.*)\))?$/.exec(c.text);
          if (!role || !m || role.source) {
            left(c);
            continue;
          }
          const quoted = m[2] ? /^"(.+?)"(.*)$/.exec(m[2]) : null;
          role.source = quoted ? { url: m[1], quote: quoted[1] } : { url: m[1] };
          const rest = quoted ? quoted[2]!.replace(/^[\s,;:]+/, "").trim() : (m[2] ?? "").trim();
          if (rest) done(c, "partly moved", `roles[${path[1]}].source keeps the address${quoted ? " and the quoted words" : ""}; not kept: "${rest}"`);
          else done(c, "moved", `roles[${path[1]}].source`);
        }
        continue;
      }
    }
    group.forEach(left);
  }
  return { data: out, report };
}
