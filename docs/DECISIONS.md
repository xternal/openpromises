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

## Proposed, waiting for the owner

These came up while converting the sites' cards (docs/COMPARISON.md). None changes the RFC; each is a choice only the owner can make.

| # | Question | Recommendation | Why |
|---|---|---|---|
| P1 | Public Ledger's editors list: its guide promises editors that their party declarations stay private, but the party check needs them. | Keep the promise. Keep the list out of the public repository and give it to the check privately (`openpromises validate --editors`, from a CI secret). Cards show editors' handles as now. | Breaking a privacy promise to volunteers costs more than it gains. The check still runs on every change; what is lost is outsiders re-running the party check themselves. |
| P2 | Public Ledger's 45 published cards have no approvals in the card, and all are still flagged `editor_check_required: true`. | Import the approvals that already exist (two GitHub approvals on the pull request that published a card) as `kind: editor, approves: true` reviews, noting the pull request. Have editors review the remaining cards one by one, not as a batch. | The flag says these cards have not had their full check, so a batch approval would record a check that never happened. Importing real approvals saves editors' time without inventing any. |
| P3 | The repository will be public, and it names Russia Ledger: in the copied RFC, in COMPARISON.md, in `fromRussiaLedger` and in the legacy format id `russia-ledger`. Russia Ledger's own rules keep its working title out of code, and leave the owner's visibility to its decision D3. | Decide before the repository goes public. If D3 wants no visible link, rename these to a neutral name (for example `bilingual-ledger`), and publish with fresh history, because git history would keep the old names. | Renaming takes minutes now. After the repository is public, the names cannot be taken back. |
