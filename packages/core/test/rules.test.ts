import { describe, expect, it } from "vitest";
import { resolveConfig, type QuoteCheck } from "@openpromises/core";
import { BASE, card, check, CONFIG_INPUT, ruleIssues } from "./helpers";

describe("the base card", () => {
  it("passes every rule", () => {
    expect(check(BASE)).toEqual([]);
  });
});

describe("schema", () => {
  it("refuses unknown fields, so a misspelling never passes", () => {
    expect(ruleIssues("schema", { ...BASE, statsu: "funded" })).toEqual(['statsu: "statsu" is not a field of format v1; check the spelling, or put the site\'s own fields in x']);
  });

  it("explains a missing field, a bad date and a bad address in plain words", () => {
    const bad = card((c) => {
      c.made_on = "1 May 2026";
      c.versions[0]!.source_url = "example.org";
    }) as Record<string, unknown>;
    delete bad.actor_id;
    expect(ruleIssues("schema", bad)).toEqual([
      "actor_id: is required",
      'made_on: should be a date written "YYYY-MM-DD"',
      "versions[0].source_url: should be a web address starting http:// or https://",
    ]);
  });

  it("tells a wrong type from a missing field", () => {
    expect(ruleIssues("schema", { ...BASE, made_on: 20260501, area: ["transport"] })).toEqual(['made_on: should be a date written "YYYY-MM-DD"', "area: should be text"]);
  });

  it("needs the format line", () => {
    expect(ruleIssues("schema", { ...BASE, format: undefined })).toEqual(["format: is required"]);
    expect(ruleIssues("schema", { ...BASE, format: "openpromises/0" })[0]).toContain('should be "openpromises/1"');
  });

  it("names an unknown module", () => {
    expect(ruleIssues("schema", card((c) => (c.links = { levers: "x" } as never)))).toEqual(['links.levers: "levers" is not a module; the modules are contracts, decisions, lever, measurement and ward']);
  });

  it("keeps the site's own fields in x", () => {
    expect(check(card((c) => (c.x = { anything: [1, 2] })))).toEqual([]);
  });
});

describe("vocabulary", () => {
  it("passes configured venues, areas, statuses and event types", () => {
    expect(ruleIssues("vocabulary", BASE)).toEqual([]);
  });

  it("fails values the configuration does not allow", () => {
    const c = card((c) => {
      c.venue = "tv";
      c.area = "defence";
      c.status = "budgeted";
      c.events[1]!.type = "approved";
    });
    expect(ruleIssues("vocabulary", c)).toEqual([
      'venue: "tv" is not a venue in the configuration (manifesto, speech)',
      'area: "defence" is not an area in the configuration (health, transport)',
      'status: "budgeted" is not a status on the national ladder (promised, in_plan, legislated, funded, delivering, delivered, failed, quietly_dropped, unscoreable)',
      'events[1].type: "approved" is not an event type: use a status on the national ladder or one of promised, reworded, restated, deadline, deadline_missed, reply',
    ]);
  });

  it("checks area codes against a pattern", () => {
    const codes = resolveConfig({ ...CONFIG_INPUT, areas: { kind: "codes", pattern: "^(0[1-9]|1[0-4])$" } });
    expect(ruleIssues("vocabulary", card((c) => (c.area = "04")), { config: codes })).toEqual([]);
    expect(ruleIssues("vocabulary", card((c) => (c.area = "4")), { config: codes })).toEqual(['area: "4" is not an area code of the form ^(0[1-9]|1[0-4])$']);
  });
});

describe("languages", () => {
  const bilingual = resolveConfig({ ...CONFIG_INPUT, locales: { default: "ru", all: ["ru", "en"] }, headline: { ru: { maxChars: 80 } } });

  it("passes when every text we write has every configured language", () => {
    const c = card((c) => {
      c.headline = { ru: "Ограничить цену проезда", en: "Cap bus fares at £2" };
      c.versions[0]!.lang = "en";
      c.versions[0]!.translations = { ru: "Мы ограничим цену проезда в автобусе 2 фунтами." };
      c.versions[0]!.parameters = { who: { ru: "Пассажиры", en: "Bus passengers" }, cost: { range: [1, 1.2, 1.5], quality: "sourced", sources: [{ title: "Budget", url: "https://example.org/b" }] } };
      for (const e of c.events) e.text = { ru: "Событие", en: "Event" };
    });
    expect(ruleIssues("languages", c, { config: bilingual })).toEqual([]);
  });

  it("fails a missing language, an unknown one, and a translation into the original language", () => {
    const c = card((c) => {
      c.headline = { ru: "Ограничить цену проезда", fr: "Plafonner les tarifs" };
      c.versions[0]!.lang = "en";
      c.versions[0]!.translations = { en: "We will cap fares." };
      c.versions[0]!.parameters!.who = { ru: "Пассажиры", en: "Bus passengers" };
      c.versions[0]!.parameters!.when = { ru: "С 2027 года", en: "From 2027" };
      for (const e of c.events) e.text = { ru: "Событие", en: "Event" };
    });
    expect(ruleIssues("languages", c, { config: bilingual })).toEqual([
      'headline.en: has no "en" text; every text we write has ru, en',
      'headline.fr: "fr" is not one of the configured languages (ru, en)',
      'versions[0].translations.ru: has no "ru" text; every text we write has ru, en',
      "versions[0].translations.en: is the language of the original words; a translation into it is not needed",
    ]);
  });
});

