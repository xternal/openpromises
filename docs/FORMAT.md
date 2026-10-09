# Card format v1

This is the standard a promise tracker built on OpenPromises follows: how a promise card, an actor and the editors list are written, which rules they must pass, and what may change once a card is published. It is enough to write valid cards and run `openpromises validate` without reading the code. The design behind it is [RFC-0001](RFC-0001.md) §8.

Every file is YAML. Dates are written `"YYYY-MM-DD"`, in quotation marks. URLs are full `http://` or `https://` addresses.

## 1. A content folder

```
openpromises.config.ts    the site's configuration (or .yaml, .json, .js)
content/
  promises/<id>.yaml      published cards: two editors approved each one
  drafts/<id>.yaml        cards waiting for editors; never published
  actors/<id>.yaml        who makes promises: people, parties, governments
  editors.yaml            who may approve cards, and their declared party
  sources/<name>.txt      stored source texts that quotes point into (optional)
  quotes.json             results of checking quotes against archived copies (optional)
```

A file's name is its `id` plus `.yaml`. Cards and drafts share one set of ids. A card moves from `drafts/` to `promises/` when it has its last approval (`openpromises review`), and never moves back.

## 2. Configuration

One file at the root of the site, `openpromises.config.ts` (or `.mts`, `.js`, `.mjs`, `.json`, `.yaml`). In TypeScript:

```ts
import { defineConfig } from "@openpromises/core";

export default defineConfig({
  site: { name: "Public Ledger", url: "https://ledgergov.uk" },
  locales: { default: "en", all: ["en"] },
  money: { currency: "GBP", unit: "bn", period: "year" },
  actors: { kinds: ["person", "party", "government"], standing: "manual", ids: { parliament_member_id: "UK Parliament member" } },
  venues: ["manifesto", "speech", "debate", "tv", "interview", "press_release", "parliament", "social"],
  areas: { kind: "enum", values: ["taxes", "health", "defence"] },
  ladder: "national",
  editorial: { approvals: 2, partyConflict: true },
  quotes: { archive: "optional" },
  modules: ["contracts", "lever"],
});
```

| Key | Meaning | Default |
|---|---|---|
| `site` | `{ name, url? }` | required |
| `content` | The content folder, relative to the configuration file | `"content"` |
| `timezone` | The time zone "today" is taken in, for deadlines and reviews (an IANA name such as `"Europe/London"`) | `"UTC"` |
| `locales` | `{ default, all }`: the languages every text we write must have. `default` is one of `all`. | `{ default: "en", all: ["en"] }` |
| `money` | `{ currency, unit, period, qualities }`. Costs are written in `unit` of `currency` (for example `"bn"` of `"GBP"`), per `period` (`"year"`). `qualities` is the list of quality labels a cost may carry. | `qualities: ["sourced", "approx", "modelled"]`, `period: "year"` |
| `actors` | `{ kinds, standing, levels?, ids? }`. `kinds`: the kinds of actor allowed (`party` is the kind the party check uses). `standing`: `"manual"` (each actor states it), `"fromSeats"` (worked out from the seats each party holds) or `"none"`. `levels`: allowed values of an actor's `level`, such as `["federal", "regional"]`. `ids`: the outside identifiers an actor may carry, such as a parliament's member id. | `kinds: ["person", "party", "government"]`, `standing: "none"` |
| `venues` | Where promises are made. A card's `venue` must be one of them. | any venue allowed |
| `areas` | What a card's `area` may be: `{ kind: "enum", values: [...] }`, `{ kind: "codes", pattern: "^(0[1-9]\|1[0-4])$" }` or `{ kind: "text" }` (any short text). | `{ kind: "text" }` |
| `ladder` | The status ladder: `"national"`, `"local"`, or `{ custom: [{ id, category }, ...] }` (§6). | `"national"` |
| `labels` | Status labels per language: `{ en: { failed: "Not met" } }`. Neutral defaults exist in English and Russian (§6). | defaults |
| `headline` | Headline limits per language: `{ en: { minWords: 3, maxWords: 8, maxChars: 70 } }`. | §11 |
| `editorial` | `{ approvals, partyConflict, editorsFile }`: approvals needed to publish; whether an editor may approve a card about their own party (never, when `true`); where the editors list is. | `{ approvals: 2, partyConflict: true, editorsFile: "editors.yaml" }` |
| `quotes` | `{ archive, require, minWords }`. `archive: "required"` means every version needs an `archived_url`. `require: "editor"` accepts an editor's confirmation (`quote_checked_on`) when no machine check exists; `"match"` needs a machine match for every version. `minWords`: the shortest quote a stored-source span may hold. | `{ archive: "optional", require: "editor", minWords: 6 }` |
| `modules` | Optional parts a card may use (§10): `contracts`, `decisions`, `lever`, `metrics`, `designations`, `wards`. (`corrections` and `reviews` are accepted but always on.) | `[]` |
| `legacy` | The older format that cards without a `format:` line are in: `"public-ledger"`, `"borough-book"` or `"russia-ledger"`. They are converted on read (§14). | none |
| `deadlines` | `{ text: { en: "…" } }`: the words of the automatic `deadline_missed` event, per language. English and Russian are built in. | built in |
| `lint` | `{ words: { en: [...] }, allow: { en: [...] } }`: extra judgement words, and phrases to allow, per language. | built in |
| `x` | Zod schemas for the site's own fields: `{ card, actor }` (TypeScript configuration only). | none |

