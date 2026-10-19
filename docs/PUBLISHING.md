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
| `feeds/all.xml` | Every change to every promise: timeline events, rewordings, replies and cost changes (Atom; or RSS, or both, by `publish.feeds`) |
| `feeds/promise/<id>.xml`, `feeds/actor/<id>.xml`, `feeds/area/<area>.xml` | One card, one actor (a party's includes its people's cards), one area |
| `promise/<id>.md` | Each card in Markdown, beside its page |
| `llms.txt`, `llms-full.txt` | A guide for AI assistants, and every card in full |
| `sitemap-promises.xml` | The promise pages, with each language's address; list it in the site's sitemap index |
| `data/promises.json`, `data/promises.csv` | Open data: every published card (format v1), and one row a card |

With `site.paths.feeds: "{page}/feed.xml"`, each feed sits beside its page instead (`/promise/<id>/feed.xml`, `/promises/feed.xml`), as BoroughBook.UK has them.

The command refuses while a published card has an error, so a broken card is never published. It needs `site.url` and `publish.tag` in the configuration. Give it the editors list (`--editors`, or `OPENPROMISES_EDITORS`) when it is kept outside the content folder, so every card can say how far it has been verified (below).

## How far a card has been verified

Decision 23. Every card says so in words, from one function, so the page, the feeds, the Markdown and the open data always agree:

