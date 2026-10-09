import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  approvers,
  contentStats,
  formatPath,
  LEGACY_FORMATS,
  lexicon,
  lintCard,
  lintText,
  missedDeadline,
  OTHER_RULES,
  resolveConfig,
  RULES,
  Slug,
  todayIn,
  validateCard,
  validateContent,
  type Config,
  type FileIssue,
  type LegacyFormat,
  type Review,
} from "@openpromises/core";
import {
  appendToList,
  checkFolder,
  findConfig,
  folderSource,
  loadConfig,
  quoteKey,
  quoteLang,
  quoteUrl,
  QUOTES_FILE,
  readContent,
  readYaml,
  setField,
  sha256,
  toYaml,
  withQuoteCheck,
} from "@openpromises/files";
import { findSpan, matchQuote, textFromHtml } from "@openpromises/quotes";
import { onlyFlags, parseArgs, text, UsageError, type Args } from "./args";

/**
 * The openpromises command (RFC-0001 §6). Every command reads the site's
 * configuration (openpromises.config.* here or above, or --config), works on
 * local files only, and returns an exit code: 0 for success, 1 when it found
 * problems or refused, 2 for a usage mistake.
 */

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
  cwd: string;
  /** Today's date for this run (tests fix it); otherwise today in the site's time zone. */
  today?: string;
}

const defaultIo = (): Io => ({ out: (l) => console.log(l), err: (l) => console.error(l), cwd: process.cwd() });

interface Site {
  config: Config;
  configFile: string;
  contentDir: string;
  /** The content folder as the user sees it: "content/". */
  shown: string;
}

