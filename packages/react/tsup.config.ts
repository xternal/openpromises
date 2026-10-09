import { defineConfig } from "tsup";

// Two builds: the server components, and the one client part, which keeps its "use client" line.
export default defineConfig([
  { entry: ["src/index.ts"], format: ["esm"], target: "es2022", dts: true, clean: true, sourcemap: true, external: ["react"] },
  { entry: ["src/client.tsx"], format: ["esm"], target: "es2022", dts: true, sourcemap: true, external: ["react"], banner: { js: '"use client";' } },
]);
