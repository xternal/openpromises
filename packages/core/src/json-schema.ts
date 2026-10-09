import { z } from "zod";
import { ConfigInput } from "./config";
import { Actor, Card, EditorsFile } from "./schema";

/**
 * JSON Schema for format v1, generated from the same Zod schemas the engine
 * uses, for tools in other languages (RFC-0001 §6: Python pipelines read the
 * exported JSON Schema). It describes the structure; the rules need the engine.
 */
const BASE = "https://raw.githubusercontent.com/xternal/openpromises/main/packages/core/schema";

export function jsonSchemas(): Record<string, object> {
  const out: Record<string, object> = {};
  const schemas: [string, z.ZodType, string][] = [
    ["card", Card, "An OpenPromises promise card, format openpromises/1 (docs/FORMAT.md §4)."],
    ["actor", Actor, "An OpenPromises actor, format openpromises/1 (docs/FORMAT.md §11)."],
    ["editors", EditorsFile, "An OpenPromises editors list (docs/FORMAT.md §12)."],
    ["config", ConfigInput, "An OpenPromises site configuration in YAML or JSON (docs/FORMAT.md §2). The x schemas are TypeScript only."],
  ];
  for (const [name, schema, description] of schemas) {
    const json = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    out[name] = { $schema: json.$schema, $id: `${BASE}/${name}.schema.json`, title: `OpenPromises ${name}`, description, ...json };
  }
  return out;
}
