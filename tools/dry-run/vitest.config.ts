import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import base from "../../vitest.config";

// The dry runs: `pnpm dry-run`. Not part of `pnpm test`: they read a site's checkout and its live pages.
export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  resolve: base.resolve,
  test: {
    include: ["tools/dry-run/*.dry.tsx"],
    testTimeout: 60_000,
    pool: "forks",
  },
});
