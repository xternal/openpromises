# Decisions

The owner's decisions about OpenPromises, newest last. The design is in [RFC-0001](RFC-0001.md); a decision recorded here wins over anything older. A change to a decision is a new entry, never an edit of an old one.

## Accepted with RFC-0001 (9 October 2026)

Pavel Guzhikov accepted every recommendation in RFC-0001 §12 on 9 October 2026.

| # | Decided on | Question | Decision | Why |
|---|---|---|---|---|
| 1 | 9 Oct 2026 | Licence of the engine | **Apache-2.0.** Each site keeps its own licence (Public Ledger AGPL-3.0-or-later, Borough Book MIT, Russia Ledger its own choice). | Newsrooms, councils and projects abroad can adopt a permissive library freely, with a patent grant. What needs protecting is the checked content and the standard, and both stay open anyway. |
| 2 | 9 Oct 2026 | Where the code lives | **`github.com/xternal/openpromises`**, the owner's own account; packages under the npm scope `@openpromises`. | The owner keeps it under his own account. Package names stay neutral through the npm scope. Russia Ledger can copy the code into its own repository if it ever needs no visible link. |
| 3 | 9 Oct 2026 | Where cost and deadline live | **In each version** of a promise. | Rewording a promise usually changes them, so keeping them per version keeps history honest. Russia Ledger already does this. |
| 4 | 9 Oct 2026 | Where approvals are recorded | **In the card**, checked against an editors list, with the party check. GitHub reviews stay for discussion. | Works on any git host and for static sites; the two-editor rule is visible in the published content. |
| 5 | 9 Oct 2026 | Drafts | **Full cards in `drafts/`**, carrying their stored source and quote span. | One format from start to finish; the quote is checked before anyone approves. |
| 6 | 9 Oct 2026 | Status ladders | **Presets plus engine categories**: `national`, `local` and `custom`; every status belongs to one of `open`, `progress`, `finished`, `off_ladder`. | Each place keeps its own words, while feeds, deadlines and reviews work the same everywhere. |
| 7 | 9 Oct 2026 | Point costs | **Ranges only.** A single official figure becomes a range with a stated editorial margin. | Keeps uncertainty visible, with one rule for every site. Borough Book's point costs get the margin. |
| 8 | 9 Oct 2026 | `follow` (email and Telegram alerts) | **Later, and optional.** | Only Public Ledger uses it, and Russia Ledger must not; it is extracted when a second site needs it. |
| 9 | 9 Oct 2026 | Timing | **Start on 29 October 2026**, after Public Ledger's Budget-day launch on 28 October. | Nothing moves before that launch. |

## How the decisions are applied

Notes made while building, so a reader can see how each decision was read. None of them changes a decision; anything that would is proposed below and waits for the owner.

- **Decision 9 and this repository.** The engine is built in its own repository from 9 October 2026, as the owner asked when he started it. The three sites are only read: nothing in them changes, and no site moves onto the engine before 29 October. Public Ledger moves first, after 28 October (RFC §10).
- **Decision 4 and private declarations.** The editors list is a file the configuration points to (`editorial.editorsFile`, default `editors.yaml`), and `openpromises validate --editors <path>` can read it from somewhere else. A site that has promised its editors to keep their declarations private can therefore keep the list out of its public repository and give it to its checks privately; a site that publishes its list keeps it beside the cards.
- **Corrections and reviews are not optional.** RFC §7 lists `corrections` and `reviews` among Public Ledger's modules. Because principles 3 (public corrections) and 4 (two editors, recorded in the card) are rules for every site, both are always on. The names are still accepted in `modules`, so the RFC's example configuration works unchanged.