A YAML or JSON configuration has the same keys, except `x`.

## 3. Text we write, and the speaker's words

**Text we write is a language map**: one entry per configured language. With `locales.all: ["en"]` it is `{ en: "…" }`; with `["ru", "en"]` it is `{ ru: "…", en: "…" }`. Every language map must have exactly the configured languages.

**The speaker's words are kept as said**, as plain text, never as a language map. A version or a reply may say which language the words are in (`lang`, default `locales.default`) and carry our translations (`translations`, a language map that may leave out the original language).

## 4. A promise card

```yaml
format: openpromises/1
id: uk-bus-cap-2-2026
headline: { en: Cap bus fares at £2 }
actor_id: andy-burnham
made_on: "2026-07-22"
venue: press_release
venue_label: { en: Government announcement }
area: economic_affairs
status: in_plan
status_note: { en: "Funding was named when it was announced, but it is not yet in an Estimates line." }
origin: manual
sources:
  - { title: "Written statement to Parliament: £2 bus fares from January 2027", url: "https://www.gov.uk/government/speeches/2-bus-fares-from-january-2027" }
versions:
  - version: 1
    text: "I’ve done it before and I will do it again now: a £2 cap on bus fares for millions across the country."
    recorded_on: "2026-07-22"
    source_url: https://www.gov.uk/government/news/cheaper-travel-for-millions-with-a-third-off-fares
    quote_checked_on: "2026-10-06"
    parameters:
      who: { en: Bus passengers on participating services in England outside London }
      cost:
        range: [0.36, 0.4, 0.44]
        quality: sourced
        note: { en: "Year shown: 2027. Low–high is an editorial ±10% because the source gives a central figure only." }
        sources:
          - { title: "Written statement to Parliament", url: "https://www.gov.uk/government/speeches/2-bus-fares-from-january-2027" }
      when: { en: 1 January to 31 December 2027 }
      deadline: "2027-01-01"
      funded_by: { en: "An extra £454m from a reprioritisation of DESNZ’s budget" }
events:
  - date: "2026-07-22"
    type: promised
    text: { en: "PM announces a £2 cap on single bus fares from 1 January to 31 December 2027" }
  - date: "2026-07-22"
    type: in_plan
    text: { en: "Written statement to Parliament confirms the scheme and names the funding" }
    evidence_url: https://www.gov.uk/government/speeches/2-bus-fares-from-january-2027
replies: []
corrections: []
reviews:
  - { by: Sam, kind: editor, on: "2026-10-07", approves: true }
  - { by: Alex, kind: editor, on: "2026-10-08", approves: true }
links:
  lever: { settings: { bus_cap_2: 1 }, label: { en: "£2 bus cap, as announced" } }
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `format` | `openpromises/1` | yes | The format this file is written in. |
| `id` | lower-case letters, digits and `-` | yes | The card's id; the file is `<id>.yaml`. |
| `headline` | language map | yes, to publish | A neutral summary of what is promised, written from the quote alone ("Cap bus fares at £2"). It names the card in titles and lists; the quote stays the record. Not history: it can be improved at any time. |
| `actor_id` | actor id | yes | Who made the promise (`actors/<id>.yaml`). |
| `made_on` | date | yes | When the promise was made. The first event is the promise, on this date. |
| `venue` | one of `venues` | no | Where it was made. |
| `venue_label` | language map | no | The venue's own name ("Labour manifesto 2026, page 3"). |
| `area` | per `areas` | yes | What the promise is about. |
| `status` | a ladder status | yes | Where the promise stands now (§6). |
| `status_note` | language map | no | Why it stands there. Describes the present, so it may be edited. |
| `origin` | `manual`, `reader_submission` or `llm_intake` | no | How the card started. Default `manual`. |
| `sources` | list of sources | no | Further reading about the promise. Describes the present, so it may be edited. |
| `versions` | list of versions | yes, at least one | The promise as worded, oldest first (§5). History. |
| `events` | list of events | yes, at least one | The timeline, oldest first (§7). History. |
| `replies` | list of replies | no | Replies from the people a card is about (§8). History. |
| `corrections` | list of corrections | no | Our own mistakes, fixed in public (§9). History. |
| `reviews` | list of reviews | no | Checks and approvals of the whole card (§10). History. |
| `links` | module data | no | Data for the site's modules (§10). |
| `x` | anything | no | The site's own fields. Checked by the site's own schema if it gives one. |

A **source** is `{ title, url, archived_url? }`. With the `designations` module it may also carry `kind` (`official`, `party`, `media` or `independent`) and `designation` (`{ status, checked_on }`, §10).

Unknown fields are errors, so a misspelt field never passes silently. Put anything else in `x`.

## 5. Versions

A version is the promise as worded once. Rewording a promise, or moving its deadline, adds a version (and a `reworded` event); a past version is never edited.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `version` | 1, 2, 3… | yes | Numbered in order. |
| `text` | text | yes | **The speaker's exact words**, copied from the source. |
| `lang` | language code | no | The language of `text`. Default `locales.default`. |
| `translations` | language map | no | Our translations of `text`, shown as such. |
| `recorded_on` | date | yes | When we recorded this version. |
| `source_url` | URL | yes | Where the words are. |
| `archived_url` | URL | if `quotes.archive` is `required` | An archived copy holding these words. |
| `page` | number or `null` | no | The page in a printed or PDF source. |
| `quote_checked_on` | date or `null` | no | When an editor confirmed the words at the source. |
| `source_text` | `{ file, span }` | no | The words in a stored copy of the source: `file` names `sources/<file>`, and `span: [start, end]` are the character positions of the quote in it (JavaScript string offsets). |
| `parameters` | parameters or `null` | yes | What the promise says. `null` only when the card is `unscoreable`. |

**Parameters** answer the four questions. All are optional; leave one out when the source does not say.

| Field | Type | Meaning |
|---|---|---|
| `who` | language map | Who benefits or pays. |
| `cost` | cost | What it would cost each `money.period`, in `money.unit`. Absent means the cost was not stated. |
| `capital_cost` | cost or `null` | A one-off total, for building or buying something. |
| `when` | language map | When, in words. |
| `deadline` | date or `null` | The date the promise is due, as worded in this version. |
| `funded_by` | language map or `null` | What pays for it, exactly as stated. `null` means "Funding not stated". |
| `funding_verifiable` | `true` or `false` | `false` when the money sits where open documents cannot show it. |
| `metric` | metric | With the `metrics` module: an indicator target (§10). |

A **cost** is a range, never a single figure:

```yaml
cost:
  range: [36, 40, 44]          # low, central, high
  quality: sourced             # one of money.qualities
  note: { en: "Low–high is an editorial ±10% because the OBR gives a central figure only." }
  sources:
    - { title: "OBR: Economic and fiscal outlook, March 2026", url: "https://obr.uk/…" }
