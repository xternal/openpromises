# Fixtures

Real and synthetic content the tests run on. Nothing here is published by OpenPromises.

| Folder | What | Where it comes from |
|---|---|---|
| `public-ledger/source/` | 54 promise cards and 19 actors, in Public Ledger's own format (with `costed_by`, `outcome_by` and `brought_about_by`, added on 9 October 2026) | Copied unchanged from [Public Ledger](https://ledgergov.uk) (`content/promises/`, `content/actors/`), repository `xternal/public-ledger`, `main` at commit `77a86b4` (9 October 2026) |
| `borough-book/source/` | 18 promise cards, `parties.yaml` and `decision_links.yaml`, in Borough Book's own format | Copied unchanged from [Borough Book](https://boroughbook.uk) (`content/`), `main` at commit `bc91890` (9 October 2026) |
| `borough-book/source/seats.yaml` | Seats per party on the council | Counted by us from Borough Book's councillor files; no councillor data is copied |
| `synthetic-bilingual/source/` | Bilingual (Russian and English) cards in the third site's format | **Invented for tests.** Every actor, quote, figure and link is made up; none is a real promise |
| `*/v1/` | The same content converted to format v1 by `openpromises migrate` | Generated; a test checks it is up to date |
| `*/openpromises.config.ts` | Each site's configuration for the converted content | Written for these tests |

## Credit and licence

The Public Ledger and Borough Book cards are published on those sites under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). They are copied here unchanged, as test fixtures, with credit to:

- **Public Ledger** (ledgergov.uk), by Pavel Guzhikov and its editors: promise cards and actors.
- **Borough Book** (boroughbook.uk), by Pavel Guzhikov and its editors: promise cards, parties and council decision links. The quotes inside them are from the parties' own manifestos and the council's papers, as cited in each card.

The converted copies in `*/v1/` are adaptations of the same works, under the same licence. The rest of this repository is under the Apache License 2.0.

## Rules for fixtures

- Copy only cards a site has already published, and record the commit they came from.
- **Never copy content from a private site** (cards, drafts, actors, editors or documents). For other languages and formats, write synthetic cards that are clearly made up.
- Never edit a copied file to make a test pass. A problem in a site's data is listed in [docs/COMPARISON.md](../docs/COMPARISON.md) and expected by the tests.
