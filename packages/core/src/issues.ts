import type { z } from "zod";

export type Severity = "error" | "warning";
export type Path = (string | number)[];

/** One problem, with where it is and a plain message. Rules return lists of these. */
export interface Issue {
  /** The rule that found it (docs/FORMAT.md §13). */
  rule: string;
  severity: Severity;
  /** Where in the file: ["events", 2, "evidence_url"]. Empty for the whole file. */
  path: Path;
  message: string;
}

/** An issue found in one file of a content folder. */
export interface FileIssue extends Issue {
  /** The file, relative to the content folder: "promises/uk-bus-cap.yaml". */
  file: string;
}

export const issue = (rule: string, path: Path, message: string, severity: Severity = "error"): Issue => ({ rule, severity, path, message });

/** ["versions", 0, "parameters", "cost"] → "versions[0].parameters.cost" */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const p of path) out += typeof p === "number" ? `[${p}]` : out ? `.${String(p)}` : String(p);
  return out;
}

/** Turn a field path string back into parts: "events[3].date" → ["events", 3, "date"]. */
export function parsePath(path: string): Path {
  const out: Path = [];
  for (const m of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) out.push(m[2] !== undefined ? Number(m[2]) : m[1]!);
  return out;
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

function describeExpected(expected: string): string {
  switch (expected) {
    case "string":
      return "text";
    case "number":
      return "a number";
    case "boolean":
      return "true or false";
    case "array":
      return "a list";
    case "object":
    case "record":
      return "a set of fields";
    case "tuple":
      return "a list";
    default:
      return `${article(expected)} ${expected}`;
  }
}

/** Zod's own messages start like this; ours are complete phrases ("should be …", "is empty", "needs …"). */
const ZOD_DEFAULT = /^(Invalid|Too (small|big)|Unrecognized)/;

/** Zod's issues, reworded for people writing YAML by hand. */
export function zodIssues(error: z.ZodError, rule = "schema", prefix: Path = []): Issue[] {
  const out: Issue[] = [];
  for (const i of error.issues) {
    const path = [...prefix, ...(i.path as Path)];
    const custom = !ZOD_DEFAULT.test(i.message);
    // Parsed with reportInput, so a missing field shows as an issue whose input is undefined.
    const missing = "input" in i && i.input === undefined && i.code !== "unrecognized_keys" && i.code !== "custom";
    if (missing) {
      out.push(issue(rule, path, "is required"));
      continue;
    }
    switch (i.code) {
      case "unrecognized_keys":
        for (const key of i.keys) {
          const links = path.length > 0 && path[path.length - 1] === "links";
          out.push(
            issue(
              rule,
              [...path, key],
              links
                ? `"${key}" is not a module; the modules are contracts, decisions, lever, measurement and ward`
                : `"${key}" is not a field of format v1; check the spelling, or put the site's own fields in x`,
            ),
          );
        }
        break;
      case "invalid_type":
        out.push(issue(rule, path, custom ? i.message : `should be ${describeExpected(i.expected)}`));
        break;
      case "invalid_value": {
        const values = (i as { values?: unknown[] }).values ?? [];
        out.push(issue(rule, path, custom ? i.message : `should be ${values.length === 1 ? JSON.stringify(values[0]) : `one of ${values.map((v) => JSON.stringify(v)).join(", ")}`}`));
        break;
      }
      case "invalid_format":
        out.push(issue(rule, path, custom ? i.message : "is not in the right form"));
        break;
      case "too_small":
        out.push(issue(rule, path, custom ? i.message : `is too small (at least ${String(i.minimum)})`));
        break;
      case "too_big":
        out.push(issue(rule, path, custom ? i.message : `is too big (at most ${String(i.maximum)})`));
        break;
      case "invalid_union":
        out.push(issue(rule, path, custom ? i.message : "is not in any of the accepted forms (see docs/FORMAT.md)"));
        break;
      case "invalid_key":
        out.push(issue(rule, path, `has a key that is not allowed: ${i.issues.map((x) => x.message).join("; ")}`));
        break;
      default:
        out.push(issue(rule, path, i.message));
    }
  }
  return out;
}