describe("headline", () => {
  it("passes a short neutral summary", () => {
    expect(ruleIssues("headline", BASE)).toEqual([]);
  });

  it("fails one too long, too short or ending in a full stop", () => {
    expect(ruleIssues("headline", card((c) => (c.headline = { en: "Fares." })))).toEqual([
      'headline.en: has 1 word; a headline in "en" has at least 3',
      "headline.en: ends with a full stop; a headline has none",
    ]);
    expect(ruleIssues("headline", card((c) => (c.headline = { en: "Cap every single bus fare in the whole city at two pounds" })))).toEqual([
      'headline.en: has 12 words; a headline in "en" has at most 8',
    ]);
  });

  it("needs a headline to publish, and only warns in a draft", () => {
    const c = card((c) => delete c.headline);
    expect(check(c).filter((i) => i.rule === "headline").map((i) => i.severity)).toEqual(["error"]);
    expect(check(c, { where: "drafts" }).filter((i) => i.rule === "headline").map((i) => i.severity)).toEqual(["warning"]);
  });

  it("uses each language's own limits", () => {
    const ru = resolveConfig({ ...CONFIG_INPUT, locales: { default: "ru", all: ["ru"] } });
    const c = card((c) => {
      c.headline = { ru: "Проиндексировать пенсии" };
      c.versions[0]!.parameters!.who = { ru: "Пенсионеры" };
      c.versions[0]!.parameters!.when = { ru: "С 2027 года" };
      for (const e of c.events) e.text = { ru: "Событие" };
    });
    expect(check(c, { config: ru })).toEqual([]);
  });
});

describe("first-event", () => {
  it('passes when the first event is "promised", on made_on', () => {
    expect(ruleIssues("first-event", BASE)).toEqual([]);
  });

  it("fails another first event, another date, and a second promise", () => {
    expect(ruleIssues("first-event", card((c) => c.events.reverse()))).toContain('events[0].type: the first event is the promise itself ("promised"), not "in_plan"');
    expect(ruleIssues("first-event", card((c) => (c.events[0]!.date = "2026-04-30")))).toEqual([
      "events[0].date: the promise was made on 2026-05-01 (made_on), but its event is dated 2026-04-30",
    ]);
    expect(ruleIssues("first-event", card((c) => c.events.push({ date: "2026-07-01", type: "promised", text: { en: "Again" } })))[0]).toContain('"restated" event');
  });
});

describe("event-order", () => {
  it("passes events in date order, and lets automatic events and deadline markers sit anywhere", () => {
    const c = card((c) => {
      c.events.push({ date: "2027-01-01", type: "deadline", text: { en: "Due" } });
      c.events.push({ date: "2026-08-01", type: "funded", text: { en: "Funded" }, evidence_url: "https://example.org/f" });
      c.events.push({ date: "2026-07-01", type: "deadline_missed", text: { en: "Missed" }, auto: true });
    });
    expect(ruleIssues("event-order", c)).toEqual([]);
  });

  it("fails an event dated before the one it follows", () => {
    const c = card((c) => c.events.push({ date: "2026-05-15", type: "funded", text: { en: "Funded" }, evidence_url: "https://example.org/f" }));
    expect(ruleIssues("event-order", c)).toEqual(["events[2].date: events are in date order, but 2026-05-15 comes after 2026-06-01"]);
  });
});