async function loadSite(args: Args, io: Io): Promise<Site> {
  const given = text(args, "config");
  const file = given ? resolve(io.cwd, given) : findConfig(io.cwd);
  if (!file) throw new UsageError("there is no openpromises.config.ts (or .yaml, .json) here or in a folder above; see docs/FORMAT.md §2");
  if (!existsSync(file)) throw new UsageError(`there is no configuration file at ${given}`);
  const loaded = await loadConfig(file);
  const content = text(args, "content");
  const contentDir = content ? resolve(io.cwd, content) : loaded.contentDir;
  return { config: loaded.config, configFile: loaded.file, contentDir, shown: `${relative(io.cwd, contentDir) || "."}/` };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const today = (io: Io, config: Config, args?: Args) => (args && text(args, "today")) ?? io.today ?? todayIn(config.timezone);

function printIssues(issues: readonly FileIssue[], shown: string, io: Io): void {
  for (const i of issues) {
    const where = i.path.length ? `${formatPath(i.path)}: ` : "";
    io.out(`${i.severity === "error" ? "error" : "warn "}  ${shown}${i.file}  ${where}${i.message}  (${i.rule})`);
  }
}

// ---------------------------------------------------------------- validate

async function validate(args: Args, io: Io): Promise<number> {
  onlyFlags(args, ["config", "content", "base", "no-base", "editors", "json"], "validate");
  const site = await loadSite(args, io);
  const editorsFile = text(args, "editors");
  const r = checkFolder(site.contentDir, site.config, {
    base: args.flags["no-base"] ? null : text(args, "base"),
    ...(editorsFile ? { editorsFile: resolve(io.cwd, editorsFile) } : {}),
  });
  const errors = r.issues.filter((i) => i.severity === "error").length;
  const warnings = r.issues.length - errors;
  const published = r.cards.filter((c) => c.where === "promises").length;
  const drafts = r.cards.length - published;
  if (args.flags.json) {
    io.out(JSON.stringify({ errors, warnings, published, drafts, actors: r.actors.size, migrated: r.migrated.length, base: r.base, issues: r.issues }, null, 2));
    return errors ? 1 : 0;
  }
  printIssues(r.issues, site.shown, io);
  if (r.issues.length) io.out("");
  io.out(`Checked ${plural(published, "published card")}, ${plural(drafts, "draft")} and ${plural(r.actors.size, "actor")} in ${site.shown}`);
  if (r.base.ref) io.out(`Append-only: compared ${plural(r.base.compared, "published card")} with ${r.base.ref}`);
  if (r.base.note) io.out(`Append-only: ${r.base.note}`);
  const cards = r.migrated.filter((m) => m.kind === "card").length;
  if (r.migrated.length && site.config.legacy)
    io.out(`Format: ${plural(cards, "card")} and ${plural(r.migrated.length - cards, "actor")} are in the ${site.config.legacy} format and were read as format v1 (openpromises migrate rewrites them)`);
  io.out(`${plural(errors, "error")}, ${plural(warnings, "warning")}`);
  return errors ? 1 : 0;
}

// ---------------------------------------------------------------- new

async function newCard(args: Args, io: Io): Promise<number> {
  onlyFlags(args, ["config", "content", "actor", "made-on", "venue", "area", "source-url", "quote", "today"], "new");
  const id = args.positional[0];
  if (!id || args.positional.length > 1) throw new UsageError("usage: openpromises new <id> --actor <actor id> [--made-on YYYY-MM-DD] [--venue <venue>] [--area <area>] [--source-url <url>] [--quote <words>]");
  if (!Slug.safeParse(id).success) throw new UsageError(`"${id}" is not a card id: use lower-case letters, digits and hyphens`);
  const actor = text(args, "actor");
  if (!actor) throw new UsageError("--actor is needed: the id of who made the promise (actors/<id>.yaml)");
  const site = await loadSite(args, io);
  for (const where of ["promises", "drafts"]) {
    if (existsSync(join(site.contentDir, where, `${id}.yaml`))) {
      io.err(`refused: ${site.shown}${where}/${id}.yaml already exists`);
      return 1;
    }
  }
  const day = today(io, site.config, args);
  const madeOn = text(args, "made-on") ?? day;
  const empty = Object.fromEntries(site.config.locales.all.map((l) => [l, ""]));
  const card = {
    format: "openpromises/1",
    id,
    headline: empty,
    actor_id: actor,
    made_on: madeOn,
    venue: text(args, "venue"),
    area: text(args, "area") ?? "",
    status: "promised",
    versions: [
      {
        version: 1,
        text: text(args, "quote") ?? "",
        recorded_on: day,
        source_url: text(args, "source-url") ?? "",
        quote_checked_on: null,
        parameters: { who: empty, when: empty, deadline: null, funded_by: null },
      },
    ],
    events: [{ date: madeOn, type: "promised", text: empty }],
    reviews: [],
  };
  const file = join(site.contentDir, "drafts", `${id}.yaml`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, toYaml(card, "card"));
  io.out(`Wrote ${site.shown}drafts/${id}.yaml. Fill in the empty fields (delete any the source does not state), then run openpromises validate.`);
  return 0;
}

// ---------------------------------------------------------------- review

async function review(args: Args, io: Io): Promise<number> {
  onlyFlags(args, ["config", "content", "by", "quote-checked", "note", "note.*", "editors", "today"], "review");
  const id = args.positional[0];
  const by = text(args, "by");
  if (!id || !by) throw new UsageError('usage: openpromises review <card id> --by "<editor handle>" [--quote-checked] [--note "…"]');
  const site = await loadSite(args, io);
  const { config } = site;
  const day = today(io, config, args);
  const refuse = (m: string) => {
    io.err(`refused: ${m}`);
    return 1;
  };

  const editorsFile = text(args, "editors");
  const read = readContent(
    folderSource(site.contentDir),
    config,
    editorsFile ? { editors: { file: editorsFile, text: existsSync(resolve(io.cwd, editorsFile)) ? readFileSync(resolve(io.cwd, editorsFile), "utf8") : null } } : {},
  );
  const result = validateContent(read.input);
  const entry = read.input.cards.find((c) => c.file === `drafts/${id}.yaml` || c.file === `promises/${id}.yaml`);
  if (!entry) return refuse(`there is no card or draft "${id}" in ${site.shown}`);
  if (read.migrated.some((m) => m.file === entry.file)) return refuse(`${entry.file} is in the ${config.legacy} format; run openpromises migrate first`);
  const valid = result.cards.find((c) => c.file === entry.file);
  if (!valid) return refuse(`${entry.file} does not pass the format check; run openpromises validate and fix it first`);
  const { card, where } = valid;
  if (!result.editors) return refuse(`there is no editors list (${config.editorial.editorsFile}), so nobody can approve cards`);
  const editor = result.editors.find((e) => e.handle === by);
  if (!editor) return refuse(`"${by}" is not in the editors list`);
  if (day < editor.since || (editor.until && day > editor.until)) return refuse(`${by} is not an editor on ${day}`);
  const ctx = { config, actors: result.actors, editors: result.editors };
  if (approvers(card, ctx).has(by)) return refuse(`${by} has already approved "${id}"; a second approval must come from a different editor`);
  const actor = result.actors.get(card.actor_id);
  const party = actor?.kind === "party" ? actor.id : actor?.party_id;
  if (editor.party && (editor.party === card.actor_id || editor.party === party)) return refuse(`${by} may not approve a card about their own party (${editor.party}); another editor does`);
  if (args.flags["quote-checked"] && where === "promises") return refuse("a published card's versions are history: record a correction instead of a new quote check");

  // The note, in one language (--note) or several (--note.en, --note.ru).
  const note: Record<string, string> = {};
  const plain = text(args, "note");
  if (plain) note[config.locales.default] = plain;
  for (const [k, v] of Object.entries(args.flags)) if (k.startsWith("note.") && typeof v === "string") note[k.slice(5)] = v;
  const r: Review = { by, kind: "editor", on: day, approves: true, ...(Object.keys(note).length ? { note } : {}) };

  const path = join(site.contentDir, entry.file);
  let yaml = readFileSync(path, "utf8");
  if (args.flags["quote-checked"]) card.versions.forEach((v, i) => !v.quote_checked_on && (yaml = setField(yaml, ["versions", i], "quote_checked_on", day)));
  yaml = appendToList(yaml, "reviews", [r], "review");

  const after = readYaml(yaml);
  const need = config.editorial.approvals;
  const check = validateCard(after, { ...ctx, where: "promises", quoteCheck: read.input.quoteCheck!, sourceText: read.input.sourceText! });
  const have = check.card ? approvers(check.card, ctx).size : 0;
  const publish = where === "drafts" && have >= need;
  if (publish) {
    const errors = check.issues.filter((i) => i.severity === "error");
    if (errors.length) {
      io.err(`refused: "${id}" would have its last approval, but it cannot be published yet:`);
      printIssues(
        errors.map((i) => ({ file: entry.file, ...i })),
        site.shown,
        { ...io, out: io.err },
      );
      return 1;
    }
  }
  writeFileSync(path, yaml);
  if (publish) {
    const target = join(site.contentDir, "promises", `${id}.yaml`);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(path, target);
    io.out(`${by} approved "${id}". It now has ${plural(have, "approval")}, so it moved to ${site.shown}promises/${id}.yaml: commit it and open a pull request; it is published when that is merged.`);
  } else {
    const left = Math.max(need - have, 0);
    io.out(`${by} approved "${id}" (${site.shown}${entry.file}).${where === "drafts" ? ` It needs ${plural(left, "more editor's approval", "more editors' approvals")}.` : ""}`);
  }
  return 0;
}

// ---------------------------------------------------------------- check-quote

async function checkQuote(args: Args, io: Io): Promise<number> {
  onlyFlags(args, ["config", "content", "text", "html", "version", "record", "today"], "check-quote");
  const id = args.positional[0];
  const textFile = text(args, "text");
  const htmlFile = text(args, "html");
  if (!id || (!textFile && !htmlFile)) throw new UsageError("usage: openpromises check-quote <card id> --text <file> | --html <file> [--version <n>] [--record]");
  const site = await loadSite(args, io);
  const read = readContent(folderSource(site.contentDir), site.config);
  const result = validateContent(read.input);
  const found = result.cards.find((c) => c.card.id === id);
  if (!found) {
    io.err(`refused: there is no valid card or draft "${id}" (run openpromises validate)`);
    return 1;
  }
  const n = text(args, "version") ? Number(text(args, "version")) : found.card.versions.length;
  const v = found.card.versions[n - 1];
  if (!v) throw new UsageError(`"${id}" has no version ${String(text(args, "version"))}`);
  const file = resolve(io.cwd, (textFile ?? htmlFile)!);
  if (!existsSync(file)) throw new UsageError(`there is no file at ${textFile ?? htmlFile}`);
  const bytes = readFileSync(file);
  const raw = bytes.toString("utf8");
  const sourceText = htmlFile ? textFromHtml(raw) : raw;
  const lang = quoteLang(v, site.config);
  const m = matchQuote(v.text, sourceText, { lang });
  if (m.tier === "exact") io.out(`exact: the words of version ${n} are in ${textFile ?? htmlFile}.`);
  else if (m.tier === "close") io.out(`close: the words are there only if case, punctuation and spacing are ignored. An editor checks them by eye and records quote_checked_on.`);
  else io.out(`none: the words are not there. The first ${plural(m.matchedWords ?? 0, "word")} of ${m.words} match; it differs from: "${m.missingFrom}"`);
  const span = textFile ? findSpan(v.text, raw) : null;
  if (span) io.out(`The quote is character for character at [${span[0]}, ${span[1]}]: stored as sources/<file>, it can be checked offline with source_text: { file: <file>, span: [${span[0]}, ${span[1]}] }.`);
  if (args.flags.record) {
    const url = quoteUrl(v);
    const quotesPath = join(site.contentDir, QUOTES_FILE);
    const existing = existsSync(quotesPath) ? readFileSync(quotesPath, "utf8") : null;
    writeFileSync(quotesPath, withQuoteCheck(existing, quoteKey(v.text, lang, url), { match: m.tier, url, checked_on: today(io, site.config, args), sha256: sha256(bytes) }));
    io.out(`Recorded in ${site.shown}${QUOTES_FILE} for ${url}.`);
  }
  return m.tier === "none" ? 1 : 0;
}

// ---------------------------------------------------------------- deadlines

async function deadlines(args: Args, io: Io): Promise<number> {
  onlyFlags(args, ["config", "content", "today", "dry-run"], "deadlines");
  const site = await loadSite(args, io);
  const day = today(io, site.config, args);
  const read = readContent(folderSource(site.contentDir), site.config);
  const migrated = new Set(read.migrated.map((m) => m.file));
  const result = validateContent(read.input);
  let n = 0;
  for (const { file, where, card } of result.cards) {
    if (where !== "promises") continue;
    const event = missedDeadline(card, site.config, day);
    if (!event) continue;
    if (migrated.has(file)) {
      io.err(`skipped ${site.shown}${file}: it is in the ${site.config.legacy} format; run openpromises migrate first`);
      continue;
    }
    io.out(`${card.id}: the deadline ${card.versions.at(-1)!.parameters!.deadline} passed (status ${card.status})`);
    if (!args.flags["dry-run"]) {
      const path = join(site.contentDir, file);
      writeFileSync(path, appendToList(readFileSync(path, "utf8"), "events", [event], "event"));
    }
    n++;
  }
  io.out(args.flags["dry-run"] ? `Dry run: ${plural(n, "deadline_missed event")} would be added; nothing was written.` : `Added ${plural(n, "deadline_missed event")} (${day}).`);
  return 0;
}

// ---------------------------------------------------------------- lint

async function lint(args: Args, io: Io): Promise<number> {
  onlyFlags(args, ["config", "content"], "lint");
  const site = await loadSite(args, io);
  const result = validateContent(readContent(folderSource(site.contentDir), site.config).input);
  const issues: FileIssue[] = result.cards.flatMap(({ file, card }) => lintCard(card, site.config).map((i) => ({ file, ...i })));
  for (const [locale, labels] of Object.entries(site.config.labels)) {
    const lex = lexicon(site.config, locale);
    for (const [status, label] of Object.entries(labels))
      for (const word of lintText(label, lex)) issues.push({ file: relative(site.contentDir, site.configFile), rule: "lint", severity: "error", path: ["labels", locale, status], message: `"${word}" passes judgement; a status label states a fact` });
  }
  printIssues(issues, site.shown, io);
  io.out(`${issues.length ? "\n" : ""}Linted ${plural(result.cards.length, "card")} and the status labels: ${plural(issues.length, "judgement word")} found`);
  return issues.length ? 1 : 0;
}

// ---------------------------------------------------------------- migrate

async function migrate(args: Args, io: Io): Promise<number> {
  onlyFlags(args, ["config", "content", "from", "in", "out", "dry-run"], "migrate");
  const from = text(args, "from");
  if (from && !(LEGACY_FORMATS as readonly string[]).includes(from)) throw new UsageError(`--from is one of ${LEGACY_FORMATS.join(", ")}`);
  const inDir = text(args, "in");
  let config: Config;
  let source: string;
  let shown: string;
  if (inDir) {
    const file = text(args, "config") ? resolve(io.cwd, text(args, "config")!) : findConfig(io.cwd);
    config = file ? (await loadConfig(file)).config : resolveConfig({ site: { name: "migration" } });
    source = resolve(io.cwd, inDir);
    shown = `${relative(io.cwd, source) || "."}/`;
  } else {
    const site = await loadSite(args, io);
    ({ config } = site);
    source = site.contentDir;
    shown = site.shown;
  }
  const legacy = (from ?? config.legacy) as LegacyFormat | undefined;
  if (!legacy) throw new UsageError("say which format to convert from: --from <format>, or `legacy` in the configuration");
  const out = text(args, "out") ? resolve(io.cwd, text(args, "out")!) : source;
  const outShown = `${relative(io.cwd, out) || "."}/`;
  const read = readContent(folderSource(source), { ...config, legacy });
  const bad = read.issues.filter((i) => i.severity === "error");
  if (bad.length) {
    printIssues(bad, shown, { ...io, out: io.err });
    io.err("refused: some files could not be read");
    return 1;
  }
  const inPlace = out === source;
  const writes = new Map<string, string>();
  for (const m of read.migrated) writes.set(m.file, toYaml(m.data, m.kind));
  if (!inPlace) {
    // A copy of the whole folder in format v1: files already in v1 are rewritten in the stable format too.
    for (const c of read.input.cards) if (!writes.has(c.file)) writes.set(c.file, toYaml(c.data, "card"));
    for (const a of read.input.actors) if (!writes.has(a.file)) writes.set(a.file, toYaml(a.data, "actor"));
  }
  if (args.flags["dry-run"]) {
    for (const f of writes.keys()) io.out(`would write ${outShown}${f}`);
    io.out(`Dry run: ${plural(writes.size, "file")} would be written in format v1; nothing was written.`);
    return 0;
  }
  for (const [file, yaml] of writes) {
    const path = join(out, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, yaml);
  }
  if (!inPlace) {
    const editors = config.editorial.editorsFile;
    if (existsSync(join(source, editors))) copyFileSync(join(source, editors), join(out, editors));
    if (existsSync(join(source, QUOTES_FILE))) copyFileSync(join(source, QUOTES_FILE), join(out, QUOTES_FILE));
    if (existsSync(join(source, "sources"))) cpSync(join(source, "sources"), join(out, "sources"), { recursive: true });
  }
  const cards = read.migrated.filter((m) => m.kind === "card").length;
  io.out(`Converted ${plural(cards, "card")} and ${plural(read.migrated.length - cards, "actor")} from the ${legacy} format; wrote ${plural(writes.size, "file")} to ${outShown}`);
  if (inPlace && legacy === "borough-book") {
    const left = ["parties.yaml", "decision_links.yaml", "seats.yaml"].filter((f) => existsSync(join(source, f)));
    if (existsSync(join(source, "councillors")) && readdirSync(join(source, "councillors")).length) left.push("councillors/");
    if (left.length) io.out(`Their contents are now in actors/ and the cards; delete ${left.join(", ")} in the same change once you have checked them.`);
  }
  io.out("Run openpromises validate: the append-only check compares the converted forms, so this change rewrites no history.");
  return 0;
}

// ---------------------------------------------------------------- stats

async function stats(args: Args, io: Io): Promise<number> {
  onlyFlags(args, ["config", "content", "json"], "stats");
  const site = await loadSite(args, io);
  const r = validateContent(readContent(folderSource(site.contentDir), site.config).input);
  const s = contentStats(r.cards, site.config, r.actors, r.editors);
  if (args.flags.json) {
    io.out(JSON.stringify(s, null, 2));
    return 0;
  }
  const table = (title: string, m: Record<string, number>) => {
    io.out(title);
    for (const [k, v] of Object.entries(m).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) io.out(`  ${String(v).padStart(4)}  ${k}`);
  };
  io.out(`${plural(s.published, "published card")}; ${plural(s.drafts, "draft")} (${s.draftsApproved} with every approval, ${s.draftsWaiting} waiting for editors)`);
  io.out(`${plural(s.corrected, "card")} corrected, ${plural(s.corrections, "correction")} in all`);
  table("By category", s.byCategory);
  table("By status", s.byStatus);
  table("By actor", s.byActor);
  table("By area", s.byArea);
  return 0;
}

// ---------------------------------------------------------------- help

const HELP: Record<string, string> = {
  validate: `openpromises validate [--base <ref> | --no-base] [--editors <file>] [--json]
  Checks every card, draft and actor and the editors list against format v1 and its rules, then
  compares every published card with the base branch: VALIDATE_BASE, then origin/$GITHUB_BASE_REF,
  then origin/main (--base chooses one, --no-base skips it). Exits 1 on any error.`,
  new: `openpromises new <id> --actor <actor id> [--made-on YYYY-MM-DD] [--venue <venue>] [--area <area>] [--source-url <url>] [--quote <words>]
  Writes drafts/<id>.yaml with every field to fill in.`,
  review: `openpromises review <id> --by "<editor>" [--quote-checked] [--note "…" | --note.en "…" --note.ru "…"] [--editors <file>]
  Records an editor's approval in the card. Refuses an editor not in the list, a second approval by
  the same editor, and an approval of a card about the editor's own party. On the last approval
  needed, moves the card from drafts/ to promises/ (only if it passes every other rule).
  --quote-checked also records that the editor checked each version's words at the source today.`,
  "check-quote": `openpromises check-quote <id> --text <file> | --html <file> [--version <n>] [--record]
  Checks a version's words (default: the current one) against a stored copy of its source: exact,
  close (case, punctuation or spacing differ) or none. --record writes the result to quotes.json,
  which validate reads. Fetching the copy is up to you: the engine never uses the network.`,
  deadlines: `openpromises deadlines [--today YYYY-MM-DD] [--dry-run]
  Adds an automatic deadline_missed event, in every configured language, to each open published card
  whose deadline has passed. The status does not change: an editor confirms what happened.`,
  lint: `openpromises lint
  Finds judgement words in our own text (headlines, notes, event texts, status labels), per language.
  Quotes and anything inside quotation marks are skipped.`,
  migrate: `openpromises migrate [--from <format>] [--in <folder> --out <folder>] [--dry-run]
  Rewrites cards and actors in the site's older format (legacy in the configuration, or --from:
  ${LEGACY_FORMATS.join(", ")}) in format v1, in place. With --in and --out, converts a whole folder
  into a new one.`,
  stats: `openpromises stats [--json]
  Counts published cards by category, status, actor and area, and drafts by approval.`,
};

function help(args: Args, io: Io): number {
  const topic = args.positional[0];
  if (topic === "rules") {
    for (const r of [...RULES, ...OTHER_RULES]) io.out(`${r.id.padEnd(13)} ${r.summary}`);
    return 0;
  }
  if (topic && HELP[topic]) {
    io.out(HELP[topic]);
    io.out("\n  Every command also takes --config <file> and --content <folder>.");
    return 0;
  }
  io.out(`openpromises: check and keep a promise tracker (docs/FORMAT.md)

Commands:
${Object.values(HELP)
  .map((h) => `  ${h.split("\n")[0]}`)
  .join("\n")}
  openpromises help [<command> | rules]

The configuration is openpromises.config.ts (or .yaml, .json) in this folder or one above.`);
  return topic ? 2 : 0;
}

const COMMANDS: Record<string, { booleans: string[]; run: (args: Args, io: Io) => Promise<number> | number }> = {
  validate: { booleans: ["no-base", "json"], run: validate },
  new: { booleans: [], run: newCard },
  review: { booleans: ["quote-checked"], run: review },
  "check-quote": { booleans: ["record"], run: checkQuote },
  deadlines: { booleans: ["dry-run"], run: deadlines },
  lint: { booleans: [], run: lint },
  migrate: { booleans: ["dry-run"], run: migrate },
  stats: { booleans: ["json"], run: stats },
  help: { booleans: [], run: help },
};

/** Run the command line; returns the exit code. */
export async function run(argv: readonly string[], io: Io = defaultIo()): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "-h") return help({ positional: [], flags: {} }, io);
  const command = COMMANDS[name];
  if (!command) {
    io.err(`openpromises: there is no "${name}" command (see openpromises help)`);
    return 2;
  }
  try {
    return await command.run(parseArgs(rest, command.booleans), io);
  } catch (e) {
    const err = e as Error;
    io.err(err instanceof UsageError ? `openpromises ${name}: ${err.message}` : `openpromises ${name}: ${err.message}`);
    return err instanceof UsageError ? 2 : 1;
  }
}
