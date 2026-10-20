import { describe, expect, it } from "vitest";
import { actorTimeline, daysBetween, keyPromises, lastChange, lastChanged, promisesByMonth, spotlight, type ActorTimeline, type CardView } from "@openpromises/publish";
import { site } from "./helpers";

// Decision 34: what an actor's page needs, built only from the published cards, the same for every actor.

/** Another actor, with nothing else changed: every rule must give the same answer. */
const swapped = (views: readonly CardView[]) => views.map((v) => ({ ...v, party: null, actor: { ...v.actor, id: `x-${v.actor.id}`, party_id: undefined } }));
/** A timeline with card ids in place of views, to compare two. */
const shape = (t: ActorTimeline) =>
  [...t.toCome, ...t.past].map((d) => [d.date, d.entries.map((e) => [e.label, e.types, e.cards.map((c) => [c.view.id, c.texts])])]).concat([t.undated.map((v) => v.id)]);

describe("daysBetween", () => {
  it("counts whole days, across a clock change and a leap day", () => {
    expect(daysBetween("2026-10-20", "2026-12-24")).toBe(65);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-10-20", "2026-10-20")).toBe(0);
    expect(daysBetween("2026-10-20", "2026-10-01")).toBe(-19);
  });
});

describe("actorTimeline", async () => {
  const s = await site("public-ledger");
  const today = s.today;
  const burnham = s.views.filter((v) => v.actor.id === "andy-burnham");
  const t = actorTimeline(burnham, s.config, today);
  const entries = (days: ActorTimeline["past"]) => days.flatMap((d) => d.entries.map((e) => ({ date: d.date, ...e })));

  it("puts the deadlines still to come above today, latest first, and what happened below it, newest first", () => {
    const ahead = t.toCome.map((d) => d.date);
    const past = t.past.map((d) => d.date);
    expect(ahead).toEqual([...ahead].sort().reverse());
    expect(past).toEqual([...past].sort().reverse());
    expect(ahead.every((d) => d >= today)).toBe(true);
    expect(past.every((d) => d <= today)).toBe(true);
    expect(entries(t.toCome).every((e) => e.types.join() === "deadline")).toBe(true);
    expect(t.toCome.map((d) => d.days)).toEqual(ahead.map((d) => daysBetween(today, d)));
  });

  it("gives every open promise's deadline still to come, with the marker's words, and links each to its card", () => {
    const open = burnham.filter((v) => ["promised", "in_plan"].includes(v.card.status) && v.current.parameters?.deadline);
    const due = entries(t.toCome).flatMap((e) => e.cards.map((c) => [e.date, c.view.id]));
    expect(due.sort()).toEqual(open.map((v) => [v.current.parameters!.deadline!, v.id]).sort());
    const bus = entries(t.toCome).find((e) => e.cards.some((c) => c.view.id === "uk-bus-cap-2-2026"))!;
    expect(bus).toMatchObject({ date: "2027-01-01", label: "Deadline" });
    expect(bus.cards[0]!.texts).toEqual(["Due to start"]);
  });

  it("shows a passed deadline as its outcome, never as a deadline", () => {
    // The energy-bill VAT cut was due on 1 October 2026 and was delivered that day.
    const vat = entries(t.past).filter((e) => e.cards.some((c) => c.view.id === "uk-electricity-vat-2026"));
    expect(vat.map((e) => [e.date, e.label])).toEqual([
      ["2026-10-01", "Delivered"],
      ["2026-09-07", "Legislated"],
      ["2026-07-21", "Promised, No 10 press release"],
    ]);
    // An open promise whose deadline passed with nothing recorded says so on the day; once the deadline job records it, that event stands instead.
    const later = actorTimeline(burnham, s.config, "2027-02-01");
    const missed = entries(later.past).find((e) => e.cards.some((c) => c.view.id === "uk-bus-cap-2-2026") && e.date === "2027-01-01")!;
    expect(missed).toMatchObject({ label: "Deadline passed", types: ["deadline_missed"] });
    expect(entries(later.toCome).some((e) => e.cards.some((c) => c.view.id === "uk-bus-cap-2-2026"))).toBe(false);
    const recorded = burnham.map((v) => (v.id === "uk-bus-cap-2-2026" ? { ...v, card: { ...v.card, events: [...v.card.events, { date: "2027-01-02", type: "deadline_missed", text: { en: "The deadline passed with no evidence of delivery" }, auto: true }] } } : v));
    const job = entries(actorTimeline(recorded, s.config, "2027-02-01").past).filter((e) => e.cards.some((c) => c.view.id === "uk-bus-cap-2-2026") && e.types.includes("deadline_missed"));
    expect(job.map((e) => [e.date, e.cards[0]!.texts])).toEqual([["2027-01-02", ["The deadline passed with no evidence of delivery"]]]);
  });

  it("tells each card's day once, words first, and groups the cards that share it, by headline", () => {
    const bus = entries(t.past).find((e) => e.cards.some((c) => c.view.id === "uk-bus-cap-2-2026"))!;
    expect(bus).toMatchObject({ date: "2026-07-22", label: "Promised and in plan", types: ["promised", "in_plan"] });
    expect(bus.cards[0]!.links).toEqual(["https://www.gov.uk/government/speeches/2-bus-fares-from-january-2027"]);
    const pass = burnham.find((v) => v.id === "uk-disabled-bus-pass-2026")!;
    const twin = { ...pass, id: "uk-twin", card: { ...pass.card, id: "uk-twin", headline: { en: "A second promise that day" } } };
    const day = actorTimeline([pass, twin], s.config, today).past.find((d) => d.date === "2026-08-18")!;
    expect(day.entries.map((e) => [e.label, e.cards.map((c) => c.view.id)])).toEqual([["Promised, No 10, DfT and DWP press release", ["uk-twin", "uk-disabled-bus-pass-2026"]]]);
  });

  it("lists every published promise once as made, and each event, but no draft", () => {
    const made = entries(t.past).filter((e) => e.types[0] === "promised").flatMap((e) => e.cards.map((c) => c.view.id));
    expect(made.sort()).toEqual(burnham.filter((v) => v.where === "promises").map((v) => v.id).sort());
    const drafts = burnham.map((v) => ({ ...v, where: "drafts" as const }));
    expect(actorTimeline(drafts, s.config, today)).toEqual({ today, toCome: [], past: [], undated: [] });
  });

  it("lists open promises with no deadline apart, newest first, and never above today", () => {
    const all = actorTimeline(s.views, s.config, today);
    const undated = s.views.filter((v) => v.where === "promises" && ["open", "progress"].includes(s.config.ladder.statuses.find((x) => x.id === v.card.status)!.category) && !v.current.parameters?.deadline);
    expect(all.undated.map((v) => v.id).sort()).toEqual(undated.map((v) => v.id).sort());
    expect(all.undated.map((v) => v.card.made_on)).toEqual(all.undated.map((v) => v.card.made_on).sort().reverse());
    const ahead = new Set(entries(all.toCome).flatMap((e) => e.cards.map((c) => c.view.id)));
    expect(all.undated.some((v) => ahead.has(v.id))).toBe(false);
    // A finished promise is neither undated nor still to come.
    expect([...ahead, ...all.undated.map((v) => v.id)].some((id) => ["delivered", "failed", "quietly_dropped"].includes(s.views.find((v) => v.id === id)!.card.status))).toBe(false);
  });

  it("follows the same rule whoever made the promises", () => {
    expect(shape(actorTimeline(swapped(s.views), s.config, today))).toEqual(shape(actorTimeline(s.views, s.config, today)));
  });

  it("says it in the reader's language, a moved deadline and a restatement included", async () => {
    const b = await site("synthetic-bilingual");
    const ru = actorTimeline(b.views, b.config, b.today);
    const labels = entries(ru.past).map((e) => [e.date, e.label]);
    expect(labels).toContainEqual(["2026-03-01", "Срок перенесён"]);
    expect(labels).toContainEqual(["2026-09-01", "Повторено"]);
    expect(entries(ru.past).some((e) => e.label.startsWith("Обещано: "))).toBe(true);
    const en = actorTimeline(b.views, b.config, b.today, "en");
    expect(entries(en.past).map((e) => [e.date, e.label])).toContainEqual(["2026-03-01", "Deadline moved"]);
  });
});