| Level | Words (English default) |
|---|---|
| `none` | Not yet verified by an editor |
| `automated` | Checked automatically by AI Journalist, not yet verified by an editor (the reviewer's name as readers see it, `editorial.renamed`) |
| `editor`, `editors` | Verified by Pavel Guzhikov and 1 independent editor (editors with `named: true` in the editors list by name, the rest counted) |
| `editor`, `editors`, with an automated review | Verified by Pavel Guzhikov, checked by AI Journalist (decision 27) |

"Verified" is kept for people. Change the words with `messages`: `verify.none`, `verify.automated` (`{reviewers}`), `verify.by` (`{editors}`), `verify.by_checked` (`{editors}`, `{reviewers}`) and `verify.counted` (plural forms; English `.one` and `.other`, Russian also `.few` and `.many`).

Make the views with the editors list, `cardViews(cards, actors, editors)`, and each view carries `verification`; `verificationText(view, config, words)` gives its words. Without the list, approvals cannot be checked, so the views carry none and nothing is shown. Where it appears:

- `PromiseCard`: beside the quote's source, unless `verification={false}`; place `<Verification view={…} config={…} />` anywhere else. On the card, an editor who chose to be counted reads "an independent editor" in the list of checks too.
- Markdown: a "Verification" fact.
- The card's own feed: at the end of its subtitle. Entries are not changed, so followers are not sent old entries again.
- Open data: `verification` in `promises.json`, by card id, with the level, the named editors, the count and the words in every language; the CSV columns `verification_level` and `verification`.

## What a cost compares with

Decision 28 ([RFC-0002](RFC-0002.md)). A site that sets a basket (`comparisons` in its configuration, FORMAT.md §2) shows what each cost compares with. It is worked out by `compare()` in `@openpromises/core` and put in words by `comparisonLines()` in `@openpromises/publish`; nothing is stored on the card.

- **One basket for every card**, in the same order, so the comparison never depends on who made the promise. A site fixes its basket before any card uses it, and its changelog says when it changes.
- **In this order:** per person, per household, a share of the site's yearly total (for a yearly cost), then the units.
- **Like with like:** a yearly cost compares with `recurring` units, a one-off cost (`capital_cost`) with `one_off` units.
- **Ranges in, ranges out:** the low count divides the low cost by the high unit cost, and the high count the high cost by the low unit cost. Two significant figures; "about" when both ends round to one figure.
- **Neutral words:** "Equal to the cost of 8–12 polyclinics", ru "Столько же стоит: 8–12 поликлиник". Never "could build", "instead", "можно было бы" or "вместо". Change them with `messages` (`compare.*`), keeping them neutral.
- **Every figure with its source:** each comparison carries its price year, its source (with where in it) and its quality label. Prices of different years are shown as they are, not adjusted.
- **Money that cannot be traced:** when a version says `funding_verifiable: false`, the comparison says so beside it.

Where it appears: `PromiseCard` (a section after "About the cost", with per person, per household, the share and the first `show` units, and a table of all of them; place `<Comparisons view={…} config={…} />` anywhere else), the card's Markdown (a section with prices and sources), and the open data (`comparisons` in `promises.json`, by card id, with the words in every language; a `comparisons` column at the end of the CSV). Not in feeds: a basket change would otherwise send old entries again.

## Feed entry ids never change

Every entry's id is a tag URI: `publish.tag`, then the card and the entry's place in its append-only history, such as `tag:ledgergov.uk,2026:promise/uk-bus-cap-2-2026/event/1`. Because history only grows, an entry's id never changes, and a feed reader never shows it twice. **Set `publish.tag` once and never change it.** A site moving to OpenPromises sets it to what its feeds already use, so followers notice nothing: LedgerGov.UK `ledgergov.uk,2026`, BoroughBook.UK `borough-ledger,2026` (the fixture configurations do, and the tests check the ids match).

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
  return { config, views: cardViews(r.cards, r.actors, r.editors), actors: r.actors, today: todayIn(config.timezone) };
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

Or call `publishFiles({ config, views, today, actors })` in a build step and write every file at once. Pass `actors` (every actor read) so each actor has a feed even before it has a card.

## What the site adds of its own

Some things on a promise page are the site's own: LedgerGov.UK's contracts behind delivery and its editions of official figures, BoroughBook.UK's council decisions. The site keeps making them, and hands them to the engine, which puts them where readers expect them:

```ts
publishFiles({
  config, views, today, actors,
  site: {
    // A feed entry with a card goes in every feed that card is in (the card's, its actor's and party's, its area's, everything);
    // one without a card goes only in the feed of everything. Ids are the site's, as tag URIs (tagUri), and never change.
    entries: [{ id: tagUri(config, "promise/uk-homes-1-5m-2024/contract/ocds-b5fd17-90d9/0"), card: "uk-homes-1-5m-2024", title: "Contract linked: …", date: "2025-09-26", link: "…", content: "…" }],
    // Markdown sections for a card, after "About the cost", as PromiseCard places `children`.
    sections: (view) => (contracts.has(view.id) ? [{ title: "Contracts behind delivery", lines: contractLines(view.id) }] : []),
  },
});
```

`buildFeed` takes the same entries as `siteEntries` in its context, and `cardMarkdown` the same sections as `sections`.

## The components

| Component | What it shows |
|---|---|
| `PromiseCard` | The full card: the promise and where it stands, the facts at a glance, the timeline, the cost, the site's own sections (`children`) and actions (`actions`), replies, then folded detail (sources, earlier wording with a word-by-word diff, corrections, checks) and related cards |
| `PromiseList` | Cards as rows of links: who, the promise, status, area, cost, deadline. Pass `actors` to say where each party stands |
| `ComingUp` | Open promises due in the next months, nearest first; a passed deadline says so |
| `Ladder`, `StatusPill` | The status ladder with the current step marked, and a status as a labelled pill |
| `Breadcrumbs`, `ActorIndex`, `AreaIndex` | Where the reader is (`aria-current="page"` on the current page) |
| `JsonLd` | Structured data in a safe `<script type="application/ld+json">` |
| `PromiseSpotlight` | Promises for the first screen of the home page (decision 30): how many and where they stand, the latest changes and the open promises due next, each a link straight to its card with "Open the promise →", then a link to them all. Chosen by rule (`spotlight()`), never by hand, the same for every party |
| `PromiseStory` | The promise's whole story in one dated line (decision 29): the words as first said, every rewording, every event with its evidence, replies, cost changes, corrections, and deadlines and delivery steps still to come. Made to stand on its own shareable page; `cardStory()` gives the same items as data and `storyMarkdown()` as Markdown |
| `Verification` | How far the card has been verified, in words, for a site that places it outside `PromiseCard` |
| `PromiseFilter` (`@openpromises/react/client`) | The only client part: filters a `PromiseList` by status, area and actor once the script runs. Without a script the whole list shows. Build its options with `filterOptions` and its words with `filterWords` |

Every component takes `config` and `locale` (the site's default when left out). Words come from the catalogues in `@openpromises/publish` (`MESSAGES`, English and Russian built in); change any of them with `messages` in the configuration.

**Styles.** `@openpromises/react/styles.css` is optional. Every colour is a token on `:root` (`--op-bg`, `--op-ink`, `--op-accent` and so on), so a site restyles the components by setting the tokens, or styles the `op-` classes itself. Dark mode follows the reader's setting (or `data-theme="dark"` on the root) and uses the navy slate palette, never black. Every text colour passes WCAG AA on the backgrounds it is used on; a test checks it.

**Accessibility.** The components render semantic HTML: headings in order, lists, `<time>`, `lang` on quotes in another language, `aria-current` for the ladder step and the current page, and `<details>` for folded detail. axe-core finds no WCAG 2.1 A or AA problem on the test pages. Pages work at 320px wide without sideways scrolling, and read without JavaScript, from a static export or a `file://` mirror.

## IndexNow

`changedPages(before, after, config)` lists the pages a change touched (each changed card, its actor, party and area pages, and the list, in every language); `indexNowPayload(config, key, urls)` makes the request body. The engine sends nothing: once the deploy shows the new pages, the site POSTs the body to `https://api.indexnow.org/indexnow`, as LedgerGov.UK does now.

## Compared with the sites today

What changes when a site renders its promise pages and feeds with these packages. A dry run ([tools/dry-run](../tools/dry-run/README.md)) checks this against the live site, item by item:

| | LedgerGov.UK | BoroughBook.UK |
|---|---|---|
| Feed addresses and entry ids | The same (`/feeds/…xml`, `tag:ledgergov.uk,2026:promise/<id>/event/<n>`) | The same (`<page>/feed.xml`, `tag:borough-ledger,2026:…`) |
| Feed entry words | The same: all 560 live entries identical in id, title, text, link and date (dry run of 9 October 2026), with the site's contract and figures entries handed in as its own (`site.entries`) | Titles now name the event first ("In plan: …"), as LedgerGov.UK's do; the one-off "new pledge card" item is no longer made (the "Promised" entry covers it) |
| Card structured data | `Article` with the `Quotation`, as RFC-0001 §6 asks (today `WebPage`); breadcrumbs unchanged | `Article` with the `Quotation`, as today; the FAQ block stays the site's own |
| Markdown, `llms-full.txt` | The same layout and facts, with the site's own words set in `messages` (as in `tools/dry-run/ledgergov.config.ts`) | New |
| Open data | New in this form (the site's `/api/v1` stays its own) | New |
| Kept in the site | Deadline-window feeds, the figures feed (`updates.xml`) and email and Telegram follows (`follow`, decision 8); making contract and figures entries and the contracts section (handed to the engine, above); the sandbox link and per-household figures on the card page | Payments and ward pages, council decision feeds |
