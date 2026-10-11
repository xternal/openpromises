import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Tests run against the TypeScript sources, so they need no build first.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@openpromises\/react\/client$/, replacement: resolve(import.meta.dirname, "packages/react/src/client.tsx") },
      { find: /^@openpromises\/(core|files|quotes|cli|publish|react)$/, replacement: resolve(import.meta.dirname, "packages/$1/src/index.ts") },
    ],
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx", "fixtures/**/*.test.ts"],
    // The slowest tests (axe in jsdom, git in temporary folders, the TypeScript export report) can pass 5 seconds on a busy machine.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
