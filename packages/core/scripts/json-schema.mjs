// Writes packages/core/schema/*.schema.json from the built package: pnpm build && pnpm schema.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jsonSchemas } from "../dist/index.js";

const dir = join(import.meta.dirname, "..", "schema");
mkdirSync(dir, { recursive: true });
for (const [name, schema] of Object.entries(jsonSchemas())) {
  writeFileSync(join(dir, `${name}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`wrote schema/${name}.schema.json`);
}
