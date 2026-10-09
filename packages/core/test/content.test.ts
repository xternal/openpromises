import { describe, expect, it } from "vitest";
import { contentStats, lintCard, lintText, lexicon, missedDeadline, resolveConfig, todayIn, validateContent, type ContentInput } from "@openpromises/core";
import { ACTORS, BASE, card, config, CONFIG_INPUT, EDITORS } from "./helpers";

describe("deadlines", () => {
  it("appends deadline_missed to an open card whose deadline has passed", () => {
    expect(missedDeadline(BASE, config, "2027-01-02")).toEqual({
      date: "2027-01-02",
      type: "deadline_missed",
      text: { en: "The deadline passed with no evidence of delivery recorded. An editor confirms or corrects this within 30 days." },
      auto: true,
    });
  });

  it("appends nothing on the deadline itself, to a finished card, or twice", () => {
    expect(missedDeadline(BASE, config, "2027-01-01")).toBeNull();
    expect(missedDeadline(card((c) => (c.status = "delivered")), config, "2027-06-01")).toBeNull();
    const missed = card((c) => c.events.push(missedDeadline(c, config, "2027-01-02")!));
    expect(missedDeadline(missed, config, "2027-02-01")).toBeNull();
  });

  it("starts again when a new version moves the deadline", () => {
    const moved = card((c) => {
      c.events.push(missedDeadline(c, config, "2027-01-02")!);
      c.versions.push({ ...structuredClone(c.versions[0]!), version: 2, parameters: { ...c.versions[0]!.parameters!, deadline: "2027-06-30" } });
    });
    expect(missedDeadline(moved, config, "2027-03-01")).toBeNull();
    expect(missedDeadline(moved, config, "2027-07-01")?.date).toBe("2027-07-01");
  });

  it("writes the event in every configured language", () => {
    const both = resolveConfig({ ...CONFIG_INPUT, locales: { default: "ru", all: ["ru", "en"] } });
    expect(Object.keys(missedDeadline(BASE, both, "2027-01-02")!.text)).toEqual(["ru", "en"]);
  });

  it("takes today in the site's time zone", () => {
    const late = new Date("2026-10-25T23:30:00Z");
    expect(todayIn("UTC", late)).toBe("2026-10-25");
    expect(todayIn("Europe/Moscow", late)).toBe("2026-10-26");
  });
});

describe("lint", () => {
  const en = lexicon(config, "en");
  const ru = lexicon(config, "ru");

  it("finds judgement words in our text, in English and Russian", () => {
    expect(lintText("The government betrayed voters with this sham", en)).toEqual(["betrayed", "sham"]);
    expect(lintText("Это провальная и лживая программа", ru)).toEqual(["провальная", "лживая"]);
  });

  it("skips quoted words and neutral phrases", () => {
    expect(lintText('The minister called it "a disgrace" and changed the tax regime', en)).toEqual([]);
    expect(lintText("Депутат назвал это «позором»; налоговый режим не изменился, преступность снизилась", ru)).toEqual([]);
  });

  it("matches whole words only", () => {
    expect(lintText("The scheme was delivered; the earlier plan was relied on", en)).toEqual([]);
  });

  it("lints a card's own text, never the quote or what was stated as funding", () => {
    const c = card((c) => {
      c.versions[0]!.text = "This is a sham and a disgrace, we will fix it.";
      c.versions[0]!.parameters!.funded_by = { en: "Ending the shameful waste" };
      c.status_note = { en: "A broken promise so far." };
    });
    expect(lintCard(c, config).map((i) => `${i.path.join(".")}: ${i.message.split(";")[0]}`)).toEqual(['status_note.en: "broken promise" passes judgement']);
  });

  it("takes extra words and allowed phrases from the configuration", () => {
    const own = resolveConfig({ ...CONFIG_INPUT, lint: { words: { en: ["flop*"] }, allow: { en: ["shame* campaign"] } } });
    expect(lintText("A flopped scheme; the shame campaign ran", lexicon(own, "en"))).toEqual(["flopped"]);
  });
});