describe("evidence", () => {
  it("passes when every status change links to its evidence", () => {
    expect(ruleIssues("evidence", BASE)).toEqual([]);
  });

  it("fails a status change, a rewording or a reply without evidence", () => {
    const c = card((c) => {
      delete c.events[1]!.evidence_url;
      c.events.push({ date: "2026-07-01", type: "reply", text: { en: "Replied" } });
    });
    expect(ruleIssues("evidence", c)).toEqual([
      'events[1].evidence_url: a "in_plan" event needs an evidence_url: the document that shows it happened',
      'events[2].evidence_url: a "reply" event needs an evidence_url: the document that shows it happened',
    ]);
  });

  it("needs no evidence for the promise, deadlines or statuses off the ladder", () => {
    const c = card((c) => c.events.push({ date: "2026-07-01", type: "unscoreable", text: { en: "Too vague" } }));
    expect(ruleIssues("evidence", c)).toEqual([]);
  });
});

describe("versions", () => {
  const reworded = card((c) => {
    c.versions.push({ ...structuredClone(c.versions[0]!), version: 2, text: "We will cap bus fares at £2.50 for every journey in the city.", recorded_on: "2026-09-01" });
    c.events.push({ date: "2026-09-01", type: "reworded", text: { en: "Reworded: £2.50" }, evidence_url: "https://example.org/r", subtype: "deadline_moved" });
  });

  it('passes versions numbered in order, with one "reworded" event each', () => {
    expect(ruleIssues("versions", reworded)).toEqual([]);
  });

  it("fails a gap in the numbers, a missing reworded event, and a subtype on another event", () => {
    const c = card((c) => {
      c.versions.push({ ...structuredClone(c.versions[0]!), version: 3 });
      c.events[1]!.subtype = "deadline_moved";
    });
    expect(ruleIssues("versions", c)).toEqual([
      "versions[1].version: versions are numbered 1, 2, 3… in order; this one should be 2",
      'events: 1 later version needs as many "reworded" events, but there are 0',
      'events[1].subtype: only a "reworded" event moves a deadline',
    ]);
  });
});

describe("status-event", () => {
  it("passes when the status has its event", () => {
    expect(ruleIssues("status-event", BASE)).toEqual([]);
  });

  it("fails a status with no event to show it", () => {
    expect(ruleIssues("status-event", card((c) => (c.status = "funded")))).toEqual(['status: the status is "funded", but no "funded" event shows when and on what evidence']);
  });

  it("needs no event for a status off the ladder", () => {
    expect(ruleIssues("status-event", card((c) => ((c.status = "unscoreable"), (c.versions[0]!.parameters = null))))).toEqual([]);
  });
});

describe("scoreable", () => {
  it("passes parameters on a scoreable card, and none on an unscoreable one", () => {
    expect(ruleIssues("scoreable", BASE)).toEqual([]);
    expect(ruleIssues("scoreable", card((c) => ((c.status = "unscoreable"), (c.versions[0]!.parameters = null))))).toEqual([]);
  });

  it("fails the other two combinations", () => {
    expect(ruleIssues("scoreable", card((c) => (c.versions[0]!.parameters = null)))).toEqual(['versions[0].parameters: are needed unless the card is "unscoreable"']);
    expect(ruleIssues("scoreable", card((c) => (c.status = "unscoreable")))).toEqual(["status: an \"unscoreable\" card has no parameters: set its current version's parameters to null"]);
  });
});

describe("cost", () => {
  it("passes a range with a quality label and a source, and a note when there is no figure", () => {
    expect(ruleIssues("cost", BASE)).toEqual([]);
    expect(ruleIssues("cost", card((c) => (c.versions[0]!.parameters!.cost = { note: { en: "No costing was published." } })))).toEqual([]);
  });

  it("fails a single figure (decision 7)", () => {
    const c = card((c) => (c.versions[0]!.parameters!.cost!.range = [8, 8, 8]));
    expect(ruleIssues("cost", c)).toEqual([
      "versions[0].parameters.cost.range: is a single figure (8); a cost is a low–high range. If the source gives one figure, add a stated editorial margin (for example ±10%) and say so in the note",
    ]);
  });

  it("fails a range out of order, a missing or unknown quality, missing sources, and a figureless cost with no note", () => {
    const c = card((c) => {
      c.versions[0]!.parameters!.cost = { range: [2, 1, 3] };
      c.versions[0]!.parameters!.capital_cost = { range: [10, 12, 15], quality: "guess", sources: [{ title: "x", url: "https://example.org/x" }] };
    });
    expect(ruleIssues("cost", c)).toEqual([
      "versions[0].parameters.cost.range: is not in order: [low, central, high] needs low ≤ central ≤ high, and it has [2, 1, 3]",
      "versions[0].parameters.cost.quality: is missing: a cost carries a quality label (sourced, approx, modelled)",
      "versions[0].parameters.cost.sources: are missing: a cost names at least one source",
      'versions[0].parameters.capital_cost.quality: "guess" is not a quality label in the configuration (sourced, approx, modelled)',
    ]);
    expect(ruleIssues("cost", card((c) => (c.versions[0]!.parameters!.cost = {})))).toEqual(["versions[0].parameters.cost: has no range, so its note says why there is no figure"]);
  });
});

