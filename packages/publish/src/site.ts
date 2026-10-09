import type { Config } from "@openpromises/core";
import { openDataCsv, openDataJson } from "./data";
import { buildFeed, tagUri, type EntryContext } from "./feeds";
import { cardMarkdownFile, llmsFull, llmsTxt, MARKDOWN_TYPE } from "./markdown";
import { words } from "./messages";
import { sitemapEntries, sitemapXml } from "./sitemap";
import { absolute, paths, type FeedFormat, type FeedKind } from "./urls";
import { actorName, type CardView } from "./view";

/**
 * Everything a static site serves about its promises, as files: feeds for
 * every change, card, actor, area (and ward), Markdown for every card,
 * llms.txt and llms-full.txt in every language, a sitemap, and open data.
 * Published cards only; drafts never appear. `openpromises publish` writes
 * these to a folder; a server-rendered site can call the same builders per
 * request instead.
 */

export interface PublishedFile {
  path: string;
  contentType: string;
  body: string;
}

export interface PublishInput {
  config: Config;
  views: readonly CardView[];
  /** The build day, YYYY-MM-DD, in the site's time zone. */
  today: string;
}

const XML = "application/xml; charset=utf-8";

export function publishFiles({ config, views, today }: PublishInput): PublishedFile[] {
  // Everything is built on these two; say so before anything else.
  absolute(config, "/");
  tagUri(config, "feed/all");
  const files: PublishedFile[] = [];
  const p = paths(config);
  const published = views.filter((v) => v.where === "promises");
  const formats: FeedFormat[] = config.publish.feeds === "both" ? ["atom", "rss"] : [config.publish.feeds];
  const actorIds = [...new Set(published.flatMap((v) => [v.actor.id, ...(v.party ? [v.party.id] : [])]))].sort();
  const areas = [...new Set(published.map((v) => v.card.area))].sort();
  const wards = config.modules.has("wards") ? [...new Set(published.map((v) => v.card.links?.ward).filter((x): x is string => !!x))].sort() : [];
  const names = new Map(views.flatMap((v) => [v.actor, ...(v.party ? [v.party] : [])]).map((a) => [a.id, a]));

  for (const locale of config.locales.all) {
    const w = words(config, locale);
    const ctx: EntryContext = { config, w, today, actorName: (id) => (names.get(id) ? actorName(names.get(id)!, locale, config) : undefined) };
    const feeds: [FeedKind, string][] = [["all", ""], ...published.map((v): [FeedKind, string] => ["promise", v.id]), ...actorIds.map((id): [FeedKind, string] => ["actor", id]), ...areas.map((a): [FeedKind, string] => ["area", a]), ...wards.map((x): [FeedKind, string] => ["ward", x])];
    for (const format of formats)
      for (const [kind, key] of feeds) {
        const f = buildFeed(views, kind, key, ctx, format);
        files.push({ path: f.path, contentType: f.contentType, body: f.body });
      }
    const md = { config, w, today };
    for (const v of published) files.push({ path: p.markdown(v.id, locale), contentType: MARKDOWN_TYPE, body: cardMarkdownFile(v, md) });
    files.push({ path: p.llms(locale), contentType: "text/plain; charset=utf-8", body: llmsTxt(views, md) });
    files.push({ path: p.llmsFull(locale), contentType: "text/plain; charset=utf-8", body: llmsFull(views, md) });
  }
  files.push({ path: p.sitemap(), contentType: XML, body: sitemapXml(sitemapEntries(views, config, today)) });
  files.push({ path: p.data("json"), contentType: "application/json; charset=utf-8", body: `${JSON.stringify(openDataJson(views, config, today), null, 2)}\n` });
  files.push({ path: p.data("csv"), contentType: "text/csv; charset=utf-8", body: openDataCsv(views, config, words(config, config.locales.default), today) });

  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.path)) throw new Error(`two published files would both be ${f.path}; check site.paths in the configuration`);
    seen.add(f.path);
  }
  return files;
}
