import type { Config } from "@openpromises/core";
import { areaSlug } from "./view";

/**
 * Where everything is served, from the configuration's paths: pages (which
 * the site renders), and the files @openpromises/publish writes. Every path
 * starts with the language's own prefix ("" for the default, "/en" for English
 * on a Russian site).
 */

export type FeedKind = "all" | "promise" | "actor" | "area" | "ward";
export type FeedFormat = "atom" | "rss";

const URL_SAFE = /^[A-Za-z0-9_-]+$/;

export interface Paths {
  promises: (locale: string) => string;
  card: (id: string, locale: string) => string;
  actor: (id: string, locale: string) => string;
  area: (area: string, locale: string) => string;
  /** A card's Markdown file, beside its page: /promise/<id>.md */
  markdown: (id: string, locale: string) => string;
  feed: (kind: FeedKind, key: string, locale: string, format: FeedFormat) => string;
  llms: (locale: string) => string;
  llmsFull: (locale: string) => string;
  data: (format: "json" | "csv") => string;
  sitemap: () => string;
}

export function paths(config: Config): Paths {
  const p = config.site.paths;
  const prefix = (locale: string) => config.site.localePaths[locale] ?? "";
  const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (all, k: string) => (k in values ? encodeURIComponent(values[k]!) : all));
  const out: Paths = {
    promises: (l) => `${prefix(l)}${p.promises}`,
    card: (id, l) => `${prefix(l)}${fill(p.card, { id })}`,
    actor: (id, l) => `${prefix(l)}${fill(p.actor, { id })}`,
    area: (area, l) => `${prefix(l)}${fill(p.area, { area: areaSlug(config, area) })}`,
    markdown: (id, l) => `${out.card(id, l)}.md`,
    feed: (kind, key, l, format) => {
      const ext = (path: string) => (format === "rss" && config.publish.feeds === "both" ? path.replace(/\.xml$/, ".rss") : path);
      if (p.feeds.includes("{page}")) {
        // A feed beside each page: "{page}/feed.xml".
        const page =
          kind === "all"
            ? out.promises(l)
            : kind === "promise"
              ? out.card(key, l)
              : kind === "actor"
                ? out.actor(key, l)
                : kind === "area"
                  ? out.area(key, l)
                  : `${prefix(l)}/ward/${encodeURIComponent(key)}`;
        return ext(p.feeds.replace("{page}", page.replace(/\/$/, "")));
      }
      // A folder of feeds: /feeds/all.xml, /feeds/promise/<id>.xml, /feeds/area/<area>.xml.
      const folder = `${prefix(l)}${p.feeds.replace(/\/$/, "")}`;
      if (kind === "all") return ext(`${folder}/all.xml`);
      const name = kind === "area" && !URL_SAFE.test(key) ? areaSlug(config, key) : key;
      return ext(`${folder}/${kind}/${encodeURIComponent(name)}.xml`);
    },
    llms: (l) => `${prefix(l)}/llms.txt`,
    llmsFull: (l) => `${prefix(l)}/llms-full.txt`,
    data: (format) => `/data/promises.${format}`,
    sitemap: () => "/sitemap-promises.xml",
  };
  return out;
}

/** The site's address with a path: needs `site.url` in the configuration. */
export function absolute(config: Pick<Config, "site">, path: string): string {
  if (!config.site.url) throw new Error("site.url is needed to publish (feeds, structured data and sitemaps use full addresses)");
  return `${config.site.url.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