describe("corrections", () => {
  const corrected = card((c) => {
    c.events[1]!.date = "2026-06-02";
    c.corrections = [{ date: "2026-10-01", path: "events[1].date", was: "2026-06-01", now: "2026-06-02", reason: { en: "The plan was published a day later." } }];
  });

  it("passes when the field equals the last correction's now", () => {
    expect(ruleIssues("corrections", corrected)).toEqual([]);
  });

  it("fails a correction the card does not match, and a path that does not exist", () => {
    const c = card((c) => {
      c.corrections = [
        { date: "2026-10-01", path: "events[1].date", was: "2026-06-01", now: "2026-06-02", reason: { en: "Wrong day." } },
        { date: "2026-10-01", path: "events[7].text", was: null, now: { en: "x" }, reason: { en: "Typo." } },
      ];
    });
    expect(ruleIssues("corrections", c)).toEqual([
      'corrections[0].now: the card\'s events[1].date does not match this correction\'s "now" value',
      "corrections[1].path: events[7].text does not exist in this card",
    ]);
  });

  it("compares values whatever their key order", () => {
    const c = card((c) => {
      c.versions[0]!.parameters!.cost!.sources = [{ url: "https://example.org/budget2", title: "Budget" }];
      c.corrections = [{ date: "2026-10-01", path: "versions[0].parameters.cost.sources", was: [], now: [{ title: "Budget", url: "https://example.org/budget2" }], reason: { en: "Link fixed." } }];
    });
    expect(ruleIssues("corrections", c)).toEqual([]);
  });
});

describe("approvals", () => {
  it("passes two listed editors' approvals", () => {
    expect(ruleIssues("approvals", BASE)).toEqual([]);
  });

  it("fails a published card with too few approvals, and lets a draft wait", () => {
    const one = card((c) => c.reviews!.pop());
    expect(ruleIssues("approvals", one)).toEqual(["reviews: a published card needs 2 editors' approvals; it has 1. Keep it in drafts/ until editors approve it (openpromises review)"]);
    expect(ruleIssues("approvals", one, { where: "drafts" })).toEqual([]);
  });

  it("never counts an editor approving a card about their own party", () => {
    const c = card((c) => (c.reviews![1] = { by: "Kim", kind: "editor", on: "2026-05-04", approves: true }));
    expect(ruleIssues("approvals", c)).toEqual([
      "reviews[1].by: Kim may not approve a card about their own party (green-party); another editor does",
      "reviews: a published card needs 2 editors' approvals; it has 1. Keep it in drafts/ until editors approve it (openpromises review)",
    ]);
  });

  it("refuses machine approvals, unlisted editors, approvals outside an editor's term, and approving twice", () => {
    const c = card((c) => {
      c.reviews = [
        { by: "AI Journalist", kind: "automated", on: "2026-05-02", approves: true },
        { by: "Lawyer", kind: "legal", on: "2026-05-02", approves: true },
        { by: "Robin", kind: "editor", on: "2026-05-02", approves: true },
        { by: "Sam", kind: "editor", on: "2025-12-31", approves: true },
        { by: "Alex", kind: "editor", on: "2026-05-03", approves: true },
        { by: "Alex", kind: "editor", on: "2026-05-04", approves: true },
      ];
    });
    expect(ruleIssues("approvals", c)).toEqual([
      "reviews[0].approves: machines suggest, people decide: an automated review never approves a card",
      'reviews[1].kind: only an editor approves a card; a "legal" review records a check (list the reviewer as an editor to let them approve)',
      'reviews[2].by: "Robin" is not in the editors list',
      "reviews[3].on: Sam was not an editor on 2025-12-31 (an editor from 2026-01-01)",
      "reviews[5].by: Alex has already approved this card; a second approval must come from a different editor",
      "reviews: a published card needs 2 editors' approvals; it has 1. Keep it in drafts/ until editors approve it (openpromises review)",
    ]);
  });

  it("needs an editors list to publish", () => {
    expect(ruleIssues("approvals", BASE, { editors: null })[0]).toBe("reviews[0].by: there is no editors list, so this approval cannot be checked");
  });
});

