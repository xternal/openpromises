# Changelog

All notable changes to OpenPromises. The packages share one version and follow [semantic versioning](https://semver.org/): until 1.0, a minor version (0.x) may change the card format or an API, and says so here. A change that would make a valid card invalid also needs a new format version and a migration (docs/FORMAT.md §14).

## 0.1.0 (October 2026)

The first public release: the engine behind Public Ledger, Borough Book and Russia Ledger, as one open project.

- **Card format v1** (`format: openpromises/1`): cards, actors and the editors list in YAML, written up in docs/FORMAT.md, with JSON Schema for other languages.
- **`@openpromises/core`**: the schemas, `defineConfig` (status ladder presets with engine categories, neutral labels in English and Russian, modules), and the rules as pure functions: exact quotes, evidence before status, append-only history with public corrections, two editors with no editor approving their own party, one standard for every party, costs as ranges with a source.
- **`@openpromises/quotes`**: exact-quote matching with exact / close / none tiers, normalisation per language, and spans in stored source texts.
- **`@openpromises/files`**: reading a content folder from disk or a git base, converting each site's older format on read, the append-only check against the base branch, and YAML writing that changes only the lines it must.
- **`@openpromises/publish`**: Atom and RSS feeds whose entry ids never change, JSON-LD, Markdown, `llms.txt`, a sitemap, open data and IndexNow change lists.
- **`@openpromises/react`**: server components for promise pages that read without JavaScript, with an optional stylesheet (navy-slate dark mode, every text colour WCAG AA).
- **`@openpromises/cli`**: `openpromises validate`, `new`, `review`, `check-quote`, `deadlines`, `lint`, `migrate`, `publish` and `stats`.
- **Conformance**: a test suite that swaps every party's identity and moves cards between parties, and fails if any outcome changes.