```

With a `range`, a cost needs a `quality` and at least one source, and low must be less than high. A single official figure becomes a range with a stated editorial margin, and the note says so. A cost with no `range` records why there is no figure: it needs a `note` (and may list the sources it read).

## 6. Status ladder

Each status belongs to one of four engine categories, so feeds, deadlines and reviews work the same whatever a site calls its statuses:

| Category | Meaning |
|---|---|
| `open` | Promised, nothing yet. |
| `progress` | On the way. |
| `finished` | The story has ended. |
| `off_ladder` | Not on the ladder: cannot be scored, or out of power. |

**Presets**

| Preset | `open` | `progress` | `finished` | `off_ladder` |
|---|---|---|---|---|
| `national` | promised | in_plan, legislated, funded, delivering | delivered, failed, quietly_dropped | unscoreable |
| `local` | promised | in_plan, budgeted, delivering | delivered, failed, quietly_dropped | not_in_power, unscoreable |

A **custom** ladder lists its statuses in order: `{ custom: [{ id: promised, category: open }, { id: started, category: progress }, …] }`. The first is always `promised`, in `open`.

Three status ids have a meaning in the rules: `promised` (the first event), `unscoreable` (a card with no parameters) and `not_in_power` (a pledge by a party out of power, §11).

**Labels** are neutral and per language. The defaults name the facts, never a verdict on a person:

| Status | English | Russian |
|---|---|---|
| promised | Promised | Обещано |
| in_plan | In plan | В плане |
| legislated | Legislated | Закон принят |
| funded | Funded | Профинансировано |
| budgeted | Budgeted | В бюджете |
| delivering | Delivering | Выполняется |
| delivered | Delivered | Выполнено |
| failed | Not met | Не выполнено |
| quietly_dropped | Undone | Без продолжения |
| not_in_power | Not in power | Не у власти |
| unscoreable | Unscoreable | Нельзя оценить |

## 7. Events

The timeline, oldest first.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `date` | date | yes | When it happened. |
| `type` | event type | yes | A ladder status, or one of the types below. |
| `text` | language map | yes | What happened, in our words. |
| `evidence_url` | URL | for most types | The document that shows it happened. |
| `auto` | `true` | no | Added by a job (`openpromises deadlines`), not by a person. |
| `subtype` | `deadline_moved` | no | On a `reworded` event: the new wording moves the deadline. |

| Type | Meaning | Evidence |
|---|---|---|
| `promised` | The promise is made. Always the first event, on `made_on`, and only once. | no |
| any `progress` or `finished` status | The promise moved up the ladder, or its story ended. | **yes** |
| any `off_ladder` status | Recorded for the timeline. | no |
| `reworded` | The promise was reworded: one for each version after the first. | **yes** |
| `restated` | The promise was repeated with the same terms. | **yes** |
| `reply` | The actor replied (§8). | **yes** |
| `deadline` | A marker for the day the promise is due. It may be dated in the future. | no |
| `deadline_missed` | The deadline passed with no evidence of delivery (automatic). | no |

## 8. Replies

Anyone a card is about may reply; the reply is published next to the card with the editors' response.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `from_actor_id` or `from` | actor id, or a name | one of them | Who replied. |
| `date` | date | yes | When. |
| `text` | text | yes | Their words, as sent. |
| `lang`, `translations` | | no | As for a version (§5). |
| `url` | URL | no | Where the reply is published. |
| `editor_response` | language map | no | Our response. |

## 9. Corrections

History is never rewritten, but our own mistakes must be fixable. A correction fixes an error *we* made in a version, event or reply: a wrong date, a misread figure, a note that says more than its source. Changes in the world are new events or versions, never corrections.

To correct a field, change it and, in the same change, append an entry to `corrections`:

```yaml
corrections:
  - date: "2026-10-08"
    path: versions[0].parameters.cost.range
    was: [32.4, 36, 39.6]
    now: [36, 40, 44]
    reason: { en: "The OBR has an official costing; the IFS figure stays as support." }
    source_url: https://obr.uk/…