describe("standing", () => {
  const local = resolveConfig({ ...CONFIG_INPUT, ladder: "local", actors: { kinds: ["person", "party"], standing: "fromSeats" } });
  const seats = (blue: number, green: number) =>
    new Map([
      ["blue-party", { format: "openpromises/1" as const, id: "blue-party", kind: "party", name: { en: "Blue" }, seats: blue }],
      ["green-party", { format: "openpromises/1" as const, id: "green-party", kind: "party", name: { en: "Green" }, seats: green }],
      ["ada-lovelace", { format: "openpromises/1" as const, id: "ada-lovelace", kind: "person", name: { en: "Ada" }, party_id: "green-party" }],
    ]);
  const notInPower = card((c) => ((c.status = "not_in_power"), (c.events = [c.events[0]!])));

  it("passes a pledge out of power marked not_in_power, and one in power on the ladder", () => {
    expect(ruleIssues("standing", notInPower, { config: local, actors: seats(30, 20) })).toEqual([]);
    expect(ruleIssues("standing", BASE, { config: local, actors: seats(20, 30) })).toEqual([]);
  });

  it("fails the other way round, with the same rule for every party", () => {
    expect(ruleIssues("standing", BASE, { config: local, actors: seats(30, 20) })).toEqual(['status: the party is out of power, so its pledge is "not_in_power" (or "unscoreable"), not "in_plan"']);
    expect(ruleIssues("standing", notInPower, { config: local, actors: seats(20, 30) })).toEqual(['status: the party is in power, so its pledge cannot be "not_in_power"']);
  });

  it("treats no overall control as everyone out of power", () => {
    expect(ruleIssues("standing", BASE, { config: local, actors: seats(25, 25) })).toHaveLength(1);
  });
});

describe("quotes", () => {
  const stored = "Speech. We will cap bus fares at £2 for every journey in the city. Thank you.";
  const spanned = card((c) => {
    delete c.versions[0]!.quote_checked_on;
    c.versions[0]!.source_text = { file: "speech.txt", span: [8, 66] };
  });

  it("passes an editor's confirmation, a stored span, or an exact archive check", () => {
    expect(ruleIssues("quotes", BASE)).toEqual([]);
    expect(ruleIssues("quotes", spanned, { sourceText: () => stored })).toEqual([]);
    const exact: QuoteCheck = { match: "exact", url: "https://web.archive.org/x" };
    expect(ruleIssues("quotes", card((c) => delete c.versions[0]!.quote_checked_on), { quoteCheck: () => exact })).toEqual([]);
  });

  it("fails an unconfirmed quote in a published card, and warns in a draft", () => {
    const c = card((c) => delete c.versions[0]!.quote_checked_on);
    expect(check(c).filter((i) => i.rule === "quotes").map((i) => i.severity)).toEqual(["error"]);
    expect(check(c, { where: "drafts" }).filter((i) => i.rule === "quotes").map((i) => i.severity)).toEqual(["warning"]);
  });

  it("fails a span that is not the quote, even in a draft", () => {
    const issues = check(spanned, { where: "drafts", sourceText: () => stored.replace("£2", "£3") }).filter((i) => i.rule === "quotes");
    expect(issues.map((i) => i.severity)).toEqual(["error"]);
    expect(issues[0]!.message).toContain("first difference at character 26");
  });

  it("fails a missing stored source", () => {
    expect(ruleIssues("quotes", spanned, { sourceText: () => undefined })).toEqual(["versions[0].source_text.file: sources/speech.txt is missing, so the quote cannot be checked"]);
  });

  it("always fails an archive check that did not find the words, even with an editor's date", () => {
    const none: QuoteCheck = { match: "none", url: "https://web.archive.org/x", checked_on: "2026-10-01" };
    expect(ruleIssues("quotes", BASE, { quoteCheck: () => none })).toEqual(["versions[0].text: the words were not found in the archived copy https://web.archive.org/x (checked on 2026-10-01)"]);
  });

  it("needs an editor's eye on a close match", () => {
    const close: QuoteCheck = { match: "close", url: "https://web.archive.org/scan" };
    expect(ruleIssues("quotes", BASE, { quoteCheck: () => close })).toEqual([]);
    expect(ruleIssues("quotes", card((c) => delete c.versions[0]!.quote_checked_on), { quoteCheck: () => close })[0]).toContain("only nearly match");
  });

  it("needs a machine check when the site says so, and an archive copy when required", () => {
    const strict = resolveConfig({ ...CONFIG_INPUT, quotes: { require: "match", archive: "required" } });
    expect(ruleIssues("quotes", BASE, { config: strict })).toEqual([
      "versions[0].archived_url: is missing: every version needs an archived copy of its source",
      "versions[0].text: has not been checked against its archived or stored source: add a stored-source span or an archive check (openpromises check-quote)",
    ]);
  });
});

