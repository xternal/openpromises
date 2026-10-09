# OpenPromises

[![CI](https://github.com/xternal/openpromises/actions/workflows/ci.yml/badge.svg)](https://github.com/xternal/openpromises/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/@openpromises/cli.svg)](https://www.npmjs.com/package/@openpromises/cli) [![Licence: Apache-2.0](https://img.shields.io/badge/licence-Apache--2.0-blue.svg)](LICENSE)

**An open engine for tracking what people in power promise.**

A promise is a card: the speaker's exact words, what it would cost (a range, with its source), and a timeline that moves only on evidence and is never rewritten. OpenPromises holds the rules that make such a card trustworthy, and the tools that check them, so a newsroom, a council watchdog or a project in another country can run a promise tracker from a configuration file and a folder of plain YAML files in git.

It is a library and a command-line tool, not a hosted service. It makes no network calls, collects nothing and needs no account.

> **Version 0.2.** The card format is [docs/FORMAT.md](docs/FORMAT.md); publishing and pages are in [docs/PUBLISHING.md](docs/PUBLISHING.md); moving an existing tracker is [docs/MIGRATING.md](docs/MIGRATING.md); what an upgrade never breaks, and how to upgrade, is [docs/UPGRADING.md](docs/UPGRADING.md); the design is [RFC-0001](docs/RFC-0001.md). Changes are in the [changelog](CHANGELOG.md).

## What the engine enforces

1. **Exact words.** A quote that is not found at its stored or archived source cannot be published.
2. **Evidence moves status.** Every status change after "promised" links to its evidence.
3. **Nothing is rewritten.** Versions, events and replies only grow. Our own mistakes are fixed with a recorded correction, and the check proves that undoing the corrections gives back what was published.
4. **Two editors.** Publishing needs two editors' approvals, recorded in the card. An editor never approves a card about their own party.
5. **One standard.** No rule, label or code path depends on which party is involved; a conformance test proves it.
6. **Numbers carry their source.** A cost is a range with a quality label and a source, never a single figure.
7. **Machines suggest, people decide.** Automatic intake and reviewers write drafts and notes, never published cards.
8. **Privacy by default.** No telemetry, no network calls, no accounts.

## Two-minute example

You need Node 22.18 or later. Make a tracker in a new folder and install the command:

```bash
mkdir my-tracker && cd my-tracker && git init
npm install --save-dev @openpromises/cli
mkdir -p content/actors
```

Run it as `npx openpromises`, or add `alias openpromises="npx openpromises"` to type less.

`openpromises.config.yaml` says what your tracker covers:

```yaml
site: { name: Riverside Promises, url: https://example.org }
locales: { default: en, all: [en] }
money: { currency: GBP, unit: m, period: year }
actors: { kinds: [person, party], standing: none }
venues: [manifesto, leaflet, speech]
areas: { kind: text }
ladder: local
editorial: { approvals: 2, partyConflict: true }
quotes: { archive: optional }
```

`content/actors/riverside-greens.yaml` is who made the promise:

```yaml
format: openpromises/1
id: riverside-greens
kind: party
name: { en: Riverside Greens }
```

`content/editors.yaml` lists who may approve cards, and their declared party:

```yaml
editors:
  - { handle: Sam, since: "2026-10-01", party: null }
  - { handle: Alex, since: "2026-10-01", party: null }
```

Start a draft, then fill in the words, the source and the timeline:

```bash
openpromises new riverside-bins-2026 --actor riverside-greens --made-on 2026-05-01 --venue manifesto --area "Streets and bins"
```

`content/drafts/riverside-bins-2026.yaml`, filled in:

```yaml
format: openpromises/1
id: riverside-bins-2026
headline: { en: Collect food waste every week }
actor_id: riverside-greens
made_on: "2026-05-01"
venue: manifesto
area: Streets and bins
status: promised
versions:
  - version: 1
    text: "We will collect food waste from every home every week by April 2027."
    recorded_on: "2026-05-02"
    source_url: https://example.org/manifesto.pdf
    page: 4
    quote_checked_on: "2026-05-02"
    parameters:
      who: { en: Every household in the borough }
      cost:
        range: [1.1, 1.3, 1.6]
        quality: approx
        note: { en: "A year, from the council's waste budget report." }
        sources: [{ title: Waste budget report 2026, url: "https://example.org/waste.pdf" }]
      when: { en: By April 2027 }
      deadline: "2027-04-30"
      funded_by: null
events:
  - date: "2026-05-01"
    type: promised
    text: { en: Pledged in the 2026 manifesto }
```

Check it, then have two editors approve it. On the second approval the card moves from `drafts/` to `promises/`, ready to publish:

```bash
openpromises validate
openpromises review riverside-bins-2026 --by Sam
openpromises review riverside-bins-2026 --by Alex
openpromises validate
```

From then on its history only grows: a status change is a new event with an `evidence_url`, a reworded promise is a new version, and a mistake of ours is fixed with a `corrections` entry. In a pull request, `openpromises validate` compares every published card with the base branch and fails on any silent change.

## Commands

| Command | What it does |
|---|---|
| `openpromises validate` | Checks every card, draft, actor and the editors list against the format and the rules; compares published cards with the base branch (`VALIDATE_BASE`, then `origin/$GITHUB_BASE_REF`, then `origin/main`). Exits non-zero on any error. |
| `openpromises new <id>` | Writes a new draft card to fill in. |
| `openpromises review <id> --by <editor>` | Records an editor's approval in the card (`--on` for one given earlier); on the last approval needed, moves it from `drafts/` to `promises/`. |
| `openpromises check-quote <id> --text <file>` | Checks a card's quote against a stored copy of its source: exact, close or none. |
| `openpromises deadlines` | Appends an automatic `deadline_missed` event to every open card whose deadline has passed. |
| `openpromises lint` | Finds judgement words in our own text, per language; quotes are skipped. |
| `openpromises migrate` | Converts cards in an older format to format v1. |
| `openpromises publish --out <folder>` | Writes feeds, Markdown, `llms.txt`, a sitemap and open data for a static site (published cards only). |
| `openpromises stats` | Counts cards by status, actor and area. |

Run `openpromises help <command>` for the options, and `openpromises help rules` for every rule.

## Packages

| Package | What it does |
|---|---|
| [`@openpromises/core`](packages/core) | Card format v1 (Zod schemas, with JSON Schema in `packages/core/schema/` for other languages), configuration, and the rules as pure functions. |
| [`@openpromises/files`](packages/files) | Reads and writes a content folder, compares it with a git base, migrates older formats on read. |
| [`@openpromises/quotes`](packages/quotes) | Exact-quote matching: normalisation per language, exact / close / none tiers, spans in stored source text. |
| [`@openpromises/publish`](packages/publish) | Atom and RSS feeds, JSON-LD, Markdown, `llms.txt`, sitemap, open data and IndexNow change lists, built from cards. |
| [`@openpromises/react`](packages/react) | Server components for promise pages that read without JavaScript, with an optional stylesheet (navy-slate dark mode). |
| [`@openpromises/cli`](packages/cli) | The `openpromises` command. |

## Who uses it

OpenPromises is extracted from three promise trackers that wrote the same rules separately: [Public Ledger](https://ledgergov.uk) (UK government and parties), [Borough Book](https://boroughbook.uk) (a London council) and [Russia Ledger](https://russialedger.com) (the Russian state, in Russian and English). [docs/COMPARISON.md](docs/COMPARISON.md) shows how each one's cards map to format v1, and [docs/MIGRATING.md](docs/MIGRATING.md) how a site moves.

## Licence

[Apache License 2.0](LICENSE). The test fixtures copied from Public Ledger and Borough Book are under CC BY 4.0 ([fixtures/README.md](fixtures/README.md)).

Made by [Pavel Guzhikov](https://guzh.uk) · [Buy me a coffee](https://ko-fi.com/pavelg)
