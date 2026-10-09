# Publishing promises

Two packages turn checked cards into what readers, feed readers, search engines and AI assistants see:

- **`@openpromises/publish`** builds feeds, structured data, Markdown, `llms.txt`, a sitemap and open data from the cards, at build time. Pure functions; no network calls.
- **`@openpromises/react`** renders the pages: the promise card, lists, the status ladder, "coming up" and indexes, as server components that need no JavaScript.

Both read the site's configuration ([FORMAT.md](FORMAT.md) §2) for its address, paths, languages and words. Only published cards (in `promises/`) are ever published; drafts never appear.

## A static site, from the command line

```bash
openpromises publish --out public
```

writes, for every configured language (other languages under their prefix, such as `/en`):

| File | What it is |
|---|---|
| `feeds/all.xml` | Every change to every promise (Atom; or RSS, or both, by `publish.feeds`) |
| `feeds/promise/<id>.xml`, `feeds/actor/<id>.xml`, `feeds/area/<area>.xml` | One card, one actor (a party's includes its people's cards), one area |
| `promise/<id>.md` | Each card in Markdown, beside its page |
| `llms.txt`, `llms-full.txt` | A guide for AI assistants, and every card in full |
| `sitemap-promises.xml` | The promise pages, with each language's address; list it in the site's sitemap index |
| `data/promises.json`, `data/promises.csv` | Open data: every published card (format v1), and one row a card |

With `site.paths.feeds: "{page}/feed.xml"`, each feed sits beside its page instead (`/promise/<id>/feed.xml`, `/promises/feed.xml`), as Borough Book has them.

The command refuses while a published card has an error, so a broken card is never published. It needs `site.url` and `publish.tag` in the configuration.

## Feed entry ids never change

Every entry's id is a tag URI: `publish.tag`, then the card and the entry's place in its append-only history, such as `tag:ledgergov.uk,2026:promise/uk-bus-cap-2-2026/event/1`. Because history only grows, an entry's id never changes, and a feed reader never shows it twice. **Set `publish.tag` once and never change it.** A site moving to OpenPromises sets it to what its feeds already use, so followers notice nothing: Public Ledger `ledgergov.uk,2026`, Borough Book `borough-ledger,2026` (the fixture configurations do, and the tests check the ids match).

## A server-rendered or static Next.js site

Read the content once, at build time, and hand the views to the builders and components:

```ts
// lib/promises.ts
import { todayIn, validateContent } from "@openpromises/core";
import { findConfig, folderSource, loadConfig, readContent } from "@openpromises/files";
import { cardViews } from "@openpromises/publish";

export async function promises() {
  const { config, contentDir } = await loadConfig(findConfig(process.cwd())!);
  const r = validateContent(readContent(folderSource(contentDir), config).input);
  return { config, views: cardViews(r.cards, r.actors), actors: r.actors, today: todayIn(config.timezone) };
}
```

A card page:

```tsx
// app/promise/[id]/page.tsx
import { cardJsonLd, relatedCards, words } from "@openpromises/publish";
import { Breadcrumbs, JsonLd, PromiseCard } from "@openpromises/react";
import "@openpromises/react/styles.css";
import { promises } from "@/lib/promises";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { config, views, today } = await promises();
  const view = views.find((v) => v.id === id && v.where === "promises")!;
  return (
    <main>
      <Breadcrumbs config={config} items={[{ name: config.site.name, href: "/" }, { name: "Promises", href: "/promises" }, { name: view.id, href: `/promise/${id}` }]} />
      <PromiseCard view={view} config={config} today={today} related={relatedCards(view, views)} actions={<a href="/follow">Follow this promise</a>} />
      <JsonLd data={cardJsonLd(view, { config, w: words(config, config.locales.default), today })} />
    </main>
  );
}
```

A feed route:

