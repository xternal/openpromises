# How the three sites map to format v1

Three promise trackers wrote the same idea separately, and their formats drifted. This document maps each one's cards to [format v1](FORMAT.md), field by field, and says what each site gains and loses by moving. The converters that do it are `fromPublicLedger`, `fromBoroughBook` and `fromRussiaLedger` in `@openpromises/core`; `openpromises migrate` runs them.

Read on 9 October 2026 from each site's `main` branch: Public Ledger (54 cards, 19 actors, at commit 77a86b4), Borough Book (18 cards, 2 parties, 3 decision links). The third site, [Russia Ledger](https://russialedger.com), in Russian and English, keeps its repository private: only its **format** is described here, never its content.

## At a glance

| | Public Ledger | Borough Book | Russia Ledger | Format v1 |
|---|---|---|---|---|
| Who made it | `actor_id` | `actor: { kind, id }` | `actor_id` | `actor_id` |
| Our text | English strings | English strings | `{ ru, en }` | language map per configured language |
| Speaker's words | `text` | `text` | `text` (Russian) and `text_en` | `text`, `lang`, `translations` |
| Cost | per version, `how_much_bn_per_year`, `cost_note`, `cost_sources`; no quality label | per card, `cost_m: { range, quality, note }`; no sources | per version, as Public Ledger | per version, `cost: { range, quality, note, sources }` |
| Deadline | per card | per card | per version | per version |
| Status ladder | national | local, with `not_in_power` | national | presets `national`, `local`, `custom`, with engine categories |
| Corrections | yes, with undo check | none | yes, with undo check | yes, with undo check |
| Reviews and approvals | reviews (automated); approvals are GitHub reviews | none | reviews in the card; two editors; party check | reviews in the card; approvals counted from the editors list; party check |
| Append-only check | versions, events, replies, corrections, reviews; key order ignored | versions and events only; sensitive to key order | as Public Ledger, plus deleted cards | as Russia Ledger |
| Cross-field checks | evidence, version numbers, correction values | standing from seats | evidence, first event, date order, reworded count, status event | all of these |
| Exact quotes | editor's `quote_checked_on`; intake drafts carry a span | page number; manifesto SHA-256 in `parties.yaml` | archive capture checked: exact, close, none | span in a stored source, archive check, or editor's confirmation |
| Drafts | a separate draft format | none | full cards in `content/drafts/` | full cards in `drafts/` |

## Public Ledger

### Cards

