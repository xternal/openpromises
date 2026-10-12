import { describe, expect, it } from "vitest";
import { resolveConfig, verification, type QuoteCheck } from "@openpromises/core";
import { actors, card, CONFIG_INPUT, EDITORS, ruleIssues } from "./helpers";

// Decision 22: a site may publish a card once its checks pass.
const checked = resolveConfig({ ...CONFIG_INPUT, editorial: { publish: "checked" } });
const exact: QuoteCheck = { match: "exact", url: "https://web.archive.org/x" };
const unreviewed = card((c) => {
  c.origin = "manual";
  delete c.reviews;
  delete c.versions[0]!.quote_checked_on;
});

describe("publishing by checks (decision 22)", () => {
  it("keeps the editors' gate by default", () => {
    expect(ruleIssues("approvals", unreviewed)).toEqual(["reviews: a published card needs 2 editors' approvals; it has 0. Keep it in drafts/ until editors approve it (openpromises review)"]);
  });

  it("publishes a card from an official source or the intake once its words match at their source", () => {
    expect(ruleIssues("approvals", unreviewed, { config: checked })).toEqual([]);
    expect(ruleIssues("quotes", unreviewed, { config: checked, quoteCheck: () => exact })).toEqual([]);
    const intake = card((c) => {
      c.origin = "llm_intake";
      delete c.reviews;
    });
    expect(ruleIssues("approvals", intake, { config: checked })).toEqual([]);
  });

  it("still holds a reader's submission, or a card that does not say its origin, for two editors", () => {
    const submitted = card((c) => {
      c.origin = "reader_submission";
      delete c.reviews;
    });
    expect(ruleIssues("approvals", submitted, { config: checked })).toEqual([
      "reviews: a reader's submission needs 2 editors' approvals; it has 0. Keep it in drafts/ until editors approve it (openpromises review)",
    ]);
    const unsaid = card((c) => delete c.reviews);
    expect(ruleIssues("approvals", unsaid, { config: checked })).toEqual([
      "reviews: a card that does not say its origin needs 2 editors' approvals; it has 0. Keep it in drafts/ until editors approve it (openpromises review)",
    ]);
  });

  it("needs the words matched by a machine, not an editor's eye, on a card no editors approved", () => {
    const eyed = card((c) => {
      c.origin = "manual";
      delete c.reviews;
    });
    expect(ruleIssues("quotes", eyed, { config: checked })).toEqual([
      "versions[0].text: a card published by its checks needs its words matched at their source by a machine: add a stored-source span or an archive check (openpromises check-quote), or the editors' approvals",
    ]);
    const close: QuoteCheck = { match: "close", url: "https://web.archive.org/scan" };
    expect(ruleIssues("quotes", eyed, { config: checked, quoteCheck: () => close })[0]).toContain("a card published by its checks needs them word for word");
  });

  it("lets an editor's eye count once the editors approve", () => {
    const approved = card((c) => (c.origin = "manual"));
    expect(ruleIssues("quotes", approved, { config: checked })).toEqual([]);
  });

  it("still refuses a machine's approval and an unlisted editor", () => {
    const c = card((c) => {
      c.origin = "manual";
      c.reviews = [
        { by: "AI Journalist", kind: "automated", on: "2026-05-03", approves: true },
        { by: "Nobody", kind: "editor", on: "2026-05-03", approves: true },
      ];
    });
    expect(ruleIssues("approvals", c, { config: checked })).toEqual([
      "reviews[0].approves: machines suggest, people decide: an automated review never approves a card",
      'reviews[1].by: "Nobody" is not in the editors list',
    ]);
  });

  it("does not change drafts", () => {
    expect(ruleIssues("approvals", unreviewed, { config: checked, where: "drafts" })).toEqual([]);
  });
});

describe("verification (decision 23)", () => {
  const ctx = { actors, editors: EDITORS };

  it("is unknown without the editors list", () => {
    expect(verification(card(), { actors, editors: null })).toBeNull();
  });

  it("is none with no review, and automated with only a machine's", () => {
    expect(verification(card((c) => delete c.reviews), ctx)).toEqual({ level: "none", named: [], counted: 0, automated: [] });
    const machine = card((c) => (c.reviews = [{ by: "Junior Editor", kind: "automated", on: "2026-05-03" }]));
    expect(verification(machine, ctx)).toEqual({ level: "automated", named: [], counted: 0, automated: ["Junior Editor"] });
  });

  it("names the editors who chose it and counts the rest, in the order they approved", () => {
    const named = EDITORS.map((e) => (e.handle === "Alex" ? { ...e, named: true } : e));
    expect(verification(card(), { actors, editors: named })).toEqual({ level: "editors", named: ["Alex"], counted: 1, automated: [] });
    expect(verification(card(), ctx)).toEqual({ level: "editors", named: [], counted: 2, automated: [] });
    const one = card((c) => (c.reviews = c.reviews!.slice(0, 1)));
    expect(verification(one, ctx)?.level).toBe("editor");
  });

  it("counts as the approvals rule does: listed, within their dates, never about their own party", () => {
    const c = card((c) => {
      c.reviews = [
        { by: "Kim", kind: "editor", on: "2026-05-03", approves: true }, // Kim is in the speaker's party
        { by: "Alex", kind: "editor", on: "2025-12-01", approves: true }, // before Alex was an editor
        { by: "Nobody", kind: "editor", on: "2026-05-03", approves: true },
        { by: "Sam", kind: "editor", on: "2026-05-03", approves: true },
        { by: "Sam", kind: "editor", on: "2026-05-04", approves: true },
      ];
    });
    expect(verification(c, ctx)).toEqual({ level: "editor", named: [], counted: 1, automated: [] });
  });
});
