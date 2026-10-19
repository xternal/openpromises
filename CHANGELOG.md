# Changelog

All notable changes to OpenPromises. The packages share one version and follow [semantic versioning](https://semver.org/): until 1.0, a minor version (0.x) may change the card format or an API, and says so here. A change that would make a valid card invalid also needs a new format version and a migration (docs/FORMAT.md §14).

## Unreleased

- **Promises on the first screen** (decision 30): a new `PromiseSpotlight` component and `spotlight()` give a home page how many promises there are and where they stand, the three latest changes and the three open promises due next, chosen by rule, each a link to its card, then a link to them all. `lastChanged()` gives the day a promise last changed (an event, a rewording or a reply). Every `PromiseList` row now ends "Open the promise →" (hidden from screen readers, since the whole row is already the link). New messages `spotlight.*` and `list.open`; styles under `.op-spotlight` and `.op-row__open`.

## 0.9.0 (19 October 2026)

Decision 29.

- **The story of a promise** (decision 29): `cardStory()` in `@openpromises/publish` puts a card's whole story in one dated line: the words as first said, every rewording, every event with its evidence, replies, cost changes, corrections, and deadlines and delivery steps still to come. `storyMarkdown()` writes it as Markdown, and a new `PromiseStory` component renders it, for a page of its own that is easy to share. New messages `story.*`; styles under `.op-story`. Nothing else changes.

### Upgrading from 0.8.0

- **No configuration needed.** Nothing changes on a page until a site uses the story: the card format, `PromiseCard`, feeds, Markdown and open data are as they were.
- **To show a promise's story:** render `<PromiseStory view={…} config={…} today={…} />` on a page of its own (for example `/promise/<id>/story`), or inside a card page; `cardStory()` gives the same items as data and `storyMarkdown()` as Markdown. Styles are under `.op-story` in `@openpromises/react/styles.css`.
- **New words** (`story.*`, English and Russian); a site with its own `messages` may set them.

## 0.8.0 (19 October 2026)

Decision 28 (RFC-0002): what a promise costs, what that cost compares with, and what delivery takes.

- **What delivery takes** (decision 28, RFC-0002): a version's parameters may carry an `estimate`: the staff a promise needs and the people it reaches (ranges with a unit and sources), how many months delivery takes (`official_plan` or `reference_class`) and the steps it needs (`path`, from the configured `delivery.steps`; a step is met only by an event with evidence). A new rule, `estimate`, checks them. The card's facts and Markdown show them: "Staff needed: 6,000 to 7,000 teachers", "Time to deliver: 18 to 30 months, by the official plan; the promise allows 14 months", "Steps to deliver: 1 of 2 done". `referenceClass()` gives how long similar promises took, with how many finished, and nothing below 10 cards. `estimate` is a late field.
- **What a cost compares with** (decision 28, RFC-0002): a site may set a fixed basket, `comparisons` in its configuration (population, households, a yearly total and at least 3 units, each with its source, price year and plural forms). `compare()` in `@openpromises/core` works the comparisons out, ranges in and ranges out, yearly costs with recurring units and one-off costs with one-off units; `comparisonLines()` in `@openpromises/publish` puts them in neutral words ("Equal to the cost of 8–12 polyclinics", "Столько же стоит: 8–12 поликлиник"). They appear in a new `Comparisons` component and a section of `PromiseCard`, in the card's Markdown, and in the open data (`comparisons` in `promises.json`; a `comparisons` column at the end of `promises.csv`), never in feeds. Nothing changes for a site without a basket.
- **Our own estimate** (decision 28, RFC-0002): when no one else has costed a promise, a site may publish its own figure, with `cost.by.kind: editorial` (the site's name), `quality: modelled`, a new `cost.method` (how it was worked out) and a range at least ±25% wide. The cost check enforces all four. Every output labels it: "Costs £1.8bn to £3.2bn a year (our estimate)", ru "(наша оценка)"; the card and the Markdown show the method under "About the cost". `cost.method` is a late field (FORMAT.md §9). New messages: `cost.by.editorial`, `cost.ours`, `card.cost_method`. Nothing changes for a card without it.
- Documentation: RFC-0002 says what a promise costs and what that cost compares with. Accepted as recommended on 18 October 2026 (decision 28); the engine work follows in its own pull requests.
- Documentation: RFC-0002 Appendix A lists candidate baskets for the three sites, with their sources. They are candidates, not decisions.

### Upgrading from 0.7.0

- **No configuration needed.** Every new field and setting is optional: a card without them, and a site without a basket, publish exactly as before. The new `estimate` rule checks only cards that have an estimate.
- **New words** in English and Russian (`cost.by.editorial`, `cost.ours`, `card.cost_method`, `estimate.*`, `compare.*`). A site with its own `messages` may set them; the defaults are neutral.
- **New open-data column** at the end of `promises.csv`: `comparisons` (empty without a basket). No column moves.
- **To publish the site's own estimate:** give the cost `by: { kind: editorial, name: <your site.name> }`, `quality: modelled` (keep `modelled` in `money.qualities`), a `method` in every language and a range at least ±25% wide. Use it only when no official body, party or independent source has costed the promise (decision 28, Q3).
- **To show comparisons:** fix your basket first (RFC-0002 Appendix A has candidates), in its own pull request, before any card shows one: set `comparisons` in your configuration with at least 3 units, each with its source, price year and every plural form your languages use (FORMAT.md §2, PUBLISHING.md "What a cost compares with"). Units are in whole currency units; costs scale from `money.unit` (`bn`, `m`, `k` or none).
- **To say what delivery takes:** add `estimate` to a version's parameters (FORMAT.md §5); add your own delivery steps with `delivery.steps`.

## 0.7.0 (17 October 2026)

Decisions 25 to 27.

- **The label names the automated checker** (decision 27): a card verified by an editor that an automated reviewer has also checked now reads "Verified by Pavel Guzhikov, checked by AI Journalist" (Russian: "Подтвердили: Павел Гужиков; автоматическая проверка: AI Journalist"), with the reviewer's name as readers see it (`editorial.renamed`). A new message, `verify.by_checked` (`{editors}`, `{reviewers}`); a card with no automated review keeps `verify.by`. Every output follows, since they all use `verificationText`: `PromiseCard` and `Verification`, the card's Markdown and llms-full.txt, the card's own feed subtitle, and the open data (`verification.text` in `promises.json`, the CSV column `verification`).
- **One approval, by a site's choice** (decision 27): `editorial.approvals` now accepts 1; before 0.7.0 the configuration refused anything under 2. 0 is still refused, and the default stays 2. LedgerGov.UK, BoroughBook.UK and RussiaLedger.com each set 1 in their own configuration. The approvals message reads "needs 1 editor's approval" when one is needed.
- Documentation: the sites are called by their domain, LedgerGov.UK, BoroughBook.UK and RussiaLedger.com (decision 25). Names in code are unchanged.
- Documentation: the engine never holds or asks for an AI key; a site that uses a model brings its own (decision 26). The README's principles now say what decision 22 changed for a site that publishes by checks.

### Upgrading from 0.6.0

- **No configuration needed.** Labels gain "checked by …" where an automated review exists: "Verified by Pavel Guzhikov" becomes "Verified by Pavel Guzhikov, checked by AI Journalist" on a card the AI Journalist reviewed. Cards with no automated review, and cards no editor has approved, read as before. To keep the old words, set `verify.by_checked` in `messages` to the same words as `verify.by`.
- **LedgerGov.UK, BoroughBook.UK and RussiaLedger.com:** to need only one editor's approval, set `editorial: { approvals: 1 }` in the site's own configuration, in its own pull request (decision 27); 0.6.0 refused it, so upgrade first. It applies wherever approvals are needed, a reader's submission included. If the site has its own words for `verify.by`, add `verify.by_checked` beside them.

## 0.6.0 (12 October 2026)

Decisions 22 to 24.

- **Publishing by checks** (decision 22): a new setting, `editorial.publish`. `"approved"`, the default, changes nothing. `"checked"` publishes a card once its checks pass, with no approvals needed unless it is a reader's submission (`origin: reader_submission`) or does not say its origin. On a card no editor has approved, the words must be matched by a machine (a stored-source span or an exact archive check); an editor's `quote_checked_on` counts once editors approve. New in `@openpromises/core`: `needsApprovals`, `publishedByChecks`.
- **How far a card has been verified** (decision 23): `verification(card, { actors, editors })` in `@openpromises/core` gives the level (`none`, `automated`, `editor`, `editors`), counting approvals as the approvals rule does. `verificationText` in `@openpromises/publish` puts it in words, and every output shows it: `PromiseCard` (beside the source; `verification={false}` to leave it out) and a new `Verification` component, the card's Markdown, the card's own feed subtitle, and the open data (`verification` in `promises.json`; CSV columns `verification_level` and `verification`, at the end). An editor is named with `named: true` in the editors list, and counted otherwise. `cardViews` takes the editors list as a third argument; `openpromises publish` takes `--editors`.
- **How a feature reaches the sites** (decision 24): CONTRIBUTING.md.

### Upgrading from 0.5.0

Nothing changes until a site asks for it: without the editors list in `cardViews`, no label is shown, and `editorial.publish` stays `"approved"`.

- **Public Ledger:** set `editorial: { publish: "checked" }`. Pass the editors list to `cardViews` (its build needs `OPENPROMISES_EDITORS` too), and use `verificationText` in place of its own checked-by words, in its pages, `/api/v1` and share images. Move its named editors into the editors list (`named: true`). Its words through `messages`: the defaults are its own. New cards published without editors need an archive check (`openpromises check-quote`) or a stored-source span; its reader-submission rule stays as it is.
- **Borough Book and the bilingual tracker:** nothing to do. To show the label, pass the editors list to `cardViews`; to publish by checks, decide first (decision 22).

## 0.5.0 (12 October 2026)

- **The quote's source on the card page**: `PromiseCard` links the source of the speaker's words, and its archived copy when there is one, beside the date; the structured data cites the archived copy too. Borough Book's dry run found the card never linked them for a card with no separate sources list.
- Documentation: Public Ledger switched to format v1 on 12 October 2026 (decision 21, replacing decision 20). Its dry run now breaks cards in format v1, so it runs before and after a site's switch.

### Upgrading from 0.4.0

- Nothing to change. A card page rendered with `PromiseCard` gains the two links beside the date, and its structured data one more citation where a version has an archived copy.

## 0.4.0 (11 October 2026)

- **Standing** (decision 18): with `actors.standing: manual`, a party without a standing is now an error, as the 0.3.0 warning said. A person still takes their party's.
- **Published from GitHub**: the first release made by the Release workflow, with npm trusted publishing. Every package carries provenance: a signed record of the commit and workflow that built it, shown on its npm page.
- Documentation since 0.3.0: Public Ledger converts not before 1 December 2026 (decision 20); a site on pnpm 12 adds a release a day after it comes out; the migration guide says plainly that converting the cards is the switch.

### Upgrading from 0.3.0

- A party without a `standing`, on a site with `actors.standing: manual`, is now an error. Give each party its standing (`in_power`, `opposition` or `public_body`).

## 0.3.0 (9 October 2026)

Decisions 15 to 19, from Public Ledger's migration plan.

- **Fields an older format lacked** (decision 15): a site converted from Public Ledger's or Russia Ledger's format may add a cost's quality label once, and one converted from Borough Book's may add a cost's sources once, with no correction. The list is the engine's, per format (`LEGACY_LATE_FIELDS`); `appendOnlyIssues` takes the site's `legacy`.
- **No comment is lost on migration** (decision 16): three optional fields, `links.contracts[].note`, an actor role's `source` (`{ url, quote? }`) and an actor's `same_as_checked_on`. `openpromises migrate` moves Public Ledger's comments into them and reports every comment line: moved, partly moved, already said by the configuration, or left for an editor. New in `@openpromises/files`: `commentLines`, `placeComments`.
- **Standing** (decision 18): with `actors.standing: manual`, a party without a standing gets a warning (an error from 0.4.0); a person takes their party's. FORMAT.md now says so.
- **Public Ledger moves after 17 November 2026** (decision 19), and keeps its own draft format until the intake moves (decision 17).
- The dry run's Public Ledger configuration loads under Node itself, not only in the tests.

### Upgrading from 0.2.0

- Lever settings without a label (`links.lever.label`) are now an error, as the 0.2.0 warning said.
- New warning: a party with no `standing` on a site with `actors.standing: manual`. It becomes an error in 0.4.0.
- A converted site keeps `legacy` in its configuration after converting, so its late fields stay allowed.

## 0.2.0 (9 October 2026)

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