const actorFiles = ACTORS.map((a) => ({ file: `actors/${a.id}.yaml`, data: a }));
const content = (over: Partial<ContentInput> = {}): ContentInput => ({
  config,
  cards: [{ file: "promises/test-bus-fares.yaml", where: "promises", data: BASE }],
  actors: actorFiles,
  editors: { file: "editors.yaml", data: { editors: EDITORS } },
  ...over,
});
const found = (input: ContentInput) => validateContent(input).issues.map((i) => `${i.file} ${i.path.join(".")}: ${i.message}`);

describe("a content folder", () => {
  it("passes valid cards, actors and editors", () => {
    expect(found(content())).toEqual([]);
  });

  it("fails a file named after another id, and an id used twice across promises and drafts", () => {
    expect(
      found(
        content({
          cards: [
            { file: "promises/bus.yaml", where: "promises", data: BASE },
            { file: "drafts/test-bus-fares.yaml", where: "drafts", data: BASE },
          ],
        }),
      ),
    ).toEqual(['promises/bus.yaml id: is "test-bus-fares", but the file is named bus.yaml', 'drafts/test-bus-fares.yaml id: "test-bus-fares" is also promises/bus.yaml; cards and drafts share one set of ids']);
  });

  it("checks actors against the configuration and each other", () => {
    const bad = [
      ...actorFiles.slice(0, 2),
      { file: "actors/ada-lovelace.yaml", data: { ...ACTORS[2], kind: "region", party_id: "ada-lovelace", seats: 3, level: "federal", identifiers: { member_id: 1 } } },
      { file: "actors/bob.yaml", data: { format: "openpromises/1", id: "bob", kind: "person", name: { en: "Bob" }, party_id: "nobody" } },
    ];
    expect(found(content({ actors: bad }))).toEqual([
      'actors/ada-lovelace.yaml kind: "region" is not an actor kind in the configuration (person, party, government)',
      "actors/ada-lovelace.yaml seats: only counts when the configuration works standing out from seats (actors.standing: fromSeats)",
      "actors/ada-lovelace.yaml seats: belong to a party, not to a person or other actor",
      "actors/ada-lovelace.yaml level: is not used on this site (actors.levels is not set)",
      'actors/ada-lovelace.yaml identifiers.member_id: "member_id" is not an identifier in the configuration (actors.ids)',
      'actors/ada-lovelace.yaml party_id: "ada-lovelace" is a region, not a party',
      'actors/bob.yaml party_id: there is no actor "nobody"',
    ]);
  });

  it("gives one outside id to one actor only", () => {
    const withIds = resolveConfig({ ...CONFIG_INPUT, actors: { ...CONFIG_INPUT.actors, ids: { member_id: "Parliament member" } } });
    const twice = [...actorFiles.slice(0, 2), ...[ACTORS[2]!, { ...ACTORS[2]!, id: "ada-two" }].map((a) => ({ file: `actors/${a.id}.yaml`, data: { ...a, identifiers: { member_id: 7 } } }))];
    expect(found(content({ config: withIds, actors: twice }))).toEqual(['actors/ada-two.yaml identifiers.member_id: member_id 7 already belongs to "ada-lovelace"; one id, one actor']);
  });

  it("checks the editors list", () => {
    const editors = { file: "editors.yaml", data: { editors: [...EDITORS, { handle: "Sam", since: "2026-01-01", party: "red-party" }] } };
    expect(found(content({ editors }))).toEqual(['editors.yaml editors.3.handle: "Sam" is listed twice', 'editors.yaml editors.3.party: is not a party among the actors']);
  });
});

describe("stats", () => {
  it("counts published cards by status and category, and drafts by approval", () => {
    const r = validateContent(
      content({
        cards: [
          { file: "promises/test-bus-fares.yaml", where: "promises", data: BASE },
          { file: "drafts/draft-one.yaml", where: "drafts", data: card((c) => ((c.id = "draft-one"), (c.reviews = []))) },
        ],
      }),
    );
    const s = contentStats(r.cards, config, r.actors, r.editors);
    expect(s).toMatchObject({ published: 1, drafts: 1, byStatus: { in_plan: 1 }, byCategory: { progress: 1 }, draftsWaiting: 1, draftsApproved: 0 });
  });
});