describe("modules", () => {
  it("passes module data when the module is on", () => {
    const c = card((c) => {
      c.links = { contracts: ["ocds-h6vhtk-0525b3"], lever: { settings: { bus_cap: 1 }, label: { en: "£2 cap" } }, ward: "riverside", decisions: [{ decision_id: "mg-1", event: "in_plan", quote: "To approve the cap" }] };
    });
    expect(ruleIssues("modules", c)).toEqual([]);
  });

  it("fails module data when the module is off", () => {
    const off = resolveConfig({ ...CONFIG_INPUT, modules: [] });
    const c = card((c) => {
      c.links = { lever: "bus_cap" };
      c.sources = [{ title: "Agency report", url: "https://example.org/a", kind: "media" }];
    });
    expect(ruleIssues("modules", c, { config: off })).toEqual([
      'links.lever: uses the "lever" module, which the configuration does not turn on (modules)',
      'sources[0]: uses the "designations" module, which the configuration does not turn on (modules)',
    ]);
  });

  it("fails a duplicate contract, a decision without its event, and a measurement without a metric", () => {
    const c = card((c) => {
      c.links = {
        contracts: ["ocds-h6vhtk-0525b3", { ocid: "ocds-h6vhtk-0525b3" }],
        decisions: [{ decision_id: "mg-2", event: "delivering", quote: "Works start" }],
        measurement: { status: "closed", since: "2025-01-01" },
      };
    });
    expect(ruleIssues("modules", c)).toEqual([
      "links.measurement: belongs to a card with an indicator target (parameters.metric)",
      'links.contracts[1]: contract "ocds-h6vhtk-0525b3" is listed twice',
      'links.decisions[0].event: the card has no "delivering" event for this decision',
    ]);
  });

  it("needs a designation for sources that are not official, with the date checked", () => {
    const designations = resolveConfig({ ...CONFIG_INPUT, modules: ["designations"] });
    const c = card((c) => {
      c.versions[0]!.parameters!.cost!.sources![0]!.kind = "official";
      c.sources = [
        { title: "Ministry", url: "https://example.org/m", kind: "official" },
        { title: "Outlet", url: "https://example.org/o", kind: "media" },
        { title: "Blog", url: "https://example.org/b", kind: "independent", designation: { status: "none" } },
        { title: "Paper", url: "https://example.org/p", kind: "media", designation: { status: "unchecked" } },
      ];
    });
    expect(check(c, { config: designations }).filter((i) => i.rule === "modules").map((i) => `${i.severity} ${i.path.join(".")}`)).toEqual([
      "error sources.1.designation",
      "error sources.2.designation.checked_on",
      "warning sources.3.designation.status",
    ]);
  });
});

describe("references", () => {
  it("passes when the actor exists", () => {
    expect(ruleIssues("references", BASE)).toEqual([]);
  });

  it("fails an unknown actor or reply actor", () => {
    const c = card((c) => {
      c.actor_id = "nobody";
      c.replies = [{ from_actor_id: "someone", date: "2026-07-01", text: "We disagree." }];
    });
    expect(ruleIssues("references", c)).toEqual(['actor_id: there is no actor "nobody" (actors/nobody.yaml)', 'replies[0].from_actor_id: there is no actor "someone"']);
  });
});

describe("x", () => {
  it("checks the site's own fields with the site's own schema", async () => {
    const { z } = await import("zod");
    const withX = resolveConfig({ ...CONFIG_INPUT, x: { card: z.strictObject({ editor_note: z.string().optional() }) } });
    expect(ruleIssues("x", card((c) => (c.x = { editor_note: "fine" })), { config: withX })).toEqual([]);
    expect(ruleIssues("x", card((c) => (c.x = { editor_nots: "typo" })), { config: withX })).toEqual([
      'x.editor_nots: "editor_nots" is not a field of format v1; check the spelling, or put the site\'s own fields in x',
    ]);
  });
});
