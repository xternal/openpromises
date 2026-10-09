# Dry runs

A dry run answers one question before a site moves onto OpenPromises, and again before every release: **is everything the engine would publish for this site as good as what the site serves today, or better?**

It reads the site's content from its checkout and fetches its live pages. It changes neither: nothing is written to the site's folder, nothing is deployed, and the only requests are ordinary GET requests, four at a time, under a user agent that names this tool.

```bash
pnpm dry-run
```

Today there is one, for Public Ledger (ledgergov.uk). It expects the site's checkout at `../public-gov-ledger/open-pnl`; set `PUBLIC_LEDGER_DIR` to read it from somewhere else. When the checkout is missing, the dry run is skipped.

| Setting | What it does |
|---|---|
| `PUBLIC_LEDGER_DIR` | Where Public Ledger's checkout is |
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

## The site's files

- `ledgergov.config.ts`: the site's configuration as it would be on the day it moves, built on `fixtures/public-ledger/openpromises.config.ts`
- `ledgergov.ts`: the site's own checks, as broken cards; and the differences already decided, each with its reason
- `ledgergov.dry.tsx`: the run

A difference goes into the decided list only once it is decided, with the decision or document that says so.
