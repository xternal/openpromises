import axe from "axe-core";
import { JSDOM } from "jsdom";
import { statusLabel } from "@openpromises/core";
import {
  absolute,
  cardCostText,
  cardDescription,
  cardJsonLd,
  cardTitle,
  eventLabel,
  longDate,
  paths,
  pick,
  quoteIn,
  words,
  type CardView,
} from "@openpromises/publish";
import type { EngineRun } from "./engine";
import type { Replayed } from "./history";
import type { Live } from "./live";
import type { Caught } from "./mutations";
import { markdownFacts, markdownHeadings, markdownLinks, parseFeed, parsePage, parseSitemap, squash, type Feed, type Page } from "./parse";
import type { Finding } from "./report";

/**
 * One function per area: what the live site serves, against what the engine
 * would serve for the same content. Each returns findings with verdicts
 * (lib/report.ts); the site's profile then marks what is already decided.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Text compared loosely: curly and straight quotes, dashes and spaces evened out. */
const loose = (s: string) =>
  squash(s)
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .toLowerCase();
const shortId = (id: string) => id.replace(/^tag:[^:]+:/, "");

export interface LivePages {
  card: Map<string, Page>;
  markdown: Map<string, string>;
}

export async function fetchCards(run: EngineRun, live: Live): Promise<LivePages> {
  const p = paths(run.config);
  const L = run.config.locales.default;
  const card = new Map<string, Page>();
  const markdown = new Map<string, string>();
  await Promise.all(
    run.published.map(async (v) => {
      const [page, md] = await Promise.all([live.get(p.card(v.id, L)), live.get(p.markdown(v.id, L))]);
      if (page.status === 200) card.set(v.id, parsePage(page.body, page.url));
      if (md.status === 200) markdown.set(v.id, md.body);
    }),
  );
  return { card, markdown };
}

// ---------------------------------------------------------------- reading

