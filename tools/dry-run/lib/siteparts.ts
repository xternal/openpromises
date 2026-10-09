import type { MdSection, SiteEntry } from "@openpromises/publish";
import type { Live } from "./live";
import { parseFeed } from "./parse";

/**
 * What a site keeps making itself and hands to the engine (PublishInput.site):
 * its own feed entries and Markdown sections. The dry run takes them from the
 * live site, as the site's own code would make them, but only of the kinds
 * the site names as its own, so a section or entry the engine should make can
 * never be filled in from the live copy.
 */

export interface SiteParts {
  entries: SiteEntry[];
  sections: Map<string, MdSection[]>;
}

/** An entry's kind from its id: "promise/<card>/contract/…" is "contract", "edition/…" is "edition". */
export function entryKind(id: string): { kind: string; card?: string } {
  const path = id.replace(/^tag:[^:]+:/, "");
  const m = /^promise\/([^/]+)\/([a-z]+)\//.exec(path);
  return m ? { kind: m[2]!, card: m[1]! } : { kind: path.split("/")[0]! };
}

export async function siteParts(live: Live, feedsPage: string, markdown: ReadonlyMap<string, string>, own: { entries: readonly string[]; sections: readonly string[] }): Promise<SiteParts> {
  const index = await live.get(feedsPage);
  const feeds = [...new Set([...index.body.matchAll(/href="([^"]+\.(?:xml|rss))"/g)].map((m) => new URL(m[1]!, index.url).pathname))];
  const entries = new Map<string, SiteEntry>();
  for (const path of feeds) {
    const got = await live.get(path);
    if (got.status !== 200) continue;
    for (const i of parseFeed(got.body).items) {
      const { kind, card } = entryKind(i.id);
      if (!own.entries.includes(kind) || entries.has(i.id) || !i.date) continue;
      entries.set(i.id, { id: i.id, title: i.title, date: i.date, link: i.link ?? "", content: i.content, ...(card ? { card } : {}) });
    }
  }
  const sections = new Map<string, MdSection[]>();
  for (const [id, md] of markdown) {
    const found: MdSection[] = [];
    for (const part of md.split(/^## /m).slice(1)) {
      const [title, ...rest] = part.split("\n");
      if (!own.sections.includes(title!.trim())) continue;
      const lines = [...rest];
      while (lines.length && !lines[0]!.trim()) lines.shift();
      while (lines.length && !lines.at(-1)!.trim()) lines.pop();
      found.push({ title: title!.trim(), lines });
    }
    if (found.length) sections.set(id, found);
  }
  return { entries: [...entries.values()], sections };
}