```ts
// app/feeds/all.xml/route.ts
import { buildFeed, words } from "@openpromises/publish";
import { promises } from "@/lib/promises";

export const dynamic = "force-static";

export async function GET() {
  const { config, views, today } = await promises();
  const feed = buildFeed(views, "all", "", { config, w: words(config, "en"), today }, "atom");
  return new Response(feed.body, { headers: { "content-type": feed.contentType } });
}
```

Or call `publishFiles({ config, views, today })` in a build step and write every file at once.

## The components

| Component | What it shows |
|---|---|
| `PromiseCard` | The full card: the promise and where it stands, the facts at a glance, the timeline, the cost, the site's own sections (`children`) and actions (`actions`), replies, then folded detail (sources, earlier wording with a word-by-word diff, corrections, checks) and related cards |
| `PromiseList` | Cards as rows of links: who, the promise, status, area, cost, deadline. Pass `actors` to say where each party stands |
| `ComingUp` | Open promises due in the next months, nearest first; a passed deadline says so |
| `Ladder`, `StatusPill` | The status ladder with the current step marked, and a status as a labelled pill |
| `Breadcrumbs`, `ActorIndex`, `AreaIndex` | Where the reader is (`aria-current="page"` on the current page) |
| `JsonLd` | Structured data in a safe `<script type="application/ld+json">` |
| `PromiseFilter` (`@openpromises/react/client`) | The only client part: filters a `PromiseList` by status, area and actor once the script runs. Without a script the whole list shows. Build its options with `filterOptions` and its words with `filterWords` |

Every component takes `config` and `locale` (the site's default when left out). Words come from the catalogues in `@openpromises/publish` (`MESSAGES`, English and Russian built in); change any of them with `messages` in the configuration.

**Styles.** `@openpromises/react/styles.css` is optional. Every colour is a token on `:root` (`--op-bg`, `--op-ink`, `--op-accent` and so on), so a site restyles the components by setting the tokens, or styles the `op-` classes itself. Dark mode follows the reader's setting (or `data-theme="dark"` on the root) and uses the navy slate palette, never black. Every text colour passes WCAG AA on the backgrounds it is used on; a test checks it.

**Accessibility.** The components render semantic HTML: headings in order, lists, `<time>`, `lang` on quotes in another language, `aria-current` for the ladder step and the current page, and `<details>` for folded detail. axe-core finds no WCAG 2.1 A or AA problem on the test pages. Pages work at 320px wide without sideways scrolling, and read without JavaScript, from a static export or a `file://` mirror.

## IndexNow

`changedPages(before, after, config)` lists the pages a change touched (each changed card, its actor, party and area pages, and the list, in every language); `indexNowPayload(config, key, urls)` makes the request body. The engine sends nothing: once the deploy shows the new pages, the site POSTs the body to `https://api.indexnow.org/indexnow`, as Public Ledger does now.

## Compared with the sites today

What changes when a site renders its promise pages and feeds with these packages:

| | Public Ledger | Borough Book |
|---|---|---|
| Feed addresses and entry ids | The same (`/feeds/…xml`, `tag:ledgergov.uk,2026:promise/<id>/event/<n>`) | The same (`<page>/feed.xml`, `tag:borough-ledger,2026:…`) |
| Feed entry words | The same, from the same code | Titles now name the event first ("In plan: …"), as Public Ledger's do; the one-off "new pledge card" item is no longer made (the "Promised" entry covers it) |
| Card structured data | `Article` with the `Quotation`, as RFC-0001 §6 asks (today `WebPage`); breadcrumbs unchanged | `Article` with the `Quotation`, as today; the FAQ block stays the site's own |
| Markdown, `llms-full.txt` | The same layout and facts | New |
| Open data | New in this form (the site's `/api/v1` stays its own) | New |
| Kept in the site | Deadline-window feeds and email and Telegram follows (`follow`, decision 8), contract entries, the sandbox link, the reviewer's display name | Payments and ward pages, council decision feeds |
