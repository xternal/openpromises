# Changelog

All notable changes to OpenPromises. The packages share one version and follow [semantic versioning](https://semver.org/): until 1.0, a minor version (0.x) may change the card format or an API, and says so here. A change that would make a valid card invalid also needs a new format version and a migration (docs/FORMAT.md §14).

## Unreleased (0.2.0)

Everything the Public Ledger dry run found missing (`pnpm dry-run`, tools/dry-run): what the engine would publish for ledgergov.uk is now as good as what the site serves, or better, in every area it compares.

- **Who made a cost, who must deliver, and who brought it about** (decision 14): `cost.by` (`{ kind: official | party | independent, name }`), `responsible` (a body by its role, or `null`) and `brought_about_by`, all optional in format v1, with their checks. A site requires them with `money.costedBy: "required"` and `actors.responsibleRequired: true`. Public Ledger's `costed_by`, `outcome_by` and `brought_about_by` convert to them.
- **Late fields** (decision 13.1): a field added to the format, starting with `cost.by`, may be filled in once on a published version without a correction.
- **Feeds**: an entry for every change to a card's current cost (`…/cost/correction/<n>`, `…/cost/version/<n>`, the ids Public Ledger already uses); a feed for every actor and every configured area, even before it has a card, so a followed address never breaks; a site's own entries in the same feeds (`publishFiles({ site: { entries } })`); each feed's subtitle says what it covers.
- **Markdown**: a site's own sections after "About the cost" (`site.sections`); who made the central figure; "brought about by" beside the status; each quote's licence, by where it comes from (`quotes.licences`, `quotes.otherLicence`); a bare date in "When" reads as a date.
- **Card page**: who made the central figure, and who brought the outcome about.
- **Money**: under 0.1 of a billion, an amount reads in millions ("£14m to £18m", not "£0.01bn to £0.02bn").
- **Reviewers renamed** since their reviews were recorded show their current name (`editorial.renamed`).
- **Open data**: four columns at the end of `promises.csv`: `cost_by_kind`, `cost_by_name`, `responsible_id`, `brought_about_by_id`.
- **Compatibility, proved** (decision 13): `fixtures/compat/0.1.0` keeps 0.1.0's outputs for the fixture sites and the names it exported; every later version must still produce them. docs/UPGRADING.md says what an upgrade never breaks and how to upgrade.

### Upgrading from 0.1.0

Nothing to do: every 0.1.0 card, configuration and call still works.

- New warning: lever settings with no label (`links.lever.label`). It becomes an error in 0.3.0.
- Changed words, which `messages` can set back: feed subtitles now say what each feed covers (they were the site's description); a cost made by someone named reads "central £0.4bn by Department for Transport, official".
- `publishFiles` takes `actors` (every actor gets a feed) and `site` (your own entries and sections); `openpromises publish` passes the actors.
- The Public Ledger fixture now copies the site at commit 77a86b4 (54 cards).

## 0.1.0 (9 October 2026)

The first public release: the engine behind Public Ledger, Borough Book and Russia Ledger, as one open project.

- **Card format v1** (`format: openpromises/1`): cards, actors and the editors list in YAML, written up in docs/FORMAT.md, with JSON Schema for other languages.
- **`@openpromises/core`**: the schemas, `defineConfig` (status ladder presets with engine categories, neutral labels in English and Russian, modules), and the rules as pure functions: exact quotes, evidence before status, append-only history with public corrections, two editors with no editor approving their own party, one standard for every party, costs as ranges with a source.
- **`@openpromises/quotes`**: exact-quote matching with exact / close / none tiers, normalisation per language, and spans in stored source texts.
- **`@openpromises/files`**: reading a content folder from disk or a git base, converting each site's older format on read, the append-only check against the base branch, and YAML writing that changes only the lines it must.
- **`@openpromises/publish`**: Atom and RSS feeds whose entry ids never change, JSON-LD, Markdown, `llms.txt`, a sitemap, open data and IndexNow change lists.
- **`@openpromises/react`**: server components for promise pages that read without JavaScript, with an optional stylesheet (navy-slate dark mode, every text colour WCAG AA).
- **`@openpromises/cli`**: `openpromises validate`, `new`, `review`, `check-quote`, `deadlines`, `lint`, `migrate`, `publish` and `stats`.
- **Conformance**: a test suite that swaps every party's identity and moves cards between parties, and fails if any outcome changes.