export async function readingArea(run: EngineRun, live: Live): Promise<Finding[]> {
  const area = "Reading the cards";
  const out: Finding[] = [];
  const config = run.config;
  const p = paths(config);
  const sitemap = await live.get("/sitemap.xml");
  const liveUrls = new Set(parseSitemap(sitemap.body).map((u) => u.loc));
  const cardUrl = (id: string) => absolute(config, p.card(id, config.locales.default));
  const cardPattern = new RegExp(`^${absolute(config, p.card("__ID__", config.locales.default)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("__ID__", "([^/]+)")}$`);
  const liveIds = [...liveUrls].map((u) => cardPattern.exec(u)?.[1]).filter((x): x is string => !!x);
  const readIds = new Set(run.published.map((v) => v.id));
  const files = run.read.input.cards.filter((c) => c.where === "promises");

  const strictBad = new Map<string, string>();
  for (const i of run.strict.issues) if (i.rule === "schema" && i.severity === "error" && i.file.startsWith("promises/") && !strictBad.has(i.file)) strictBad.set(i.file, `${i.path.join(".")}: ${i.message}`);
  if (strictBad.size) {
    const fields = new Map<string, number>();
    for (const l of run.lifted) {
      const f = l.path.replace(/\.\d+\./g, "[n].");
      fields.set(f, (fields.get(f) ?? 0) + 1);
    }
    out.push({
      area,
      verdict: "worse",
      what: `${strictBad.size} of ${files.length} published cards cannot be read by the engine as it is: ${[...fields.keys()].map((f) => `\`${f}\``).join(", ")} has no place in format v1. Everything below was compared with ${fields.size === 1 ? "that field" : "those fields"} set aside, so ${fields.size === 1 ? "it is" : "they are"} missing from every page, feed and file the engine would make.`,
      items: [...fields].map(([f, n]) => `${f}: ${plural(n, "version")}`).concat([...strictBad].map(([file, m]) => `${file}: ${m}`)),
    });
  } else out.push({ area, verdict: "same", what: `All ${files.length} published cards read in format v1, with no field left over` });

  const notRead = files.filter((c) => !readIds.has(c.file.replace(/^promises\/|\.ya?ml$/g, "")));
  const stillBad = notRead.filter((c) => !strictBad.has(c.file) || run.result.issues.some((i) => i.file === c.file && i.rule === "schema"));
  if (stillBad.length) out.push({ area, verdict: "worse", what: `${plural(stillBad.length, "card")} could not be read even with unknown fields set aside`, items: stillBad.map((c) => c.file) });

  const missing = liveIds.filter((id) => !readIds.has(id));
  const extra = [...readIds].filter((id) => !liveIds.includes(id));
  if (missing.length) out.push({ area, verdict: "worse", what: `${plural(missing.length, "promise page")} in the live sitemap would have no card`, items: missing.map(cardUrl) });
  if (extra.length) out.push({ area, verdict: "changed", what: `${plural(extra.length, "card")} the engine would publish that the live sitemap does not list`, items: extra.map(cardUrl) });
  if (!missing.length) out.push({ area, verdict: "same", what: `Every promise page in the live sitemap (${liveIds.length}) has its card, and the actors read (${run.result.actors.size})` });

  const x = new Map<string, number>();
  for (const m of run.read.migrated) {
    const data = m.data as { x?: Record<string, unknown> };
    for (const k of Object.keys(data.x ?? {})) x.set(`${m.kind}: ${k}`, (x.get(`${m.kind}: ${k}`) ?? 0) + 1);
  }
  if (x.size)
    out.push({
      area,
      verdict: "changed",
      what: "Site-only fields kept in `x`: the engine stores them and passes them through, but never shows or checks them",
      items: [...x].map(([k, n]) => `${k} (${plural(n, "file")})`),
    });
  return out;
}

// ---------------------------------------------------------------- checks

export function checksArea(run: EngineRun, caught: readonly Caught[]): Finding[] {
  const area = "Checks";
  const out: Finding[] = [];
  const groups = new Map<string, string[]>();
  for (const i of run.result.issues) {
    const k = `${i.severity} ${i.rule}`;
    groups.set(k, [...(groups.get(k) ?? []), `${i.file}${i.path.length ? ` (${i.path.join(".")})` : ""}: ${i.message}`]);
  }
  for (const [k, items] of groups) {
    const [severity, rule] = k.split(" ") as [string, string];
    out.push({
      area,
      verdict: severity === "error" ? "worse" : "changed",
      what: `On the site's content today, the engine ${severity === "error" ? "refuses" : "warns about"} ${plural(items.length, "thing")} under its \`${rule}\` rule${severity === "error" ? ", so it would not publish until they are fixed" : ""}`,
      items,
    });
  }
  if (!groups.size) out.push({ area, verdict: "same", what: "The engine finds nothing wrong with the site's content today" });

  const same: string[] = [];
  for (const c of caught) {
    const m = c.mutation;
    const how = `${c.rules.join(", ") || "nothing"}${c.message ? `: "${c.message}"` : ""}`;
    if (m.allowed) {
      if (c.engine === "error") out.push({ area, verdict: "worse", what: `The site allows it, the engine refuses it: ${m.check}`, items: [`${m.card}: ${how}`] });
      else same.push(`allowed by both: ${m.check}`);
      continue;
    }
    const rank = { error: 2, warning: 1, none: 0 } as const;
    const site = rank[m.site ?? "none"];
    const engine = rank[c.engine ?? "none"];
    const who = (n: number) => (n === 2 ? "refuses it" : n === 1 ? "warns" : "lets it through");
    if (site === engine) same.push(`${m.check} (both ${who(site)})`);
    else if (engine > site) out.push({ area, verdict: "better", what: `${m.site ? `The site ${who(site)}` : "The site has no check for it"}; the engine ${who(engine)}: ${m.check}`, items: [`${m.card}: ${how}`] });
    else out.push({ area, verdict: "worse", what: `The site ${who(site)}, the engine ${who(engine)}: ${m.check}`, items: [`${m.card}: ${how}`] });
  }
  if (same.length) out.push({ area, verdict: "same", what: `The engine catches ${plural(same.length, "broken card")} the way the site does (each made by breaking a real card in memory)`, items: same });
  return out;
}

// ---------------------------------------------------------------- history

export function historyArea(replayed: readonly Replayed[]): Finding[] {
  const area = "History";
  const out: Finding[] = [];
  const clean = replayed.filter((r) => !r.issues.length);
  for (const r of replayed.filter((x) => x.issues.length)) {
    const files = new Set(r.issues.map((i) => i.file));
    out.push({
      area,
      verdict: "worse",
      what: `${r.commit} (${r.date}, "${r.subject}"): the site merged it; the engine's append-only check would refuse it for ${plural(files.size, "card")}`,
      items: r.issues.map((i) => `${i.file}: ${i.message}`),
    });
  }
  out.push({
    area,
    verdict: "same",
    what: `${clean.length} of ${plural(replayed.length, "merged change")} to published cards pass the engine's append-only check, as they passed the site's`,
    items: clean.map((r) => `${r.commit} ${r.date} ${r.subject} (${plural(r.compared, "card")} compared)`),
  });
  return out;
}

// ---------------------------------------------------------------- feeds

