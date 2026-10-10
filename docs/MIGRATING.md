# Moving a site onto OpenPromises

This guide is for a site that already has promise cards in its own format (Public Ledger, Borough Book or the bilingual tracker). The move is a handful of changes, made in this order. Steps 1 and 2 change nothing readers see, and step 6 can start at once as a check that reports without blocking. Step 3 is the switch: once the cards are in format v1, the site reads them through the engine (`@openpromises/files` and `cardViews`), so it goes in a change of its own, at a quiet time, with the dry run passing ([tools/dry-run](../tools/dry-run/README.md)). The site's pages can stay its own.

[docs/COMPARISON.md](COMPARISON.md) says how each site's fields map to format v1, and lists the problems each site must fix.

## 1. Configure, and see where you stand

You need Node 22.18 or later: the configuration is a TypeScript file, which earlier versions cannot read. Write `openpromises.config.ts` at the root of the site, starting from that site's file in `fixtures/<site>/openpromises.config.ts`. Set `legacy` to the site's current format, so cards without a `format:` line are read as v1:

```bash
openpromises validate --no-base
```

The problems listed are the ones COMPARISON.md describes. Nothing has changed yet.

Then see what readers and machines would notice. A dry run ([tools/dry-run](../tools/dry-run/README.md)) builds everything the engine would publish for the site and compares it, area by area, with what the live site serves: cards, checks, history, feeds, Markdown, structured data and pages. It changes nothing. The move goes ahead when it finds nothing worse.

## 2. The editors list

Approvals are recorded in the card and checked against a list of editors and their declared parties (decision 4). Choose where the list lives:

- **Public**, as `content/editors.yaml` beside the cards, so anyone can re-run every check. Editors may use pen names.
- **Private**, when the site has promised editors that their declarations stay private (decision 10). Keep the list out of the repository, keep it as a CI secret, and point the commands at it with `--editors <file>` or the `OPENPROMISES_EDITORS` environment variable. Cards still show each approving editor's handle. No message the engine prints names an editor's party.

In GitHub Actions, with the list stored as the secret `OPENPROMISES_EDITORS`:

```yaml
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the append-only check compares with origin/main
      # … set up Node and pnpm, install …
      - name: Check the cards
        env:
          EDITORS_YAML: ${{ secrets.OPENPROMISES_EDITORS }}
        run: |
          printf '%s\n' "$EDITORS_YAML" > "$RUNNER_TEMP/editors.yaml"
          OPENPROMISES_EDITORS="$RUNNER_TEMP/editors.yaml" pnpm exec openpromises validate
```

GitHub does not give secrets to pull requests from forks, so editors work on branches of the site's own repository. Each editor keeps a copy of the list and sets `OPENPROMISES_EDITORS` before running `openpromises review`.

## 3. Convert, in a change of its own

```bash
openpromises migrate
openpromises validate
```

`migrate` rewrites every card (and actor) in format v1. Put nothing else in this change. `validate` compares the converted forms with the base branch, so it shows that the change rewrites no history.

Comments in the old files are not lost (decision 16). `migrate` moves each one it understands into its field: why a contract is linked, where a role is confirmed, when official pages were checked. It then lists every comment line with what happened to it. Those it could not place are left for an editor to decide. Read the list before merging; `--dry-run` shows it without writing anything.

Keep `legacy` in the configuration after this change too. Editors may then fill in, once and with no correction, the fields the old format had no place for, such as Public Ledger's cost quality labels (decision 15, FORMAT.md §9).

## 4. Record approvals

A published card needs two editors' approvals in the card. Where they already exist somewhere else, import them; where they do not, editors review the card (decision 11). Never approve as a batch cards that were not fully checked.

**Import approvals that were really given.** For each published card, look at the pull request that published it. Import each approval given there by someone on the editors list, with the day it was given:

```bash
openpromises review <card id> --by "<editor>" --on <YYYY-MM-DD> --note "Approved in pull request <owner/repo#number>"
```

The command refuses an approval by someone not on the list, one dated outside their time as an editor, and one of a card about their own party.

**Review the rest card by card.** An editor checks the card against its sources (the checklist in the site's editors' guide), then records the approval:

```bash
openpromises review <card id> --by "<editor>" --note "Checked every source"
```

## 5. Fix the data

Work through the site's list in COMPARISON.md: headlines, quality labels on costs, timelines, point costs. A change to something already published is a correction, recorded in the card (docs/FORMAT.md §9).

## 6. Switch the check

While steps 4 and 5 are in progress, run `openpromises validate` in CI next to the site's own check, as a step that reports without blocking (`continue-on-error: true`), so everyone can see what is left. When it passes, make it blocking and remove the old check. Keep `legacy` in the configuration (decision 15).

## Per site

| Site | When | What is left after converting |
|---|---|---|
| Public Ledger | After 17 November 2026 (decision 19) | Editors list kept private (decision 10). Approvals for 54 cards (main at 77a86b4): import those given on pull requests, review the rest (decision 11). Quality labels on 29 costs, added after converting with no correction needed (decision 15; keep `legacy: public-ledger` in the configuration). `migrate` moves 38 of the 63 comment lines into fields and lists the rest (decision 16). Drafts stay in the site's own format until the intake moves (decision 17). The configuration to start from is `tools/dry-run/ledgergov.config.ts`: the site's own words, quote licences, its renamed reviewer, `money.costedBy: "required"` and `actors.responsibleRequired: true` (decision 14). Its contract and figures entries and its contracts section go to the engine through `publishFiles({ site })`. One check stays in the site's own `validate` script, which keeps running for its budget data: `submission_ref` and `credit` only on a reader submission (agreed by Pavel Guzhikov on 9 October 2026, rather than a hook for each site's own rules). |
| Borough Book | After Public Ledger (RFC §10, E3) | Approvals and headlines for 18 cards; record each quote check; untangle the timeline of `hf-free-home-care`; move two cards only on decisions taken after the pledge; give the parks cost a range and a source. |
| Bilingual tracker | With its milestones M5/M7 (RFC §10, E4) | Correction reasons and review notes in both languages; quality labels on costs. |
