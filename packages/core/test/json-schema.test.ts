import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jsonSchemas } from "@openpromises/core";

describe("JSON Schema", () => {
  it("is committed and up to date (pnpm build && pnpm schema)", () => {
    for (const [name, schema] of Object.entries(jsonSchemas())) {
      const file = join(import.meta.dirname, "..", "schema", `${name}.schema.json`);
      expect(JSON.parse(readFileSync(file, "utf8")), name).toEqual(schema);
    }
  });

  it("describes the card's fields, so other tools can check structure", () => {
    const card = jsonSchemas().card as { required: string[]; properties: Record<string, unknown>; additionalProperties: unknown };
    expect(card.required).toEqual(expect.arrayContaining(["format", "id", "actor_id", "made_on", "area", "status", "versions", "events"]));
    expect(Object.keys(card.properties)).toContain("corrections");
    expect(card.additionalProperties).toBe(false);
  });
});