export async function feedsArea(run: EngineRun, live: Live, feedsPage: string): Promise<Finding[]> {
  const area = "Feeds";
  const out: Finding[] = [];
  const index = await live.get(feedsPage);
  const livePaths = [...new Set([...index.body.matchAll(/href="([^"]+\.(?:xml|rss))"/g)].map((m) => new URL(m[1]!, index.url).pathname))].sort();
  const engineFeeds = [...run.files.values()].filter((f) => /atom|rss/.test(f.contentType));
  const enginePaths = new Set(engineFeeds.map((f) => f.path));

  const notMade = livePaths.filter((p) => !enginePaths.has(p));
  for (const path of notMade) out.push({ area, verdict: "worse", what: `The engine makes no feed at ${path}` });
  const newFeeds = [...enginePaths].filter((p) => !livePaths.includes(p));
  if (newFeeds.length) out.push({ area, verdict: "better", what: `${plural(newFeeds.length, "new feed")} the live site does not list`, items: newFeeds });

  const missing: string[] = [];
  const extra: string[] = [];
  const titles: string[] = [];
  const contents: string[] = [];
  const links: string[] = [];
  const dates: string[] = [];
  const heads: string[] = [];
  const ids: string[] = [];
  let entries = 0;
  let sameEntries = 0;
  const compared = livePaths.filter((p) => enginePaths.has(p));
  const feeds = await Promise.all(compared.map(async (path) => [path, await live.get(path)] as const));
  for (const [path, got] of feeds) {
    if (got.status !== 200) {
      out.push({ area, verdict: "changed", what: `${path} answered ${got.status} on the live site` });
      continue;
    }
    const a: Feed = parseFeed(got.body);
    const b: Feed = parseFeed(run.files.get(path)!.body);
    if (a.id !== b.id) ids.push(`${path}: ${a.id} → ${b.id}`);
    for (const k of ["title", "subtitle", "self", "page"] as const) if ((a[k] ?? "") !== (b[k] ?? "")) heads.push(`${path} ${k}: "${a[k] ?? ""}" → "${b[k] ?? ""}"`);
    const byId = new Map(b.items.map((i) => [i.id, i]));
    const liveIds = new Set(a.items.map((i) => i.id));
    // A feed keeps its newest entries; an entry beyond the engine's limit is not missing.
    const oldestEngine = b.items.at(-1)?.date ?? "";
    for (const i of a.items) {
      entries++;
      const e = byId.get(i.id);
      if (!e) {
        if (!(b.items.length >= 200 && (i.date ?? "") < oldestEngine)) missing.push(`${path}: ${shortId(i.id)} "${i.title}"`);
        continue;
      }
      let same = true;
      if (loose(i.title) !== loose(e.title)) (titles.push(`${shortId(i.id)}: "${i.title}" → "${e.title}"`), (same = false));
      if (loose(i.content) !== loose(e.content)) (contents.push(`${shortId(i.id)}: "${squash(i.content)}" → "${squash(e.content)}"`), (same = false));
      if ((i.link ?? "") !== (e.link ?? "")) (links.push(`${shortId(i.id)}: ${i.link} → ${e.link}`), (same = false));
      if ((i.date ?? "") !== (e.date ?? "")) (dates.push(`${shortId(i.id)}: ${i.date} → ${e.date}`), (same = false));
      if (same) sameEntries++;
    }
    for (const e of b.items) if (!liveIds.has(e.id)) extra.push(`${path}: ${shortId(e.id)} (${e.date}) "${e.title}"`);
  }
  const uniq = (xs: string[]) => [...new Set(xs)];
  const add = (verdict: Finding["verdict"], list: string[], what: string) => {
    if (list.length) out.push({ area, verdict, what: what.replace("{n}", String(uniq(list).length)), items: uniq(list) });
  };
  add("worse", ids, "{n} feeds would change their id, so feed readers would treat them as new feeds");
  // Missing entries by kind ("cost/correction", "contract", "edition"), so each kind can be judged on its own.
  const kindOf = (item: string) => /: promise\/[^/]+\/([a-z]+(?:\/[a-z]+)?)\//.exec(item)?.[1]?.replace(/\/\d+$/, "") ?? /: ([a-z]+)\//.exec(item)?.[1] ?? "other";
  const byKind = new Map<string, string[]>();
  for (const m of uniq(missing)) byKind.set(kindOf(m), [...(byKind.get(kindOf(m)) ?? []), m]);
  for (const [kind, list] of byKind) add("worse", list, `{n} live feed entries of kind "${kind}" the engine would not make: followers would stop getting them`);
  add("worse", extra, "{n} entries the engine would add that the live feeds do not have: followers would see them as new on the day of the switch");
  add("worse", links, "{n} entries would link somewhere else");
  add("changed", dates, "{n} entries would carry a different date");
  add("changed", titles, "{n} entry titles would read differently (feed readers show the title)");
  add("changed", contents, "{n} entry texts would read differently");
  add("changed", heads, "{n} feed titles, descriptions or links would read differently");
  out.push({ area, verdict: "same", what: `${sameEntries} of ${plural(entries, "live entry", "live entries")} in ${plural(compared.length, "feed")} would be identical: same id, title, text, link and date` });
  return out;
}

// ---------------------------------------------------------------- markdown

export function markdownArea(run: EngineRun, pages: LivePages): Finding[] {
  const area = "Markdown";
  const out: Finding[] = [];
  const p = paths(run.config);
  const L = run.config.locales.default;
  const lostFacts: string[] = [];
  const newFacts: string[] = [];
  const changedFacts: string[] = [];
  const lostLinks: string[] = [];
  const newLinks: string[] = [];
  const lostHeadings: string[] = [];
  const newHeadings: string[] = [];
  const prose: string[] = [];
  let identical = 0;
  const noLive: string[] = [];
  for (const v of run.published) {
    const a = pages.markdown.get(v.id);
    const b = run.files.get(p.markdown(v.id, L))?.body;
    if (a === undefined) {
      noLive.push(v.id);
      continue;
    }
    if (b === undefined) {
      lostFacts.push(`${v.id}: no Markdown file`);
      continue;
    }
    if (a.trim() === b.trim()) {
      identical++;
      continue;
    }
    const fa = markdownFacts(a);
    const fb = markdownFacts(b);
    for (const [k, val] of fa) {
      if (!fb.has(k)) lostFacts.push(`${v.id}: ${k}: ${val}`);
      else if (loose(fb.get(k)!) !== loose(val)) changedFacts.push(`${v.id}: ${k}: "${val}" → "${fb.get(k)}"`);
    }
    for (const [k, val] of fb) if (!fa.has(k)) newFacts.push(`${v.id}: ${k}: ${val}`);
    const la = new Set(markdownLinks(a));
    const lb = new Set(markdownLinks(b));
    for (const l of la) if (!lb.has(l)) lostLinks.push(`${v.id}: ${l}`);
    for (const l of lb) if (!la.has(l)) newLinks.push(`${v.id}: ${l}`);
    const ha = markdownHeadings(a);
    const hb = markdownHeadings(b);
    for (const h of ha) if (!hb.includes(h)) lostHeadings.push(`${v.id}: ${h}`);
    for (const h of hb) if (!ha.includes(h)) newHeadings.push(`${v.id}: ${h}`);
    const other = (md: string) => new Set(md.split("\n").filter((l) => l.trim() && !/^- \*\*|^#/.test(l)).map(loose));
    const oa = other(a);
    const ob = other(b);
    const gone = [...oa].filter((l) => !ob.has(l));
    if (gone.length) prose.push(`${v.id}: ${gone.length} other line(s) differ, e.g. "${gone[0]!.slice(0, 160)}"`);
  }
  const add = (verdict: Finding["verdict"], list: string[], what: string) => {
    if (list.length) out.push({ area, verdict, what: what.replace("{n}", String(list.length)), items: list });
  };
  add("worse", lostFacts, "{n} facts in the live Markdown that the engine's would not have");
  add("worse", lostLinks, "{n} links in the live Markdown that the engine's would not have");
  add("worse", lostHeadings, "{n} sections in the live Markdown that the engine's would not have");
  add("changed", changedFacts, "{n} facts would read differently");
  add("changed", prose, "{n} cards' other lines would read differently");
  add("better", newFacts, "{n} facts the engine's Markdown adds");
  add("better", newLinks, "{n} links the engine's Markdown adds");
  add("better", newHeadings, "{n} sections the engine's Markdown adds");
  if (noLive.length) out.push({ area, verdict: "changed", what: `${plural(noLive.length, "card")} had no live Markdown to compare`, items: noLive });
  out.push({ area, verdict: "same", what: `${identical} of ${plural(run.published.length - noLive.length, "card")} would have byte-for-byte the same Markdown` });
  return out;
}

// ---------------------------------------------------------------- llms.txt

export async function llmsArea(run: EngineRun, live: Live): Promise<Finding[]> {
  const area = "llms.txt";
  const out: Finding[] = [];
  const p = paths(run.config);
  const L = run.config.locales.default;
  const cards = new Set(run.published.map((v) => absolute(run.config, p.card(v.id, L))));
  for (const [path, label] of [
    [p.llms(L), "llms.txt"],
    [p.llmsFull(L), "llms-full.txt"],
  ] as const) {
    const got = await live.get(path);
    const engine = run.files.get(path)?.body ?? "";
    if (got.status !== 200) {
      out.push({ area, verdict: "better", what: `${label}: the live site has none; the engine would add one` });
      continue;
    }
    const urls = (t: string) => new Set(markdownLinks(t).map((u) => u.replace(/\.md$/, "")));
    const a = urls(got.body);
    const b = urls(engine);
    const lost = [...a].filter((u) => cards.has(u) && !b.has(u));
    const others = [...a].filter((u) => !cards.has(u) && !b.has(u));
    const added = [...b].filter((u) => !a.has(u));
    if (lost.length) out.push({ area, verdict: "worse", what: `${label}: ${plural(lost.length, "promise")} the live file lists that the engine's would not`, items: lost });
    else out.push({ area, verdict: "same", what: `${label}: every promise the live file links to is in the engine's too` });
    if (others.length) out.push({ area, verdict: "worse", what: `${label}: ${plural(others.length, "other link")} (the site's own pages) the engine's file would not have`, items: others });
    if (added.length) out.push({ area, verdict: "better", what: `${label}: ${plural(added.length, "link")} the engine's file adds`, items: added });
    const ratio = engine.length / Math.max(got.body.length, 1);
    out.push({ area, verdict: "changed", what: `${label}: ${(got.body.length / 1024).toFixed(0)} KB live, ${(engine.length / 1024).toFixed(0)} KB from the engine (${(ratio * 100).toFixed(0)}%)` });
  }
  return out;
}

// ---------------------------------------------------------------- sitemap

export async function sitemapArea(run: EngineRun, live: Live): Promise<Finding[]> {
  const area = "Sitemap";
  const out: Finding[] = [];
  const liveUrls = parseSitemap((await live.get("/sitemap.xml")).body);
  const engine = parseSitemap(run.files.get(paths(run.config).sitemap())?.body ?? "");
  const byLoc = new Map(engine.map((u) => [u.loc, u]));
  const lost: string[] = [];
  const lastmod: string[] = [];
  let same = 0;
  const p = paths(run.config);
  const cardPrefix = absolute(run.config, p.card("", run.config.locales.default));
  const isCard = (loc: string) => loc.startsWith(cardPrefix) && !loc.slice(cardPrefix.length).includes("/");
  const liveCards = liveUrls.filter((u) => isCard(u.loc));
  for (const u of liveCards) {
    const e = byLoc.get(u.loc);
    if (!e) lost.push(u.loc);
    else if ((u.lastmod ?? "") !== (e.lastmod ?? "")) lastmod.push(`${u.loc}: ${u.lastmod} → ${e.lastmod}`);
    else same++;
  }
  if (lost.length) out.push({ area, verdict: "worse", what: `${plural(lost.length, "promise page")} in the live sitemap would be missing from the engine's`, items: lost });
  if (lastmod.length) out.push({ area, verdict: "changed", what: `${plural(lastmod.length, "promise page")} would carry a different last-modified date`, items: lastmod });
  out.push({ area, verdict: "same", what: `${same} of ${plural(liveCards.length, "promise page")} in the live sitemap are in the engine's, with the same address and date` });
  const listed = engine.filter((u) => !isCard(u.loc)).length;
  out.push({
    area,
    verdict: "site",
    what: `The live sitemap's other ${plural(liveUrls.length - liveCards.length, "page")} (MPs, actors, budget, method) stay the site's; the engine writes /sitemap-promises.xml${listed ? ` (with ${plural(listed, "list page")} as well)` : ""} for the site's sitemap index`,
  });
  return out;
}

// ---------------------------------------------------------------- structured data

type Ld = Record<string, any>;
const nodes = (data: unknown): Ld[] => {
  const all: Ld[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      all.push(x as Ld);
      Object.values(x).forEach(walk);
    }
  };
  walk(data);
  return all;
};
const ofType = (data: unknown, type: string) => nodes(data).find((n) => n["@type"] === type || (Array.isArray(n["@type"]) && n["@type"].includes(type)));
const list = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : x === undefined ? [] : [String(x)]);

export function structuredDataArea(run: EngineRun, pages: LivePages): Finding[] {
  const area = "Structured data";
  const out: Finding[] = [];
  const w = words(run.config, run.config.locales.default);
  const lost: string[] = [];
  const changed: string[] = [];
  const types = new Map<string, number>();
  let quotesSame = 0;
  let compared = 0;
  for (const v of run.published) {
    const page = pages.card.get(v.id);
    if (!page) continue;
    compared++;
    const a = page.jsonLd;
    const b = cardJsonLd(v, { config: run.config, w, today: run.today });
    const mainA = a.find((n) => (n as Ld)["@type"] !== "BreadcrumbList") as Ld | undefined;
    const mainB = (b as Ld[]).find((n) => n["@type"] !== "BreadcrumbList");
    const t = `${mainA?.["@type"]} → ${mainB?.["@type"]}`;
    types.set(t, (types.get(t) ?? 0) + 1);
    const qa = ofType(a, "Quotation");
    const qb = ofType(b, "Quotation");
    if (!qa) continue;
    if (!qb) {
      lost.push(`${v.id}: the Quotation`);
      continue;
    }
    if (loose(qa.text ?? "") === loose(qb.text ?? "")) quotesSame++;
    else lost.push(`${v.id}: the quotation's text differs`);
    const pa = qa.spokenByCharacter ?? qa.creator ?? {};
    const pb = qb.spokenByCharacter ?? qb.creator ?? {};
    if (pa.name !== pb.name) changed.push(`${v.id}: speaker "${pa.name}" → "${pb.name}"`);
    for (const s of list(pa.sameAs)) if (!list(pb.sameAs).includes(s)) lost.push(`${v.id}: the speaker's sameAs ${s}`);
    if (pa.affiliation?.name && pa.affiliation.name !== pb.affiliation?.name) changed.push(`${v.id}: affiliation "${pa.affiliation.name}" → "${pb.affiliation?.name}"`);
    for (const s of list(pa.affiliation?.sameAs)) if (!list(pb.affiliation?.sameAs).includes(s)) lost.push(`${v.id}: the party's sameAs ${s}`);
    const cites = new Set([...list(qb.citation), ...list(mainB?.citation), ...list(qb.isBasedOn)]);
    for (const c of [...list(qa.citation), ...list(qa.isBasedOn)]) if (!cites.has(c)) lost.push(`${v.id}: citation ${c}`);
    for (const k of ["dateCreated", "license"] as const) {
      const x = qa[k] ?? mainA?.[k];
      const y = qb[k] ?? mainB?.[k];
      if (x !== undefined && x !== y) (y === undefined ? lost : changed).push(`${v.id}: ${k} ${JSON.stringify(x)} → ${JSON.stringify(y)}`);
    }
    const about = (n: Ld | undefined) => (n?.about?.name as string | undefined) ?? undefined;
    if (about(qa) && about(qa) !== about(qb) && about(qa) !== about(mainB)) changed.push(`${v.id}: about "${about(qa)}" → "${about(qb) ?? about(mainB)}"`);
    const dm = (n: Ld | undefined) => n?.dateModified as string | undefined;
    if (dm(mainA) && dm(mainA) !== dm(mainB)) changed.push(`${v.id}: dateModified ${dm(mainA)} → ${dm(mainB)}`);
    const crumbs = (data: unknown) =>
      (ofType(data, "BreadcrumbList")?.itemListElement as Ld[] | undefined)?.map((i) => `${i.name} <${typeof i.item === "string" ? i.item : i.item?.["@id"]}>`).join(" › ") ?? "";
    if (crumbs(a) !== crumbs(b)) changed.push(`${v.id}: breadcrumbs "${crumbs(a)}" → "${crumbs(b)}"`);
  }
  for (const [t, n] of types) out.push({ area, verdict: t.split(" → ")[0] === t.split(" → ")[1] ? "same" : "changed", what: `Card pages' main type: ${t} (${plural(n, "card")})` });
  if (lost.length) out.push({ area, verdict: "worse", what: `${plural(lost.length, "fact")} in the live structured data that the engine's would not have`, items: lost });
  if (changed.length) out.push({ area, verdict: "changed", what: `${plural(changed.length, "value")} would differ`, items: changed });
  out.push({ area, verdict: "same", what: `${quotesSame} of ${plural(compared, "card")} carry the speaker's exact words as a Quotation in both` });
  return out;
}

// ---------------------------------------------------------------- card pages

/** The facts a card page must show, from the card itself. */
function cardFacts(v: CardView, run: EngineRun): { fact: string; text: string }[] {
  const { config } = run;
  const L = config.locales.default;
  const w = words(config, L);
  const facts = [
    { fact: "the exact words", text: quoteIn(v.current, L, config).text },
    { fact: "the status", text: statusLabel(config, v.card.status, L) },
  ];
  const deadline = v.current.parameters?.deadline;
  if (deadline) facts.push({ fact: "the deadline", text: longDate(w, deadline) });
  const range = v.current.parameters?.cost?.range;
  if (range) facts.push({ fact: "the cost", text: cardCostText(v, config, w).replace(/\s*\(.*\)$/, "") });
  v.card.events.forEach((e, i) => {
    facts.push({ fact: `event ${i} date`, text: longDate(w, e.date) });
    const t = pick(e.text, L, config);
    if (t) facts.push({ fact: `event ${i} (${eventLabel(config, w, e.type, e.subtype)})`, text: t });
  });
  return facts;
}

export interface Rendered {
  /** The engine's card page: breadcrumbs and the card, inside <main>. */
  html: Map<string, string>;
}

export function cardPagesArea(run: EngineRun, pages: LivePages, rendered: Rendered): Finding[] {
  const area = "Card pages";
  const out: Finding[] = [];
  const origin = new URL(run.config.site.url!).origin;
  const lostLinks: string[] = [];
  const newLinks: string[] = [];
  const lostInternal: string[] = [];
  const lostFacts: string[] = [];
  const newFacts: string[] = [];
  const lostText: string[] = [];
  let compared = 0;
  let factsBoth = 0;
  for (const v of run.published) {
    const a = pages.card.get(v.id);
    const html = rendered.html.get(v.id);
    if (!a || !html) continue;
    compared++;
    const b = parsePage(`<!doctype html><html><body>${html}</body></html>`, a.canonical ?? `${origin}/`);
    const ext = (u: string) => !u.startsWith(origin);
    const la = new Set(a.mainLinks.map((u) => u.replace(/#.*$/, "")));
    const lb = new Set(b.mainLinks.map((u) => u.replace(/#.*$/, "")));
    for (const u of la) if (!lb.has(u)) (ext(u) ? lostLinks : lostInternal).push(`${v.id}: ${u}`);
    for (const u of lb) if (!la.has(u) && ext(u)) newLinks.push(`${v.id}: ${u}`);
    const ta = loose(a.mainText);
    const tb = loose(b.mainText);
    for (const f of cardFacts(v, run)) {
      const t = loose(f.text);
      const inA = ta.includes(t);
      const inB = tb.includes(t);
      if (inA && inB) factsBoth++;
      else if (inA) lostFacts.push(`${v.id}: ${f.fact}: "${f.text.slice(0, 120)}"`);
      else if (inB) newFacts.push(`${v.id}: ${f.fact}: "${f.text.slice(0, 120)}"`);
    }
    // Live text the engine's card does not show: the site's own sections, or something lost.
    const { document } = new JSDOM(a.mainHtml).window;
    const seen = new Set<string>();
    for (const el of document.querySelectorAll("p, li, dd, dt, h1, h2, h3, h4, td, th, figcaption, summary")) {
      if (el.querySelector("p, li, dd, h1, h2, h3, h4, td")) continue;
      const t = loose(el.textContent ?? "");
      if (t.split(" ").length < 3 || seen.has(t) || tb.includes(t)) continue;
      seen.add(t);
      lostText.push(`${v.id}: "${squash(el.textContent ?? "").slice(0, 140)}"`);
    }
  }
  const hosts = new Map<string, string[]>();
  for (const l of lostLinks) {
    const host = new URL(l.slice(l.indexOf(": ") + 2)).host;
    hosts.set(host, [...(hosts.get(host) ?? []), l]);
  }
  for (const [host, list] of hosts) out.push({ area, verdict: "worse", what: `${plural(list.length, "link")} to ${host} on live card pages that the engine's card would not show`, items: list });
  if (lostFacts.length) out.push({ area, verdict: "worse", what: `${plural(lostFacts.length, "fact")} the live card pages show that the engine's card would not`, items: lostFacts });
  if (lostInternal.length) out.push({ area, verdict: "changed", what: `${plural(lostInternal.length, "link")} to the site's own pages that the engine's card does not make (the site's layout may still have them)`, items: lostInternal });
  if (lostText.length) out.push({ area, verdict: "changed", what: `${plural(lostText.length, "piece")} of live card-page text the engine's card does not show: the site's own sections, or something lost`, items: lostText });
  if (newLinks.length) out.push({ area, verdict: "better", what: `${plural(newLinks.length, "outside link")} the engine's card adds`, items: newLinks });
  if (newFacts.length) out.push({ area, verdict: "better", what: `${plural(newFacts.length, "fact")} the engine's card shows that the live page does not`, items: newFacts });
  out.push({ area, verdict: "same", what: `${factsBoth} facts (words, status, deadline, cost, every event's date and text) appear on both, across ${plural(compared, "card")}` });
  return out;
}

// ---------------------------------------------------------------- accessibility

async function axeRun(html: string, scope: string): Promise<{ id: string; nodes: number; help: string }[]> {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(axe.source);
  const target = dom.window.document.querySelector(scope) ?? dom.window.document;
  const result = await (dom.window as unknown as { axe: typeof axe }).axe.run(target as unknown as Element, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  dom.window.close();
  return result.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, help: v.help }));
}

export async function accessibilityArea(run: EngineRun, live: Live, rendered: Rendered): Promise<Finding[]> {
  const area = "Accessibility";
  const out: Finding[] = [];
  const p = paths(run.config);
  const L = run.config.locales.default;
  const liveOnly = new Map<string, string[]>();
  const engineOnly = new Map<string, string[]>();
  const both = new Map<string, string[]>();
  let n = 0;
  for (const v of run.published) {
    const got = await live.get(p.card(v.id, L));
    const html = rendered.html.get(v.id);
    if (got.status !== 200 || !html) continue;
    n++;
    const a = await axeRun(got.body, "main");
    const b = await axeRun(`<!doctype html><html lang="${L}"><head><title>${v.id}</title></head><body>${html}</body></html>`, "main");
    const ids = (xs: typeof a) => new Map(xs.map((x) => [x.id, x]));
    const ia = ids(a);
    const ib = ids(b);
    const note = (m: Map<string, string[]>, x: { id: string; help: string; nodes: number }) => m.set(`${x.id}: ${x.help}`, [...(m.get(`${x.id}: ${x.help}`) ?? []), `${v.id} (${plural(x.nodes, "element")})`]);
    for (const x of a) note(ib.has(x.id) ? both : liveOnly, x);
    for (const x of b) if (!ia.has(x.id)) note(engineOnly, x);
  }
  for (const [rule, cards] of engineOnly) out.push({ area, verdict: "worse", what: `The engine's card has a problem the live page does not: ${rule}`, items: cards });
  for (const [rule, cards] of liveOnly) out.push({ area, verdict: "better", what: `Fixed by the engine's card: ${rule}`, items: cards });
  for (const [rule, cards] of both) out.push({ area, verdict: "changed", what: `On both: ${rule}`, items: cards });
  if (!engineOnly.size && !both.size) out.push({ area, verdict: "same", what: `axe-core (WCAG 2.1 A and AA, best practice) finds no problem in the engine's card on any of ${plural(n, "card page")}; colour contrast is checked by the engine's own tests, as jsdom has no layout` });
  return out;
}

// ---------------------------------------------------------------- titles

export function titlesArea(run: EngineRun, pages: LivePages): Finding[] {
  const area = "Titles and descriptions";
  const out: Finding[] = [];
  const w = words(run.config, run.config.locales.default);
  const titles: string[] = [];
  const descriptions: string[] = [];
  let same = 0;
  for (const v of run.published) {
    const a = pages.card.get(v.id);
    if (!a) continue;
    const t = cardTitle(v, run.config, w);
    const d = cardDescription(v, run.config, w);
    const liveTitle = a.meta["og:title"] ?? a.title;
    let ok = true;
    if (loose(liveTitle) !== loose(t.title) && loose(liveTitle) !== loose(t.social) && loose(a.title) !== loose(t.title)) (titles.push(`${v.id}: "${a.title}" → "${t.title}"`), (ok = false));
    if (a.description && loose(a.description) !== loose(d)) (descriptions.push(`${v.id}: "${a.description}" → "${d}"`), (ok = false));
    if (ok) same++;
  }
  if (titles.length) out.push({ area, verdict: "changed", what: `${plural(titles.length, "card page title")} would read differently with the engine's cardTitle`, items: titles });
  if (descriptions.length) out.push({ area, verdict: "changed", what: `${plural(descriptions.length, "description")} would read differently with the engine's cardDescription`, items: descriptions });
  out.push({ area, verdict: "same", what: `${same} card pages have the same title and description as the engine would write` });
  return out;
}

// ---------------------------------------------------------------- open data

export async function openDataArea(run: EngineRun, live: Live, apiPath: string): Promise<Finding[]> {
  const area = "Open data";
  const api = await live.get(apiPath);
  const json = run.files.get(paths(run.config).data("json"));
  const csv = run.files.get(paths(run.config).data("csv"));
  return [
    {
      area,
      verdict: "site",
      what: `The site's own API (${apiPath}, answered ${api.status}) stays the site's: the engine does not replace it`,
    },
    {
      area,
      verdict: "better",
      what: `The engine adds every published card as open data in format v1: ${paths(run.config).data("json")} (${((json?.body.length ?? 0) / 1024).toFixed(0)} KB) and ${paths(run.config).data("csv")} (${csv?.body.split("\n").length ?? 0} lines)`,
    },
  ];
}