- **Deadline markers and date order.** Events are in date order except automatic ones (the RFC's rule) and `deadline` markers, which Public Ledger dates in the future. Without this exception, the first event added after a future deadline marker would break the order.
- **The YAML the engine writes** quotes dates and the `on` key of a review, so that YAML 1.1 readers such as PyYAML read them as text, not as dates and `true`.

## Accepted on 9 October 2026, after RFC-0001

Proposed while converting the sites' cards (docs/COMPARISON.md), and accepted by Pavel Guzhikov as recommended on 9 October 2026. None of them changes a decision in RFC-0001 §12.

| # | Decided on | Question | Decision | Why |
|---|---|---|---|---|
| 10 | 9 Oct 2026 | Public Ledger's editors' guide promises that their party declarations stay private, but the party check needs them. | **Keep the promise.** The editors list stays out of the public repository and reaches the checks privately: `--editors <file>` or the `OPENPROMISES_EDITORS` environment variable, from a CI secret. Cards show each approving editor's handle. No message the engine prints names an editor's declared party. | Breaking a privacy promise to volunteers costs more than it gains. The check still runs on every change; what is lost is outsiders re-running the party check themselves. |
| 11 | 9 Oct 2026 | Public Ledger's 45 published cards have no approvals in the card, and all are still flagged `editor_check_required: true`. | **Import the approvals that were really given** (each approval on the pull request that published a card, by someone on the editors list) with their original date and a note naming the pull request: `openpromises review --on <date> --note …`. **Editors review the remaining cards one by one.** No batch approval. | The flag says these cards have not had their full check, so a batch approval would record a check that never happened. Importing real approvals saves editors' time without inventing any. |
| 12 | 9 Oct 2026 | The repository will be public and names Russia Ledger (the copied RFC, COMPARISON.md, `fromRussiaLedger`, the format id `russia-ledger`). Should those names go before it is public? | **Keep them.** The recommendation was to rename only if Russia Ledger's own decision on who is visible (its D3) wanted no visible link. D3 was answered on 9 October 2026: the owner is named on that site. No history rewrite is needed. | The link is already public by Russia Ledger's own decision, so renaming would hide nothing. Its content still never comes into this repository. |

How each one is carried out is in [MIGRATING.md](MIGRATING.md).

## Accepted on 9 October 2026, after the Public Ledger dry run

Both came from the Public Ledger dry run of 9 October 2026 (`pnpm dry-run`, [tools/dry-run](../tools/dry-run/README.md)), and Pavel Guzhikov accepted both as recommended the same evening. [UPGRADING.md](UPGRADING.md) is decision 13 for a site's owner; FORMAT.md §5 and §6 carry decision 14.

**13. Upgrading: what never breaks, and how a site upgrades.** Public Ledger changed its card format on 9 October 2026, two hours after release 0.1.0, and 0.1.0 then refused 29 of its 54 cards. Sites and the engine will both keep changing, so a site needs to know what an upgrade can and cannot do to it. Decided:

1. **Cards.** A card valid in format v1 stays valid in every later release. The format only grows, by optional fields; whether a site requires one is the site's own setting, never an upgrade's. A field added to the format may be filled in once on a published entry without a correction (FORMAT.md keeps the list, with the date each field was added), as Public Ledger's `LATE_FIELDS` allows. If a v2 is ever needed, the engine reads v1 cards by converting them on read, as it reads the sites' older formats now, so no site rewrites a published card.
2. **Checks.** A new or stricter rule arrives as a warning that says from which version it becomes an error, and becomes one no sooner than the next minor release. An upgrade never stops a site publishing without notice.
3. **What the public sees.** Feed entry ids, page addresses, structured-data ids and open-data columns never change for an existing card; tests hold them still. Changed wording is listed in the changelog, and a site that wants its own words sets them in `messages`.
4. **Code.** The six packages share one version and are released together. A patch only fixes. A minor adds; while the version is 0.x it may also break, but only with steps under "Upgrading" in the changelog. Version 1.0 comes once Public Ledger and Borough Book run on the engine; after that, breaking changes come only in a major, and the old way keeps working, with a warning, for one major more. Node 22 is supported until its end of life (30 April 2027).
5. **Proof before every release.** The fixtures' outputs of each released version are kept (`fixtures/compat/<version>/`: check results, feed ids, addresses, open data) and every later version must reproduce them or name the change as intended. A report of the packages' exported names and types fails CI when one disappears. The dry run for each live site must find nothing worse (Pavel runs Russia Ledger's privately).
6. **How a site upgrades.** A dependency bot opens one pull request that moves every `@openpromises/*` package to the new version; the site's CI runs `openpromises validate` and its build; the pull request links the changelog's Upgrading notes; it is merged when green. A renamed configuration key is rewritten by `openpromises upgrade`, which touches the configuration and never a card.

Why: sites can upgrade without fear and without reading code, and the engine can still improve. The cost is discipline at release time (the compatibility fixtures, the API report and the dry runs), which is mostly automatic.

**14. Who made a cost, who must deliver, and who brought it about, in format v1.** Public Ledger added three facts on 9 October 2026 that format v1 has no place for, and the AI reporter's posting rules (its RFC, Amendment 1) read them on both Public Ledger and Borough Book. Decided, as optional fields (decision 13.1):

- `cost.by`: who made a cost's central figure, `{ kind: official | party | independent, name }`. A late field. A site requires it with `money.costedBy: "required"`.
- `responsible`: the body that would have to act to deliver the promise as worded, as of now, named by its role (an actor whose kind is in `actors.responsible`, such as `government`), or `null` when no body in power is committed. A card-level fact, kept current by ordinary edits. A site requires it with `actors.responsibleRequired: true`. It is not called `outcome_by`, because Public Ledger's `outcome_by` meant something else until 9 October 2026, and a reader of older data would misread it.
- `brought_about_by`: who brought the outcome about when it was not the card's own actor; only on a card whose status is in progress or finished.

The checks Public Ledger makes on them come with them: the actor exists, `responsible` names a body and never a party or a person, `cost.by` goes with a cost and only with one. Public Ledger's converter maps `costed_by`, `outcome_by` and `brought_about_by` onto these. Why: one reporter, one standard. The alternative, keeping them in each site's `x`, would let each site name them differently and leave the engine unable to check them.

## Proposed, waiting for the owner

None.
