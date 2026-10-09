# @openpromises/core

Card format v1 for [OpenPromises](https://github.com/xternal/openpromises): Zod schemas for cards, actors and the editors list (with JSON Schema in `schema/` for other languages), `defineConfig` with status ladders and neutral labels, and the rules as pure functions that return plain-English issues. No I/O.

```ts
import { resolveConfig, validateCard } from "@openpromises/core";

const config = resolveConfig({ site: { name: "My tracker" }, ladder: "local" });
const { issues } = validateCard(card, { config, where: "promises", actors, editors });
```

Licence: Apache-2.0.
