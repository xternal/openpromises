import { stable, type Card, type Config } from "@openpromises/core";
import { xmlEscape } from "./feeds";
import { latestUpdate } from "./jsonld";
import { absolute, paths } from "./urls";
import { lastUpdated, type CardView } from "./view";

/**
 * Sitemap entries for the promise pages, in every language (with hreflang
 * alternates), for search engines; and IndexNow change lists, so engines that
 * use it re-read the pages that changed. The engine makes no network call:
 * sending the list (one POST to https://api.indexnow.org/indexnow) is the
 * site's job, after its deploy shows the new pages.
 */

export interface SitemapEntry {
  /** The page in the default language. */
  loc: string;
  lastmod?: string;
  /** The same page in every language, by language code. */
  alternates: Record<string, string>;
}

/** Every promise page the site serves: the list, each published card, each actor and area with cards. */
export function sitemapEntries(views: readonly CardView[], config: Config, today: string): SitemapEntry[] {
  const p = paths(config);
  const published = views.filter((v) => v.where === "promises");
  const all = (path: (l: string) => string) => Object.fromEntries(config.locales.all.map((l) => [l, absolute(config, path(l))]));
  const entry = (path: (l: string) => string, lastmod: string | undefined): SitemapEntry => ({ loc: absolute(config, path(config.locales.default)), ...(lastmod ? { lastmod } : {}), alternates: all(path) });
  const actors = [...new Set(published.flatMap((v) => [v.actor.id, ...(v.party ? [v.party.id] : [])]))].sort();
  const areas = [...new Set(published.map((v) => v.card.area))].sort();
  return [
    entry((l) => p.promises(l), latestUpdate(published, today)),
    ...published.map((v) => entry((l) => p.card(v.id, l), lastUpdated(v.card, today))),
    ...actors.map((id) => entry((l) => p.actor(id, l), latestUpdate(published.filter((v) => v.actor.id === id || v.party?.id === id), today))),
    ...areas.map((a) => entry((l) => p.area(a, l), latestUpdate(published.filter((v) => v.card.area === a), today))),
  ];
}

/** A sitemap file (sitemaps.org), with hreflang alternates when the site has more than one language. */
export function sitemapXml(entries: readonly SitemapEntry[]): string {
  const x = xmlEscape;
  const multi = entries.some((e) => Object.keys(e.alternates).length > 1);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${multi ? ` xmlns:xhtml="http://www.w3.org/1999/xhtml"` : ""}>`,
    ...entries.map((e) =>
      [
        `  <url>`,
        `    <loc>${x(e.loc)}</loc>`,
        e.lastmod ? `    <lastmod>${x(e.lastmod)}</lastmod>` : null,
        ...(multi ? Object.entries(e.alternates).map(([l, href]) => `    <xhtml:link rel="alternate" hreflang="${x(l)}" href="${x(href)}"/>`) : []),
        `  </url>`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    ),
    `</urlset>`,
    "",
  ].join("\n");
}

/**
 * The pages to submit to IndexNow after a change: each published card that is
 * new or changed, its actor's and party's pages, its area's page and the list,
 * in every language. `before` and `after` are the published cards before and
 * after the change.
 */
export function changedPages(before: readonly Card[], after: readonly CardView[], config: Config): string[] {
  const p = paths(config);
  const was = new Map(before.map((c) => [c.id, stable(c)]));
  const urls = new Set<string>();
  for (const v of after) {
    if (v.where !== "promises" || was.get(v.id) === stable(v.card)) continue;
    for (const l of config.locales.all) {
      urls.add(absolute(config, p.card(v.id, l)));
      urls.add(absolute(config, p.actor(v.actor.id, l)));
      if (v.party && v.party.id !== v.actor.id) urls.add(absolute(config, p.actor(v.party.id, l)));
      urls.add(absolute(config, p.area(v.card.area, l)));
      urls.add(absolute(config, p.promises(l)));
    }
  }
  return [...urls].sort();
}

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/** The body to POST to https://api.indexnow.org/indexnow. Engines take only URLs on the key's host; duplicates are dropped. */
export function indexNowPayload(config: Pick<Config, "site">, key: string, urls: readonly string[]): IndexNowPayload {
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) throw new Error("an IndexNow key is 8 to 128 letters, digits or hyphens");
  const host = new URL(absolute(config, "/")).host;
  const urlList = [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
  return { host, key, keyLocation: absolute(config, `/${key}.txt`), urlList };
}

/** Only a public https site can be submitted: never localhost or a preview. */
export function canSubmit(siteUrl: string): boolean {
  try {
    const u = new URL(siteUrl);
    return u.protocol === "https:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) && !u.hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}