```

| Field | Meaning |
|---|---|
| `date` | When we corrected it. |
| `path` | The field: `versions[n]`, `events[n]` or `replies[n]` (counting from 0), then the field names, such as `.parameters.cost.range`, `.date` or `.text`. |
| `was` | The old value; `null` when the field was absent. |
| `now` | The new value, as it now stands in the card; `null` when the field was removed. |
| `reason` | Why, in our words (a language map). |
| `source_url` | A source that shows the right value, when there is one. |

Two checks hold every correction to account: the card's field must equal the `now` of its last correction, and undoing the new corrections, newest first, must give back exactly the published entry (§13).

## 10. Reviews, approvals and modules

A **review** is a check of the whole card, shown on it.

| Field | Type | Meaning |
|---|---|---|
| `by` | text, up to 40 characters | Who reviewed it: an editor's handle, or the name of an automated reviewer. |
| `kind` | `automated`, `editor`, `legal` or `external` | What kind of review it is. |
| `on` | date | When. |
| `note` | language map | What was checked or found. |
| `approves` | `true` or `false` | An editor's approval to publish. |
| `batch` | `true` | The approval was given for a batch of cards by a recorded decision, not card by card. |

**Approvals.** A card in `promises/` needs `editorial.approvals` approvals (default 2): reviews with `kind: editor` and `approves: true`, by different editors in the editors list, each made while they were an editor. When `editorial.partyConflict` is on, an editor never approves a card about their own party: the card's actor, or the actor's party. An automated review never approves.

**Modules** add optional data. A card may use a module only when the configuration lists it.

| Module | Where | Data |
|---|---|---|
| `contracts` | `links.contracts` | Public contracts behind delivery: an OCDS id (`ocds-h6vhtk-…`), or `{ ocid, award_id?, notice_url? }`. |
| `decisions` | `links.decisions` | Council decisions that moved the card: `{ decision_id, event, quote, suggested_by?, suggested_on? }`. The card must have an event of type `event`. |
| `lever` | `links.lever` | A scenario in the site's sandbox: a lever id, or `{ id?, settings?, label? }`. |
| `metrics` | `parameters.metric`, `links.measurement` | An indicator target `{ series_id, target, direction: at_least \| at_most \| below, unit, by }`, and whether its data can still be checked: `{ status: open \| delayed \| closed, since?, note? }`. |
| `designations` | sources' `kind` and `designation` | A source that is not `official` records its designation status (`none`, `foreign_agent`, `undesirable`, `extremist` or `unchecked`) and the date it was checked. |
| `wards` | `links.ward` | The ward a local promise is about. |

## 11. Actors

`actors/<id>.yaml`:

```yaml
format: openpromises/1
id: keir-starmer
kind: person
name: { en: Keir Starmer }
party_id: labour
roles:
  - { title: { en: Prime Minister }, from: "2024-07-05", to: "2026-07-20" }
