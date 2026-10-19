# Contributing to OpenPromises

Thank you for helping. OpenPromises holds the rules that make a promise tracker trustworthy, so every change is held to the same standard as the cards it checks. Everyone here follows the [code of conduct](CODE_OF_CONDUCT.md).

## Ground rules

1. **The principles come first.** Exact words, evidence before status, nothing rewritten, two editors, one standard for every party, numbers with their source, machines suggest and people decide, privacy by default ([RFC-0001 §5](docs/RFC-0001.md)). A change that weakens one of them will not be merged.
2. **Every rule has a test** with a failing example and a passing one.
3. **No party, person or place in the engine's code.** Rules never depend on who made a promise. The conformance test (`packages/core/test/conformance.test.ts`) runs every rule on cards from every party and fails if any outcome changes with the party.
4. **No network calls and no telemetry.** The engine reads and writes local files and runs `git` locally. Fetching sources and archive captures is the site's own job.
5. **Only what two sites need goes into `core`.** Anything else is a module or the site's own `x` field ([RFC-0001 §11](docs/RFC-0001.md)).
6. **Plain British English** in docs and messages: active voice, short sentences, no jargon. A message tells the reader what is wrong and what to do.

## Setting up

You need Node 22.18 or later and pnpm 12.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Tests run against the TypeScript sources, so they need no build first. `pnpm build` writes each package's `dist/` with `tsup`.

The JSON Schema files in `packages/core/schema/` are generated from the Zod schemas. After changing a schema, run `pnpm build && pnpm schema` and commit the result; a test fails while they differ.

## Making a change

1. Open an issue first for anything larger than a fix, so we can agree the approach.
2. Work on a branch; keep each pull request to one change.
3. Add or change tests with the code. A new rule needs at least one card that passes it and one that fails it.
4. Update `docs/FORMAT.md` when the card format or a rule changes. The format is a public standard, and an upgrade never breaks a site (decision 13, [docs/UPGRADING.md](docs/UPGRADING.md)): new fields are optional; a field added to the format is listed as a late field (`LATE_FIELDS` in `packages/core/src/history.ts`, FORMAT.md §9); a new or stricter rule is a warning for one minor release first, and says from which version it becomes an error. `fixtures/compat/` holds every released version's outputs, and its test fails if a change breaks one.
5. Two maintainers review every pull request, as two editors approve every card.
6. To release, record what the version publishes before anything changes again: copy each fixture site's `v1/` and configuration to `fixtures/compat/<version>/<site>/` and run `UPDATE_COMPAT=1 pnpm test`, which writes the outputs and exported names once. Then run each site's dry run (`pnpm dry-run`, [tools/dry-run](tools/dry-run/README.md)): what the engine publishes for a live site must be as good as what the site serves, or better.
7. Release when `main` holds changes the sites should take together, not after every merge; a fix that cannot wait goes out on its own. Then: set all six packages to the new version, date the changelog, commit and push, and when CI is green push the tag (`git tag -a v0.4.0 -m "OpenPromises 0.4.0" && git push origin v0.4.0`). The Release workflow (`.github/workflows/release.yml`) tests, builds and packs every package, then waits for the owner to approve the "npm" environment in GitHub. It publishes all six to npm with trusted publishing, so no npm token or login is needed and each package carries provenance, and creates the GitHub release from the changelog. Run by hand (Actions, Release, Run workflow), it checks and packs without publishing. npm's side, once per package: Settings, Trusted Publisher, GitHub Actions, with organization or user `xternal`, repository `openpromises`, workflow filename `release.yml`, environment name `npm`, and direct `npm publish` allowed. A new trusted publisher lapses unless it is used for a successful publish within two days, so add it just before the first release made this way. Since 12 October 2026 every package requires two-factor authentication and refuses tokens that bypass it, so the Release workflow is the way to publish; a token in a terminal or another CI cannot.

## How a feature reaches the sites

Decision 24. LedgerGov.UK, BoroughBook.UK and RussiaLedger.com each have their own repository and their own working session; the engine is built here, and every one of them follows these steps.

**What goes in the engine:** anything in the card format, the checks, the rules for publishing, the labels a card shows, the shapes of feeds and open data, reusable components and intake, and anything two sites would need. **What stays in a site:** features only that site has, such as LedgerGov.UK's Statement, sandbox, MP and Budget pages, or BoroughBook.UK's council pages.

1. **The owner decides,** and the decision is recorded in [docs/DECISIONS.md](docs/DECISIONS.md).
2. **The engine builds it here,** releases a version, and says in [CHANGELOG.md](CHANGELOG.md) what each site does to upgrade.
3. **Each site adopts it in a pull request of its own, as soon as it is published** (decision 32): the new version, its configuration and its words, and the site's own parity check showing that nothing else changed. A site excludes `@openpromises/*`, and nothing else, from pnpm's one-day wait, and its CI checks those packages' provenance instead ([UPGRADING.md](docs/UPGRADING.md#how-to-upgrade)).
4. **The site's CI enforces it,** through the engine's check, which blocks a merge that breaks a rule.

A site never edits the engine's code, not even a copy of it in its own repository: it asks for the change here, so every site keeps the same rules.

## Licence

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), the licence of this project.
