import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The six packages are released together: one version, the same licence, ready for npm. */
const ROOT = join(import.meta.dirname, "..", "..", "..");
const PACKAGES = ["quotes", "core", "files", "publish", "react", "cli"] as const;
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const pkg = (name: string) => JSON.parse(read(`packages/${name}/package.json`)) as Record<string, unknown>;

describe("release", () => {
  it("gives every package the same version, the Apache-2.0 licence and public access", () => {
    const versions = new Set(PACKAGES.map((p) => pkg(p).version));
    expect(versions.size).toBe(1);
    for (const p of PACKAGES) {
      const json = pkg(p);
      expect(json.name).toBe(`@openpromises/${p}`);
      expect(json.license).toBe("Apache-2.0");
      expect(json.private).toBeUndefined();
      expect(json.publishConfig).toEqual({ access: "public" });
      expect(json.files).toEqual(expect.arrayContaining(["dist", "README.md", "LICENSE", "NOTICE"]));
      expect(read(`packages/${p}/LICENSE`), `${p} LICENSE`).toBe(read("LICENSE"));
      expect(read(`packages/${p}/NOTICE`), `${p} NOTICE`).toBe(read("NOTICE"));
      expect(existsSync(join(ROOT, "packages", p, "README.md"))).toBe(true);
    }
  });

  it("names the version in the changelog", () => {
    expect(read("CHANGELOG.md")).toContain(`## ${String(pkg("core").version)} `);
  });

  it("keeps the repository itself private, so the root is never published", () => {
    expect(JSON.parse(read("package.json")).private).toBe(true);
  });
});
