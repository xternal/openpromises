import { Document, isMap, isScalar, isSeq, parse, parseDocument, Scalar, visit, type Node, type ToStringOptions, type YAMLMap, type YAMLSeq } from "yaml";
import { same } from "@openpromises/core";

/**
 * Writing YAML with stable formatting. A whole file (a new or migrated card)
 * is written in a fixed key order, with dates in quotation marks and long text
 * folded into paragraphs; every value must read back exactly, or a plainer
 * style is used. Adding to a list in an existing file (an event, a review)
 * inserts only the new lines, so the change is easy to review and the rest of
 * the file, written by hand, is left as it was.
 *
 * Files are written in YAML 1.1 style, which quotes strings like "yes", "on"
 * and dates, so they read the same in older YAML parsers (PyYAML) too.
 */

type Kind = "card" | "actor" | "editors";

/** Field order per kind of object; fields not listed keep their order, after the listed ones. */
const ORDER: Record<string, readonly string[]> = {
  card: ["format", "id", "headline", "actor_id", "made_on", "venue", "venue_label", "area", "status", "status_note", "brought_about_by", "responsible", "origin", "sources", "versions", "events", "replies", "corrections", "reviews", "links", "x"],
  version: ["version", "text", "lang", "translations", "recorded_on", "source_url", "archived_url", "page", "quote_checked_on", "source_text", "parameters"],
  parameters: ["who", "cost", "capital_cost", "when", "deadline", "funded_by", "funding_verifiable", "metric"],
  cost: ["range", "quality", "by", "note", "sources"],
  costBy: ["kind", "name"],
  ref: ["actor_id", "note"],
  source: ["title", "url", "archived_url", "kind", "designation"],
  event: ["date", "type", "subtype", "text", "evidence_url", "auto"],
  reply: ["from_actor_id", "from", "date", "text", "lang", "translations", "url", "editor_response"],
  correction: ["date", "path", "was", "now", "reason", "source_url"],
  review: ["by", "kind", "on", "approves", "batch", "note"],
  links: ["contracts", "decisions", "lever", "measurement", "ward"],
  contract: ["ocid", "award_id", "notice_url", "note"],
  actor: ["format", "id", "kind", "name", "short_name", "party_id", "standing", "level", "seats", "roles", "identifiers", "same_as", "same_as_checked_on", "x"],
  role: ["title", "from", "to", "source"],
  roleSource: ["url", "quote"],
  editor: ["handle", "since", "until", "party"],
  editors: ["editors"],
};

