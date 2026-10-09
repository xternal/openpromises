# How the three sites map to format v1

Three promise trackers wrote the same idea separately, and their formats drifted. This document maps each one's cards to [format v1](FORMAT.md), field by field, and says what each site gains and loses by moving. The converters that do it are `fromPublicLedger`, `fromBoroughBook` and `fromRussiaLedger` in `@openpromises/core`; `openpromises migrate` runs them.

Read on 9 October 2026 from each site's `main` branch: Public Ledger (45 cards, 16 actors), Borough Book (18 cards, 2 parties, 3 decision links). The third site, a bilingual Russian and English tracker, is private: only its **format** is described here, never its content.

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
| `outcome_by` | `x.outcome_by` | Only Public Ledger uses it (one card). |
| `editor_check_required` | `x.editor_check_required` | Kept for the record; in v1, approvals in the card say whether a card has been checked. |
| `sources` | `sources` | Same shape. |
| `versions[].version`, `text`, `recorded_on`, `source_url`, `quote_checked_on` | the same | |
| `parameters.who`, `when`, `funded_by` | the same, as `{ en }` (`funded_by: null` stays `null`) | |
| `parameters.how_much_bn_per_year` | `parameters.cost.range` | The unit (£bn a year) moves into the configuration. |
| `parameters.cost_note`, `cost_sources` | `parameters.cost.note.en`, `parameters.cost.sources` | A card with a note but no figure keeps the note: a cost without a range explains why. |
| (none) | `parameters.cost.quality` | **Public Ledger has no quality label on promise costs.** Editors add one per costed card. |
| `events[].text` | `events[].text.en` | Date, type, evidence and `auto` unchanged. |
| `replies[].editor_response` | `replies[].editor_response.en` | |
| `corrections[]` | `corrections[]` | Paths and values follow the fields: `parameters.how_much_bn_per_year` → `parameters.cost.range`, `parameters.cost_note` → `parameters.cost.note`, `parameters.cost_sources` → `parameters.cost.sources`; text values become `{ en }`; `reason` becomes `{ en }`. |
| `reviews[]` | `reviews[]` | `note` becomes `{ en }`. The 45 "AI Journalist" / "Junior Editor" reviews stay `kind: automated`. |
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

Filled in from the conversion of the fixtures; see the next commit.