identifiers: { parliament_member_id: 4514 }
same_as: [https://www.gov.uk/government/people/keir-starmer]
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `format` | `openpromises/1` | yes | |
| `id` | lower-case letters, digits and `-` | yes | The file is `<id>.yaml`. |
| `kind` | one of `actors.kinds` | yes | `party` is the kind the party check uses. |
| `name` | language map | yes | |
| `short_name` | language map | no | For tight spaces ("Labour"). |
| `party_id` | actor id | no | A person's party; must be an actor of kind `party`. |
| `roles` | list of `{ title, from?, to? }` | no | Titles as language maps. |
| `standing` | `in_power`, `opposition` or `public_body` | with `standing: manual` | Where the actor stands now. Shown to readers; it never changes a status or a rule, except the `not_in_power` rule below. |
| `seats` | whole number | with `standing: fromSeats`, for parties | Seats the party holds now. A party with more than half of all seats is in power; otherwise every party is out of power. |
| `level` | one of `actors.levels` | no | Such as `federal` or `regional`. A filter, never a different rule. |
| `identifiers` | `{ key: value }` | no | Outside ids, keys from `actors.ids`. One id belongs to one actor. |
| `same_as` | list of URLs | no | Official pages about this actor, checked by an editor. |
| `x` | anything | no | The site's own fields. |

**`not_in_power`** (in the `local` preset). When a site works out standing, a card whose party is out of power must be `not_in_power` or `unscoreable`, and a card whose party is in power cannot be `not_in_power`. The same rule applies to every party.

## 12. Editors

`editors.yaml` (or the file `editorial.editorsFile` names):

```yaml
editors:
  - handle: Sam              # shown on cards: a real name or a pen name, as the editor chooses
    since: "2026-10-01"
    party: null              # declared party membership: an actor id, or null for none
  - handle: Alex
    since: "2026-10-01"
    until: "2027-03-31"      # no longer an editor after this day
    party: riverside-greens
```

A site that has promised its editors to keep their declarations private can keep this file outside its public repository and pass it to the check: `openpromises validate --editors /path/to/editors.yaml`.

## 13. What the rules check

`openpromises validate` runs every rule on every card and draft. Each problem names the file, the field and the rule, in plain words, for example:

```
error  content/promises/uk-bus-cap.yaml  events[1].evidence_url: an "in_plan" event needs an evidence_url  (evidence)
```

| Rule | What it checks |
|---|---|
| `schema` | The file has the fields of format v1, with the right types, and no unknown fields. |
| `vocabulary` | `venue`, `area`, `status`, event types, actor kinds, levels and quality labels are ones the configuration allows. |
| `languages` | Every language map has exactly the configured languages, none empty. |
| `headline` | A published card has a headline in every language, within that language's limits (§2), with no closing full stop. Defaults: English 3–8 words and up to 70 characters; other languages up to 80 characters. |
| `evidence` | Every event that needs evidence (§7) has an `evidence_url`. |
| `first-event` | The first event is `promised`, dated `made_on`, and `promised` appears only once. |
| `event-order` | Events are in date order. Automatic events and `deadline` markers may sit out of order, because jobs append them and deadlines lie ahead. |
| `versions` | Versions are numbered 1, 2, 3…, and there is one `reworded` event for each version after the first. A `deadline_moved` subtype is only on a `reworded` event. |
| `status-event` | The status has a matching event (except `off_ladder` statuses). |
| `scoreable` | The current version has parameters, unless the card is `unscoreable`; an `unscoreable` card has none. |
| `cost` | Every cost with a range has low less than high, the central figure between them, a quality label from `money.qualities` and at least one source; a cost without a range has a note. |
| `corrections` | Each correction names a field that exists, and the field equals the `now` of its last correction. |
| `approvals` | A published card has enough approvals, from listed editors, made while they were editors, none from an editor about their own party; automated reviews never approve. |
| `standing` | The `not_in_power` rule (§11). |
| `quotes` | Every version of a published card has its words confirmed: a stored-source span that matches character for character, an archive check (`quotes.json`) that found them (`exact`, or `close` with `quote_checked_on`), or, when `quotes.require` is `editor`, `quote_checked_on`. A machine check that did not find the words is always an error. With `quotes.archive: required`, every version has an `archived_url`. |
| `references` | The actor, reply actors and parties exist; ids are unique across `promises/` and `drafts/` and match the file names; outside identifiers belong to one actor each. |
| `modules` | Module data is used only when the module is on, and is well formed. |
| `append-only` | Compared with the base branch, a published card's history only grew (below). |

Drafts in `drafts/` pass the same rules except `approvals`; a missing headline or an unconfirmed quote is a warning there, not an error. A stored-source span that does not match is an error in a draft too.

**Append-only.** In a change (a pull request), every card published on the base branch is compared with the card now:

- every entry in `versions`, `events` and `replies` is still there, in the same place, and unchanged, unless corrections appended in this change record exactly what changed: undoing them, newest first, gives back the published entry;
- every entry in `corrections` and `reviews` is unchanged;
- the card was not deleted, renamed or moved back to `drafts/`.

The order of keys in a file never matters, and neither does YAML style. Anything else (headline, status, status note, sources, links, `x`) describes the present and may be edited.

## 14. Format versions and migration

Every file states its format: `format: openpromises/1`. A site moving to OpenPromises names its older format in the configuration (`legacy`), and cards without a `format:` line are converted on read. The append-only check compares converted forms, so moving to a new format never counts as rewriting history.

`openpromises migrate` rewrites old-format cards in format v1, in place. Run it in a change of its own; the check then sees no difference in history.

## 15. JSON Schema

`packages/core/schema/` holds JSON Schema files for a card, an actor, the editors list and the configuration, generated from the same Zod schemas the engine uses, for tools in other languages. They describe the structure; the rules in §13 need the engine.
