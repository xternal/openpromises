import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveConfig, type Config } from "@openpromises/core";
import { readYaml } from "./write";

/** The names a configuration file may have, in the order they are looked for. */
export const CONFIG_FILES = [
  "openpromises.config.ts",
  "openpromises.config.mts",
  "openpromises.config.js",
  "openpromises.config.mjs",
  "openpromises.config.json",
  "openpromises.config.yaml",
  "openpromises.config.yml",
] as const;

/** The configuration file in a folder or the nearest one above it, or null. */
export function findConfig(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    for (const name of CONFIG_FILES) if (existsSync(join(dir, name))) return join(dir, name);
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export interface LoadedConfig {
  config: Config;
  /** The configuration file. */
  file: string;
  /** The content folder, absolute. */
  contentDir: string;
}

/** Read and check a configuration file. A TypeScript file needs Node 22.18 or later, which reads TypeScript directly. */
export async function loadConfig(file: string): Promise<LoadedConfig> {
  const path = resolve(file);
  let input: unknown;
  if (/\.(json)$/.test(path)) input = JSON.parse(readFileSync(path, "utf8"));
  else if (/\.ya?ml$/.test(path)) input = readYaml(readFileSync(path, "utf8"));
  else {
    try {
      const mod = (await import(pathToFileURL(path).href)) as { default?: unknown };
      input = mod.default;
    } catch (e) {
      const message = (e as Error).message;
      if (/\.m?ts$/.test(path) && /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(message))
        throw new Error(`${file}: this version of Node cannot read TypeScript; use Node 22.18 or later, or write the configuration as .yaml or .json`);
      throw new Error(`${file}: ${message}`);
    }
    if (input === undefined) throw new Error(`${file}: the configuration is the file's default export (export default defineConfig({ … }))`);
  }
  const config = resolveConfig(input);
  return { config, file: path, contentDir: resolve(dirname(path), config.content) };
}