| Public Ledger | Format v1 | Notes |
|---|---|---|
| (none) | `format: openpromises/1` | Added. |
| `id` | `id` | |
| `headline` | `headline.en` | |
| `actor_id` | `actor_id` | |
| `made_on` | `made_on` | |
| `venue` | `venue` | Optional in both; 4 cards have none (policy documents and a party's pledge booklet, which the venue list does not cover). |
| `venue_label` | `venue_label.en` | |
| `policy_area` | `area` | The ten areas become `areas: { kind: enum }`. |
| `status`, `status_note` | `status`, `status_note.en` | `national` ladder. |
| `deadline` (card) | `parameters.deadline` of the current version | Decision 3. Every card has one version today, so nothing is lost. |
| `lever_settings`, `preset_label` | `links.lever: { settings, label }` | `lever` module. |
| `contracts` | `links.contracts` | `contracts` module. |
| `origin` | `origin` | |
| `submission_ref`, `credit` | `x.submission_ref`, `x.credit` | Only Public Ledger has reader submissions so far. |
| `outcome_by` | `responsible` (`{ actor_id, note }`, or `null`) | Who must act to deliver it (decision 14). Until 9 October 2026 Public Ledger's `outcome_by` meant credit for an outcome someone else brought about; the converter reads the current meaning. |
| `brought_about_by` | `brought_about_by` | Credit for an outcome someone other than the card's actor brought about (decision 14). |
| `editor_check_required` | `x.editor_check_required` | Kept for the record; in v1, approvals in the card say whether a card has been checked. |
| `sources` | `sources` | Same shape. |
| `versions[].version`, `text`, `recorded_on`, `source_url`, `quote_checked_on` | the same | |
| `parameters.who`, `when`, `funded_by` | the same, as `{ en }` (`funded_by: null` stays `null`) | |
| `parameters.how_much_bn_per_year` | `parameters.cost.range` | The unit (£bn a year) moves into the configuration. |
| `parameters.cost_note`, `cost_sources` | `parameters.cost.note.en`, `parameters.cost.sources` | A card with a note but no figure keeps the note: a cost without a range explains why. |
| `parameters.costed_by` | `parameters.cost.by` | Who made the central figure (decision 14). |
| (none) | `parameters.cost.quality` | **Public Ledger has no quality label on promise costs.** Editors add one per costed card. |
| `events[].text` | `events[].text.en` | Date, type, evidence and `auto` unchanged. |
| `replies[].editor_response` | `replies[].editor_response.en` | |
| `corrections[]` | `corrections[]` | Paths and values follow the fields: `parameters.how_much_bn_per_year` → `parameters.cost.range`, `parameters.cost_note` → `parameters.cost.note`, `parameters.cost_sources` → `parameters.cost.sources`, `parameters.costed_by` → `parameters.cost.by`; text values become `{ en }`; `reason` becomes `{ en }`. |
| `reviews[]` | `reviews[]` | `note` becomes `{ en }`. The "AI Journalist" / "Junior Editor" reviews stay `kind: automated`; `editorial.renamed` shows the old name as the new one. |
| GitHub pull request reviews | `reviews[]` with `kind: editor, approves: true` | Decision 4. Approvals are not in the cards today, so the converter cannot add them. |

### Actors

| Public Ledger | Format v1 |
|---|---|
| `name`, `short_name` | `name.en`, `short_name.en` |
| `kind` (`person`, `party`, `government`) | `kind` |
| `standing`: `government`, `opposition`, `public_body` | `standing`: `in_power`, `opposition`, `public_body` (labels per language in the configuration) |
| `party_id`, `same_as` | the same |
| `roles[].title` | `roles[].title.en` |
| `parliament_member_id`, `parliament_party_id` | `identifiers.parliament_member_id`, `identifiers.parliament_party_id` (still one id, one actor) |

### Gains and losses

**Gains.** Approvals in the card, with the party check in code (today it is a written rule only); checks that the first event is the promise, that events are in date order and that the status has its event; deadlines per version, so a moved deadline is visible history; quality labels on costs; one draft format (full cards with their quote span) instead of two; the neutral-words lint.

**Loses or changes.** Nothing in the cards is lost. Three working habits change: a deadline is moved by a new version (or a correction, if it was our mistake), not by editing the card; two GitHub approvals no longer publish a card by themselves; and intake drafts become full cards in `drafts/`, so the draft-only fields (`speaker.check`, `suggested`, `confidence`, `model`, `why`) need a home when the intake package is extracted (RFC §10, E4), most likely an automated review note and `x`.

## Borough Book

### Cards

| Borough Book | Format v1 | Notes |
|---|---|---|
| (none) | `format: openpromises/1` | Added. |
| `id` | `id` | |
| `actor: { kind, id }` | `actor_id` | The kind lives in the actor's file. The unused `administration` kind is dropped: being in power is worked out from seats, not a kind of actor. |
| `made_on`, `venue` | the same | Borough Book's six venues go in the configuration. |
| `area` | `area` | `areas: { kind: text }`. |
| `ward_id` | `links.ward` | `wards` module (no card uses it yet). |
| `versions[].text`, `recorded_on`, `source_url`, `page` | the same, with `version: 1, 2, …` | |
| `versions[].archive_url` | `versions[].archived_url` | When a version has none and quotes the party's manifesto, the manifesto's archive copy from `parties.yaml` is used. |
| (none) | `versions[].quote_checked_on` | Borough Book does not record when a quote was checked. |
| `cost_m: { range, quality, note }` | `parameters.cost` of the current version | Decision 3; the unit (£m a year) moves into the configuration. |
| `capital_cost_m` | `parameters.capital_cost` | |
| `funded_by`, `deadline` | `parameters.funded_by.en`, `parameters.deadline` | |
| `status` | `status` | `local` ladder: `budgeted`, `not_in_power`. |
| `lever_or_toggle_id` | `links.lever` | `lever` module. |
| `events[]` | `events[]`, `text` as `{ en }` | |
| `replies[]: { from, date, text, url }` | the same | |
| `editor_check_required`, `editor_note` | `x.editor_check_required`, `x.editor_note` | |
| `content/decision_links.yaml` | `links.decisions` on each card | `decisions` module: `{ decision_id, event, quote, suggested_by, suggested_on }`. |

### Actors

| Borough Book | Format v1 |
|---|---|
| `parties.yaml` entry: `id`, `name`, `short` | `actors/<id>.yaml`: `kind: party`, `name.en`, `short_name.en` |
| the party's `manifesto` | `x.manifesto` on the party (title, URL, archive copy, date, SHA-256) |
| seats, counted from `content/councillors/` | `seats` on each party; `actors.standing: fromSeats` |
| `content/councillors/<id>.yaml` | `kind: person`, `party_id`, `roles`; ward and council profile in `x` |

### Gains and losses

**Gains.** Corrections (today any fix to a past entry fails CI); reviews and two-editor approvals in the card; exact-quote checks; an append-only check that ignores key order, survives schema changes and covers replies, corrections and reviews; costs per version with their sources; headlines; checks on the first event, date order and status event; one set of "finished" statuses (engine categories) instead of two.

**Loses or changes.** A cost becomes part of a version, so changing it later means a correction (our mistake) or a new version (a change in the world), not an edit. The decision links move from one file into the cards they belong to.

## Russia Ledger (format only)

Russia Ledger's format is the closest to v1: it was copied from Public Ledger and made stricter and bilingual.

| Russia Ledger | Format v1 | Notes |
|---|---|---|
| `headline: { ru, en }` | `headline: { ru, en }` | `locales: { default: ru, all: [ru, en] }`. |
| `actor_id`, `made_on`, `venue`, `status`, `origin` | the same | Its fourteen venues go in the configuration. |
| `venue_label`, `status_note` (`{ ru, en }`) | the same | |
| `area` (budget section code `"01"`–`"14"`) | `area` | `areas: { kind: codes, pattern }`. |
| `measurement` | `links.measurement` | `metrics` module. |
| `lever_settings` | `links.lever.settings` | `lever` module. |
| `sources[]: { title, url, archived_url, kind, designation_ru }` | `sources[]: { title, url, archived_url, kind, designation }` | `designations` module. |
| `versions[].text` | `versions[].text`, `lang: ru` | |
| `versions[].text_en` | `versions[].translations.en` | |
| `versions[].archived_url`, `quote_checked_on` | the same | `quotes.archive: required`. |
| `parameters.how_much_bn_per_year`, `cost_note`, `cost_sources` | `parameters.cost.range`, `.note`, `.sources` | Like Public Ledger, **no quality label on promise costs**. |
| `parameters.who`, `when`, `funded_by`, `deadline`, `funding_verifiable` | the same | |
| `parameters.metric` | `parameters.metric` | `metrics` module. |
| `events[].description` | `events[].text` | `subtype: deadline_moved` and `restated` events are kept. |
| `replies[]` | `replies[]` | |
| `corrections[]` | `corrections[]` | Paths follow the fields (`.description` → `.text`, cost fields as Public Ledger). `reason` is one string today; v1 wants every configured language. |
| `reviews[]` (`kind: editor` counts as an approval) | `reviews[]` with `approves: true` | `batch: true` is kept. `note` is one string today; v1 wants every configured language. |
| `content/editors.yaml` | `editors.yaml` | Same shape: `handle`, `since`, `party`. |
| actors: `name`, `short_name`, `roles[].title` (`{ ru, en }`), `kind` (`region` too), `level` | the same | `actors.levels: [federal, regional]`, `standing: none`. |

**Gains.** The same checks as today, maintained once for three sites; a configurable ladder; JSON Schema for its Python pipeline instead of a hand-kept mirror. **Loses.** Nothing; it keeps its static export, its privacy rules and its own fields as modules.

## Problems found in the sites' data

Every card copied from Public Ledger (54) and Borough Book (18) converts to format v1 with no loss and passes the format check. `openpromises validate`, run with each site's configuration (`fixtures/*/openpromises.config.ts`), then finds the problems below. Each is a real gap between a site's data and the standard in RFC-0001 §5, not a fault of the conversion. The tests expect exactly these: each site's list is in `fixtures/<site>/expected-issues.txt`, and a test fails if one appears or disappears without the list changing.

Nothing else fails. Every event that moves a status has its evidence, every status has its event, and every Public Ledger correction replays exactly. Borough Book's pledges by the party out of power are all `not_in_power`, and its decision links all match an event.

### Public Ledger: 83 problems of two kinds

**1. No approvals in the cards (all 54 cards; rule `approvals`).** Public Ledger publishes after two GitHub approvals or the owner's merge. All 54 cards still carry `editor_check_required: true`, so by the site's own flag none has had its full editor check. Format v1 needs two approvals recorded in the card from editors on a list (decision 4). Public Ledger has no editors list in its repository, because its guide promises editors that their declarations stay private. Decided on 9 October 2026 ([DECISIONS.md](DECISIONS.md) 10 and 11): the editors list stays private and reaches the checks privately, real approvals from pull requests are imported with their dates, and editors review the remaining cards one by one. The steps are in [MIGRATING.md](MIGRATING.md).

**2. Costs without a quality label (29 cards; rule `cost`).** Public Ledger's promise costs have a range, a note, sources and (since 9 October 2026) who made the central figure, but no quality label. An editor adds one per card (`sourced`, `approx` or `modelled`): uk-abolish-non-dom-2024, uk-awaabs-law-hazards-2026, uk-bics-electricity-2026, uk-bus-cap-2-2026, uk-carried-interest-2024, uk-con-iht-family-home-2026, uk-con-landlord-cgt-relief-2024, uk-con-stamp-duty-abolition-2025, uk-defence-25-2027, uk-electricity-vat-2026, uk-great-british-energy-2024, uk-green-bank-windfall-tax-2026, uk-green-cgt-align-2024, uk-green-wealth-tax-2024, uk-ld-cgt-reform-2024, uk-ld-free-personal-care-2024, uk-ld-personal-allowance-15k-2026, uk-nato-5pc-2035-2025, uk-neighbourhood-police-2024, uk-nhs-40000-appointments-2024, uk-plaid-cgt-equalise-2024, uk-plaid-childcare-20-hours-2026, uk-pubs-business-rates-cut-2026, uk-reform-energy-bills-250-2026, uk-reform-personal-allowance-15k-2026, uk-snp-two-child-cap-2024, uk-two-child-limit-2025, uk-union-learning-fund-2026, uk-vat-private-schools-2024.

One habit to note rather than fix: 20 cards have a `deadline` event dated in the future. Format v1 lets these markers sit out of date order, along with automatic events; otherwise the first event added after one would break the order.

### Borough Book: 62 problems

**1. No approvals in the cards (18 cards; rule `approvals`).** Borough Book's `editor_check_required: false` says two editors read each quote, but not who they were or when. Two editors record their approval per card, or approve the 18 as one batch by a recorded decision (`batch: true`, as the third site did for its first cards).

**2. No headlines (18 cards; rule `headline`).** Borough Book shows the quote as the title. Format v1 needs a neutral 3–8 word headline per card, written from the quote.

**3. Quotes not confirmed (18 cards; rule `quotes`).** Borough Book does not record when a quote was checked against the manifesto. Editors confirm each one (`openpromises review --quote-checked`). Alternatively, the manifesto texts can be stored in `sources/` (Borough Book already records their SHA-256) and each quote given a span, which makes the check automatic.

**4. `hf-free-home-care`: one card holds two promises (rules `first-event`, `event-order`).** Its timeline starts with a `budgeted` event (25 February 2026), then the 2026 promise, then a 2014 promise and the 2015 decisions that carried it out. Format v1 starts every timeline with the promise, records it once, and keeps events in date order. Editors choose one of two fixes. Either the card starts in 2014 (`made_on` 2014-05-22, version 1 the 2014 manifesto's words, version 2 the 2026 words with a `reworded` event), or the 2014 pledge (delivered in 2015) and the 2026 pledge to continue become two cards.

**5. `lab-2026-green-schemes` and `lab-2026-pathway-bond`: evidence from before the pledge (rule `event-order`).** Their `in_plan` (19 January 2026) and `delivering` (28 January 2026) events record council decisions taken before the manifesto of 1 May 2026, so the timeline runs backwards. Editors can keep the earlier decision as context in `status_note` and move the card only on decisions taken after the pledge. Separately, the daily decision-linking job should skip decisions dated before a card's `made_on`, which is how these entered.

**6. `lab-2026-parks`: a single-figure capital cost with no source (rule `cost`).** `capital_cost_m` is `[8, 8, 8]`, from "over £8m", and names no source. Under decision 7 it becomes a range with a stated editorial margin (the note already says £8m is a lower bound), citing the manifesto page as its source. RFC-0001 mentions three Borough Book point costs; the current data has this one.

### The third site (format only)

Its real cards were not read. The invented cards in `fixtures/synthetic-bilingual/` show the gaps in its format: correction reasons and review notes are one string, where format v1 wants every configured language, and promise costs have no quality label. The same invented set shows a draft's near (OCR) match waiting for an editor's eye, and a source whose designation is still unchecked.