describe("keyPromises", async () => {
  const s = await site("public-ledger");
  const today = s.today;
  const actors = [...new Set(s.views.map((v) => v.actor.id))];

  it("chooses an actor's cards by the home page's rule, with the days left and what changed last", () => {
    for (const id of actors) {
      const mine = s.views.filter((v) => v.actor.id === id);
      const k = keyPromises(mine, s.config, today);
      const rule = spotlight(mine, s.config, today);
      expect(k.due.map((d) => d.view.id), id).toEqual(rule.due.map((v) => v.id));
      expect(k.recent.map((r) => r.view.id), id).toEqual(rule.recent.map((v) => v.id));
      for (const d of k.due) expect(d.days).toBe(daysBetween(today, d.deadline));
      for (const d of k.due) expect(d.days).toBeGreaterThanOrEqual(0);
      for (const r of k.recent) expect(r.change?.date).toBe(lastChanged(r.view, today));
    }
    const burnham = keyPromises(s.views.filter((v) => v.actor.id === "andy-burnham"), s.config, "2026-10-20", { recent: 1 });
    expect(burnham.due[0]).toMatchObject({ deadline: "2026-12-24", days: 65 });
  });

  it("follows the same rule whoever made the promises", () => {
    const ids = (k: ReturnType<typeof keyPromises>) => [k.due.map((d) => [d.view.id, d.days]), k.recent.map((r) => [r.view.id, r.change])];
    expect(ids(keyPromises(swapped(s.views), s.config, today))).toEqual(ids(keyPromises(s.views, s.config, today)));
  });
});

