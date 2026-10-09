import { join } from "node:path";
import { todayIn, validateContent, type Config } from "@openpromises/core";
import { folderSource, loadConfig, readContent } from "@openpromises/files";
import { cardViews, type CardView } from "@openpromises/publish";

export const ROOT = join(import.meta.dirname, "..", "..", "..");
export const SITES = ["public-ledger", "borough-book", "synthetic-bilingual"] as const;
export type SiteName = (typeof SITES)[number];

/** A fixture site, read and validated as `openpromises publish` reads it. */
export async function site(name: SiteName, today = "2026-10-09"): Promise<{ config: Config; views: CardView[]; today: string }> {
  const { config, contentDir } = await loadConfig(join(ROOT, "fixtures", name, "openpromises.config.ts"));
  const r = validateContent(readContent(folderSource(contentDir), config).input);
  return { config, views: cardViews(r.cards, r.actors), today: today ?? todayIn(config.timezone) };
}
