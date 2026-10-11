# Dry runs

A dry run answers one question before a site moves onto OpenPromises, and again before every release: **is everything the engine would publish for this site as good as what the site serves today, or better?**

It reads the site's content from its checkout and fetches its live pages. It changes neither: nothing is written to the site's folder, nothing is deployed, and the only requests are ordinary GET requests, four at a time, under a user agent that names this tool.

```bash
pnpm dry-run
```

There are two: Public Ledger (ledgergov.uk) and Borough Book (boroughbook.uk). `pnpm dry-run` runs both; `pnpm dry-run ledgergov` or `pnpm dry-run boroughbook` runs one. Each expects the site's checkout beside this repository (`../public-gov-ledger/open-pnl`, `../borough-ledger`); a setting below points elsewhere. When a checkout is missing, its dry run is skipped.

| Setting | What it does |
|---|---|
| `PUBLIC_LEDGER_DIR`, `BOROUGH_BOOK_DIR` | Where each site's checkout is |
| `DRY_RUN_LIVE` | Compare with another copy of the site, such as a preview deploy (default `https://ledgergov.uk`) |
| `DRY_RUN_OFFLINE=1` | Use the pages fetched by the last run instead of fetching again |

## What it compares

| Area | How |
|---|---|
| Reading the cards | Every published card and actor is read into format v1; fields the format has no place for are named. Every promise page in the live sitemap must have its card. |
| Checks | Every check the site's own validator makes is turned into a broken copy of a real card, in memory, and the engine must catch it the same way or more strictly. Checks the engine adds are shown too. |
| History | Every change the site has merged to published cards is replayed through the engine's append-only check. |
| Feeds | Every feed the site lists, entry by entry: id, title, text, link and date. |
| Markdown | Each card's `.md`: facts, links and sections. |
| llms.txt | The promises each guide links to. |
| Sitemap | The address and date of every promise page. |
| Structured data | The JSON-LD on each card page: the quotation, the speaker and party, citations, dates, breadcrumbs. |
| Card pages | The facts and outside links on each live card page, against the engine's `PromiseCard`. |
| Accessibility | axe-core on each live card page and on the engine's card. |
| Titles and descriptions | Each page's title and description, against `cardTitle` and `cardDescription`. |
| Open data | The site's API, against the engine's open data files. |

Each difference gets a verdict: **same**, **better**, **changed** (a person should look), **site** (stays the site's own job), **accepted** (already decided, with where) or **worse**. The run fails while anything is worse.

## What it writes

Everything goes to `.dry-run/<site>/`, which git ignores:

- `report.md` and `report.json`: every finding, area by area
- `engine/`: every file the engine would publish, and each card page as the engine renders it
- `live/`: the site's Markdown and the main part of each card page, as fetched, to diff against `engine/`
- `cache/`: the fetched pages, for `DRY_RUN_OFFLINE=1`

## Each site's files

The run itself is `lib/run.tsx`, the same for every site. A site adds a profile and a configuration:

- `ledgergov.config.ts`: the site's configuration as it would be on the day it moves, built on `fixtures/public-ledger/openpromises.config.ts`
- `ledgergov.ts`: the site's own checks, as broken cards; what the site keeps making itself (`OWN`: its contract and figures entries, its contracts section), which the run takes from the live site and hands to the engine as the site's code would, by kind and title only, so nothing the engine should make can be filled in from the live copy; and the differences already decided, each with its reason
- `ledgergov.dry.tsx`: the run
- `boroughbook.ts`, `boroughbook.config.ts`, `boroughbook.dry.tsx`: the same for Borough Book. Its own checks come from borough-ledger `packages/schema/src/content.ts` and `append-only.ts`; it has no page listing its feeds, so they are found on its pages and at the engine's own feed addresses

A difference goes into the decided list only once it is decided, with the decision or document that says so.
