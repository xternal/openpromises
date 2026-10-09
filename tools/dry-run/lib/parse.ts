import { JSDOM } from "jsdom";

/** Reading what a site serves: Atom feeds, sitemaps, HTML pages and Markdown. */

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };

export function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
    );
}

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decodeXml(m[1]!).trim() : undefined;
};
const attr = (xml: string, name: string, where: RegExp) => {
  const el = where.exec(xml)?.[0];
  return el ? decodeXml(new RegExp(`${name}="([^"]*)"`).exec(el)?.[1] ?? "") : undefined;
};

export interface FeedItem {
  id: string;
  title: string;
  link?: string;
  /** YYYY-MM-DD */
  date?: string;
  content: string;
  category?: string;
}

export interface Feed {
  id?: string;
  title?: string;
  subtitle?: string;
  self?: string;
  page?: string;
  updated?: string;
  items: FeedItem[];
}

/** An Atom or RSS document, read loosely: ids, titles, links, dates, text and the first category. */
export function parseFeed(xml: string): Feed {
  if (/<rss[\s>]/.test(xml)) {
    const channel = xml.replace(/<item>[\s\S]*?<\/item>/g, "");
    return {
      title: tag(channel, "title"),
      subtitle: tag(channel, "description"),
      page: tag(channel, "link"),
      self: attr(channel, "href", /<atom:link[^>]*rel="self"[^>]*>/),
      items: [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, x]) => ({
        id: tag(x!, "guid") ?? tag(x!, "link") ?? "",
        title: tag(x!, "title") ?? "",
        link: tag(x!, "link"),
        date: (() => {
          const d = tag(x!, "pubDate");
          return d ? new Date(d).toISOString().slice(0, 10) : undefined;
        })(),
        content: tag(x!, "description") ?? "",
        category: tag(x!, "category"),
      })),
    };
  }
  const head = xml.replace(/<entry>[\s\S]*?<\/entry>/g, "");
  return {
    id: tag(head, "id"),
    title: tag(head, "title"),
    subtitle: tag(head, "subtitle"),
    self: attr(head, "href", /<link[^>]*rel="self"[^>]*>/),
    page: attr(head, "href", /<link[^>]*rel="alternate"[^>]*>/),
    updated: tag(head, "updated"),
    items: [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, x]) => ({
      id: tag(x!, "id") ?? "",
      title: tag(x!, "title") ?? "",
      link: attr(x!, "href", /<link[^>]*rel="alternate"[^>]*>/) ?? attr(x!, "href", /<link[^>]*>/),
      date: (tag(x!, "updated") ?? tag(x!, "published"))?.slice(0, 10),
      content: tag(x!, "content") ?? tag(x!, "summary") ?? "",
      category: attr(x!, "term", /<category[^>]*>/),
    })),
  };
}

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  alternates: string[];
}

export function parseSitemap(xml: string): SitemapUrl[] {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, x]) => ({
    loc: tag(x!, "loc") ?? "",
    lastmod: tag(x!, "lastmod")?.slice(0, 10),
    alternates: [...x!.matchAll(/<xhtml:link[^>]*href="([^"]*)"/g)].map((m) => decodeXml(m[1]!)),
  }));
}

export interface Page {
  title: string;
  description?: string;
  canonical?: string;
  meta: Record<string, string>;
  jsonLd: unknown[];
  /** The main content's text, with spaces evened out. */
  mainText: string;
  /** Every link in the main content, as absolute URLs. */
  mainLinks: string[];
  /** The main content's HTML. */
  mainHtml: string;
}

export const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** An HTML page: its head, structured data, and the text and links of its main content. */
export function parsePage(html: string, url: string): Page {
  const { document } = new JSDOM(html, { url }).window;
  const meta: Record<string, string> = {};
  for (const m of document.querySelectorAll("meta[name], meta[property]")) {
    const key = m.getAttribute("property") ?? m.getAttribute("name")!;
    meta[key] = m.getAttribute("content") ?? "";
  }
  const jsonLd: unknown[] = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent ?? "") as unknown;
      jsonLd.push(...(Array.isArray(data) ? data : [data]));
    } catch {
      jsonLd.push({ "@error": "not valid JSON" });
    }
  }
  const main = document.querySelector("main") ?? document.body;
  for (const el of main.querySelectorAll("script, style, template")) el.remove();
  return {
    title: squash(document.title),
    description: meta.description,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? undefined,
    meta,
    jsonLd,
    mainText: squash(main.textContent ?? ""),
    mainLinks: [...new Set([...main.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).href))],
    mainHtml: main.outerHTML,
  };
}

/** Every link in a Markdown text: [text](url) and bare URLs. */
export function markdownLinks(md: string): string[] {
  const out = new Set<string>();
  for (const m of md.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) out.add(m[1]!);
  for (const m of md.matchAll(/(?<![(\[])\bhttps?:\/\/[^\s)<>\]]+/g)) out.add(m[0].replace(/[.,;:]+$/, ""));
  return [...out];
}

/** A Markdown card's "- **Label:** value" facts. */
export function markdownFacts(md: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of md.matchAll(/^- \*\*([^*]+?):\*\* (.*)$/gm)) out.set(m[1]!, m[2]!.trim());
  return out;
}

/** A Markdown text's headings, in order. */
export const markdownHeadings = (md: string) => [...md.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1]!.trim());
