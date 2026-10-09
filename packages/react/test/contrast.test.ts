import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every text colour in styles.css passes WCAG AA (4.5:1) on the backgrounds
 * it is used on, in light and dark mode. Faint text is never used on the
 * second raised surface (--op-sunk), so it is checked on the other two.
 */

const css = readFileSync(join(import.meta.dirname, "..", "styles.css"), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--op-([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

const light = tokens(css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {"))));
const darkStart = css.indexOf(':root[data-theme="dark"] {');
const dark = tokens(css.slice(darkStart, css.indexOf("}", darkStart)));
const darkMedia = tokens(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), darkStart));

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

describe.each([
  ["light", light],
  ["dark", dark],
])("%s colours", (_, t) => {
  it.each(["ink", "muted", "accent", "good", "warn", "bad"])("%s passes AA on every background", (text) => {
    for (const bg of ["bg", "surface", "sunk"]) expect(ratio(t[text]!, t[bg]!), `${text} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("faint passes AA on the page and the first raised surface", () => {
    for (const bg of ["bg", "surface"]) expect(ratio(t.faint!, t[bg]!), `faint on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("dark mode", () => {
  it("is the navy slate palette, never black, the same with the media query and the switch", () => {
    expect(dark).toEqual(darkMedia);
    expect([dark.bg, dark.surface, dark.sunk, dark.ink, dark.muted, dark.faint, dark.accent]).toEqual(["#101820", "#131d27", "#1a2531", "#e7edf3", "#a3b0bd", "#7d8b99", "#7b9dff"]);
    expect(Object.values(dark)).not.toContain("#000000");
  });

  it("never puts faint text on the second raised surface", () => {
    for (const rule of css.split("}")) if (rule.includes("var(--op-sunk)") && /(^|[^-])color:\s*var\(--op-faint\)/.test(rule)) throw new Error(`faint text on --op-sunk: ${rule.trim().slice(0, 80)}`);
  });
});