/** What kind of object sits under a field, so its fields can be ordered. Values inside was, now and x are left alone. */
const CHILD: Record<string, Record<string, string>> = {
  card: { brought_about_by: "ref", responsible: "ref", sources: "source", versions: "version", events: "event", replies: "reply", corrections: "correction", reviews: "review", links: "links" },
  version: { parameters: "parameters" },
  parameters: { cost: "cost", capital_cost: "cost" },
  cost: { by: "costBy", sources: "source" },
  actor: { roles: "role" },
  role: { source: "roleSource" },
  links: { contracts: "contract" },
  editors: { editors: "editor" },
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function ordered(value: unknown, kind: string): unknown {
  if (Array.isArray(value)) return value.map((v) => ordered(v, kind));
  if (!isObj(value)) return value;
  const order = ORDER[kind] ?? [];
  const keys = [...order.filter((k) => k in value), ...Object.keys(value).filter((k) => !order.includes(k))];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (value[k] === undefined) continue;
    const child = CHILD[kind]?.[k];
    out[k] = child ? ordered(value[k], child) : value[k];
  }
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LINE_WIDTH = 100;
/** Text with spaces longer than this is folded into a paragraph (`>-`). */
const FOLD_OVER = 80;
/** Lists of numbers (ranges, spans) are written on one line. */
const isNumberList = (n: YAMLSeq) => n.items.length > 0 && n.items.length <= 4 && n.items.every((i) => isScalar(i) && typeof i.value === "number");

function render(value: unknown, style: "folded" | "plain" | "quoted"): string {
  const doc = new Document(value, { version: "1.1" });
  visit(doc, {
    Seq(_, node) {
      if (isNumberList(node)) node.flow = true;
    },
    Scalar(key, node) {
      if (key !== "value" || typeof node.value !== "string" || style === "quoted") return;
      if (ISO_DATE.test(node.value)) node.type = Scalar.QUOTE_DOUBLE;
      else if (style === "folded" && node.value.length > FOLD_OVER && node.value.includes(" ") && !node.value.includes("\n")) node.type = Scalar.BLOCK_FOLDED;
    },
  });
  const opts: ToStringOptions =
    style === "quoted"
      ? { lineWidth: 0, defaultStringType: "QUOTE_DOUBLE", defaultKeyType: "PLAIN", flowCollectionPadding: false }
      : { lineWidth: LINE_WIDTH, minContentWidth: 40, flowCollectionPadding: false };
  return doc.toString(opts);
}

/** Read YAML the way the engine does (YAML 1.2, so dates stay text). */
export const readYaml = (text: string): unknown => parse(text, { prettyErrors: false });

/** A whole file as YAML, in a fixed field order, that reads back exactly as the value. */
export function toYaml(value: unknown, kind: Kind): string {
  const want = ordered(value, kind);
  for (const style of ["folded", "plain", "quoted"] as const) {
    const out = render(want, style);
    if (same(readYaml(out), want)) return out;
  }
  throw new Error("the value does not survive a YAML round trip");
}

/** One list item as YAML lines ("- date: …"), indented by `indent` spaces. */
function itemLines(item: unknown, kind: string, indent: number): string {
  const yaml = toYaml([ordered(item, kind)], "card").replace(/\n$/, "");
  const pad = " ".repeat(indent);
  return yaml
    .split("\n")
    .map((l) => (l ? pad + l : l))
    .join("\n");
}

const lineStart = (text: string, offset: number) => text.lastIndexOf("\n", offset - 1) + 1;

/**
 * Add items to the end of a top-level list in a YAML file (events, reviews),
 * inserting only the new lines. Creates the list if the file has none.
 */
export function appendToList(text: string, key: "events" | "reviews" | "replies" | "corrections", items: readonly unknown[], kind: string): string {
  if (!items.length) return text;
  const doc = parseDocument(text);
  if (doc.errors.length) throw new Error(`not valid YAML: ${doc.errors[0]!.message}`);
  const root = doc.contents;
  if (!isMap(root)) throw new Error("the file is not a set of fields");
  const pair = (root as YAMLMap).items.find((p) => isScalar(p.key) && p.key.value === key);
  const node = pair?.value as Node | null | undefined;
  const block = (indent: number) => items.map((i) => itemLines(i, kind, indent)).join("\n");

  let out: string;
  if (!pair) {
    // No list yet: add one at the end of the file.
    out = `${text.replace(/\n*$/, "\n")}${key}:\n${block(2)}\n`;
  } else if (isSeq(node) && !node.flow && node.items.length && node.range) {
    // A block list: insert after its last item, at the same indentation.
    const first = node.items[0] as Node;
    const indent = first.range![0] - lineStart(text, first.range![0]) - 2;
    // After the line the last item's value ends on.
    const end = (node.items[node.items.length - 1] as Node).range![1];
    const at = text[end - 1] === "\n" ? end : text.indexOf("\n", end) + 1 || text.length;
    const before = text.slice(0, at);
    out = `${before}${before.endsWith("\n") ? "" : "\n"}${block(Math.max(indent, 0))}\n${text.slice(at)}`;
  } else if ((isSeq(node) && (node.flow || !node.items.length)) || node === null || (isScalar(node) && node.value === null)) {
    // An empty list ("events: []" or "events:"): replace it with a block list.
    const start = node?.range ? node.range[0] : (pair.key as Node).range![1] + 1;
    const end = node?.range ? node.range[1] : start;
    const keyIndent = (pair.key as Node).range![0] - lineStart(text, (pair.key as Node).range![0]);
    out = `${text.slice(0, start).replace(/[ \t]*$/, "")}\n${block(keyIndent + 2)}${text.slice(end)}`;
  } else {
    throw new Error(`${key} is not a list`);
  }
  // The result must be the same file plus the new items.
  const before = readYaml(text) as Record<string, unknown>;
  const after = readYaml(out) as Record<string, unknown>;
  const expected = { ...before, [key]: [...((before[key] as unknown[] | null) ?? []), ...items] };
  if (!same(after, expected)) throw new Error(`could not add to ${key} without changing anything else`);
  return out;
}

/**
 * Set one field of an object in a YAML file (versions[0].quote_checked_on),
 * changing only that line: the value is replaced where it is, or a new line is
 * added after the object's last field. Falls back to rewriting the file when
 * the object is written on one line.
 */
export function setField(text: string, objectPath: (string | number)[], key: string, value: string | number | boolean | null): string {
  const doc = parseDocument(text);
  const map = doc.getIn(objectPath, true);
  const expected = readYaml(text) as Record<string, unknown>;
  let target: Record<string, unknown> = expected;
  for (const p of objectPath) target = (target as Record<string | number, unknown>)[p] as Record<string, unknown>;
  if (target && typeof target === "object") target[key] = value;
  const rendered = toYaml({ [key]: value }, "card").trimEnd().slice(key.length + 2);
  let out: string | null = null;
  if (isMap(map) && !map.flow && map.items.length) {
    const pair = map.items.find((p) => isScalar(p.key) && p.key.value === key);
    const v = pair?.value as Node | null | undefined;
    if (pair && isScalar(v) && v.range) out = `${text.slice(0, v.range[0])}${rendered}${text.slice(v.range[1])}`;
    else if (!pair) {
      const firstKey = map.items[0]!.key as Node;
      const indent = firstKey.range![0] - lineStart(text, firstKey.range![0]);
      const last = map.items[map.items.length - 1]!;
      const end = ((last.value as Node | null)?.range ?? (last.key as Node).range!)[1];
      const at = text[end - 1] === "\n" ? end : text.indexOf("\n", end) + 1 || text.length;
      const before = text.slice(0, at);
      out = `${before}${before.endsWith("\n") ? "" : "\n"}${" ".repeat(indent)}${key}: ${rendered}\n${text.slice(at)}`;
    }
  }
  if (out !== null && same(readYaml(out), expected)) return out;
  return setIn(text, [...objectPath, key], value);
}

/** Set a field anywhere in a YAML file by rewriting the file (setField changes less). */
export function setIn(text: string, path: (string | number)[], value: unknown): string {
  const doc = parseDocument(text);
  const node = doc.createNode(value);
  if (typeof value === "string" && ISO_DATE.test(value) && isScalar(node)) node.type = Scalar.QUOTE_DOUBLE;
  doc.setIn(path, node);
  return doc.toString({ lineWidth: 0 });
}