describe("lastChange", async () => {
  const s = await site("public-ledger");
  const b = await site("synthetic-bilingual");

  it("falls on lastChanged's day for every card", () => {
    for (const v of [...s.views, ...b.views]) expect(lastChange(v, s.today)?.date, v.id).toBe(lastChanged(v, s.today));
  });

  it("says what moved the promise that day, and when words were recorded later than said", () => {
    const bus = s.views.find((v) => v.id === "uk-bus-cap-2-2026")!;
    expect(lastChange(bus, s.today)).toEqual({ date: "2026-07-22", type: "in_plan" });
    const vat = s.views.find((v) => v.id === "uk-electricity-vat-2026")!;
    expect(lastChange(vat, s.today)).toEqual({ date: "2026-10-01", type: "delivered" });
    // Promised on 1 March 2025 and recorded the next day: the words were added later.
    const schools = b.views.find((v) => v.id === "example-governor-schools-2028")!;
    expect(lastChange(schools, "2025-03-05")).toEqual({ date: "2025-03-02", type: "recorded" });
    expect(lastChange(schools, "2026-03-01")).toEqual({ date: "2026-03-01", type: "reworded", subtype: "deadline_moved" });
    const replied = { ...bus, card: { ...bus.card, replies: [{ date: "2026-07-22", text: "We welcome it.", lang: "en" }] } } as CardView;
    expect(lastChange(replied, s.today)?.type).toBe("in_plan");
    expect(lastChange(bus, "2026-07-01")).toBeUndefined();
  });
});

describe("promisesByMonth", async () => {
  const s = await site("public-ledger");

  it("counts the promises made each month, from the first to today's, empty months included", () => {
    const months = promisesByMonth(s.views, s.config, s.today);
    const published = s.views.filter((v) => v.where === "promises");
    expect(months[0]!.month).toBe(published.map((v) => v.card.made_on).sort()[0]!.slice(0, 7));
    expect(months.at(-1)).toMatchObject({ month: s.today.slice(0, 7), soFar: true });
    expect(months.filter((m) => m.soFar)).toHaveLength(1);
    expect(months.reduce((n, m) => n + m.count, 0)).toBe(published.length);
    expect(months.some((m) => m.count === 0)).toBe(true);
    for (const [i, m] of months.entries()) if (i) expect(daysBetween(`${months[i - 1]!.month}-01`, `${m.month}-01`)).toBeGreaterThanOrEqual(28);
    expect(new Set(months.map((m) => m.month)).size).toBe(months.length);
  });

  it("gives one actor's months, the current one so far", () => {
    const burnham = s.views.filter((v) => v.actor.id === "andy-burnham");
    expect(promisesByMonth(burnham, s.config, "2026-10-20")).toEqual([
      { month: "2026-07", count: 2, soFar: false },
      { month: "2026-08", count: 1, soFar: false },
      { month: "2026-09", count: 1, soFar: false },
      { month: "2026-10", count: 0, soFar: true },
    ]);
    expect(promisesByMonth(burnham, s.config, "2027-01-03").map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
  });

  it("leaves out drafts, and is the same whoever made the promises", () => {
    expect(promisesByMonth(s.views.map((v) => ({ ...v, where: "drafts" as const })), s.config, s.today)).toEqual([]);
    expect(promisesByMonth(swapped(s.views), s.config, s.today)).toEqual(promisesByMonth(s.views, s.config, s.today));
  });
});
