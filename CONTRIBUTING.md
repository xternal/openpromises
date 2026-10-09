# Contributing to OpenPromises

Thank you for helping. OpenPromises holds the rules that make a promise tracker trustworthy, so every change is held to the same standard as the cards it checks.

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
4. Update `docs/FORMAT.md` when the card format or a rule changes. The format is a public standard: a change that would make a valid card invalid needs a new format version and a migration (`openpromises migrate`).
5. Two maintainers review every pull request, as two editors approve every card.

## Licence

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), the licence of this project.
