import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every text colour in styles.css passes WCAG AA (4.5:1) on the backgrounds
 * it is used on, in light and dark mode, and every mark that carries meaning
 * passes 3:1. Faint text is never used on the second raised surface
 * (--op-sunk), so it is checked on the other two. Dark mode is the dark brown
 * palette: no text above 14:1, which glares, and no blue in the chrome.
 */

const css = readFileSync(join(import.meta.dirname, "..", "styles.css"), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--op-([a-z-]+):\s*(#[0-9a-f]{6}|rgba\([^)]*\));/gi)].map((m) => [m[1]!, m[2]!.toLowerCase().replace(/\s+/g, "")]));
}

const light = tokens(css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {"))));
const darkStart = css.indexOf(':root[data-theme="dark"] {');
const dark = tokens(css.slice(darkStart, css.indexOf("}", darkStart)));
const darkMedia = tokens(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), darkStart));

/** Red, green and blue (0 to 255), then alpha (0 to 1). */
const channels = (colour: string): number[] =>
  colour.startsWith("#") ? [...[1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16)), 1] : colour.slice(colour.indexOf("(") + 1, -1).split(",").map(Number);

/** A colour as it shows on an opaque background: a see-through line is mixed with what is under it. */
const shown = (colour: string, bg: string): number[] => {
  const [r, g, b, a] = channels(colour) as [number, number, number, number];
  const under = channels(bg);
  return [r, g, b].map((c, i) => c * a + under[i]! * (1 - a));
};

const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.slice(0, 3).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (colour: string, bg: string) => {
  const [x, y] = [luminance(shown(colour, bg)), luminance(channels(bg))].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

const backgrounds = ["bg", "surface", "sunk"];
const texts = ["ink", "muted", "accent", "good", "warn", "bad"];

/** Each rule of the stylesheet; the first rule in an @media block keeps only its own selector. */
const rules = css
  .split("}")
  .map((r) => r.split("{"))
  .map((parts) => ({ selector: parts.at(-2)?.trim() ?? "", body: parts.at(-1) ?? "" }));

// Marks that carry meaning without words, read from the stylesheet: shapes drawn in a token's colour (the
// ladder's current step, the timeline's dots, the focus ring) and the colours of a status pill. Backgrounds
// are what marks sit on. Lines only separate and frame: a passed step on the ladder is also every step
// before the current one, so its lighter bar is never the only sign.
const drawn = rules.flatMap((r) => [...r.body.matchAll(/(?:background|outline|box-shadow):[^;]*var\(--op-([a-z-]+)\)/g)].map((m) => m[1]!));
const pill = rules.filter((r) => r.selector.includes(".op-pill")).flatMap((r) => [...r.body.matchAll(/(?:^|[\s;])color:\s*var\(--op-([a-z-]+)\)/g)].map((m) => m[1]!));
const marks = [...new Set([...drawn, ...pill])].filter((k) => !backgrounds.includes(k) && !k.startsWith("line"));

it("finds the marks in the stylesheet", () => {
  expect(marks).toEqual(expect.arrayContaining(["ink", "accent", "muted", "good", "warn", "bad"]));
});

describe.each([
  ["light", light],
  ["dark", dark],
])("%s colours", (_, t) => {
  it.each(texts)("%s passes AA on every background", (text) => {
    for (const bg of backgrounds) expect(ratio(t[text]!, t[bg]!), `${text} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("faint passes AA on the page and the first raised surface", () => {
    for (const bg of ["bg", "surface"]) expect(ratio(t.faint!, t[bg]!), `faint on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(marks)("%s marks pass 3:1 on every background", (mark) => {
    for (const bg of backgrounds) expect(ratio(t[mark]!, t[bg]!), `${mark} on ${bg}`).toBeGreaterThanOrEqual(3);
  });
});

describe("dark mode", () => {
  it("is the dark brown palette, never black or navy, the same with the media query and the switch", () => {
    expect(dark).toEqual(darkMedia);
    expect(dark).toEqual({
      bg: "#241f1a",
      surface: "#2e2822",
      sunk: "#39322b",
      line: "rgba(239,231,218,0.1)",
      "line-strong": "rgba(239,231,218,0.16)",
      ink: "#efe7da",
      muted: "#c0b5a4",
      faint: "#a59a88",
      accent: "#e2b26f",
      good: "#8aa3ec",
      warn: "#f0dcaa",
      bad: "#ec9286",
    });
  });

  it("keeps body text at about 13:1, and no text above 14:1, which glares", () => {
    expect(ratio(dark.ink!, dark.bg!)).toBeGreaterThanOrEqual(12.5);
    for (const text of [...texts, "faint"]) for (const bg of backgrounds) expect(ratio(dark[text]!, dark[bg]!), `${text} on ${bg}`).toBeLessThanOrEqual(14);
  });

  it("has no blue cast in the chrome: only the status colours may be blue or red", () => {
    for (const [name, colour] of Object.entries(dark)) {
      if (name === "good" || name === "bad") continue;
      const [r, , b] = channels(colour) as [number, number, number];
      expect(b, `${name} is bluer than it is red`).toBeLessThanOrEqual(r);
    }
  });

  it("draws lines that show on every surface, the strong line more than the plain one", () => {
    for (const bg of backgrounds) {
      expect(ratio(dark.line!, dark[bg]!), `line on ${bg}`).toBeGreaterThan(1.25);
      expect(ratio(dark["line-strong"]!, dark[bg]!), `strong line on ${bg}`).toBeGreaterThan(ratio(dark.line!, dark[bg]!));
    }
  });

  it("never puts faint text on the second raised surface", () => {
    for (const rule of css.split("}")) if (rule.includes("var(--op-sunk)") && /(^|[^-])color:\s*var\(--op-faint\)/.test(rule)) throw new Error(`faint text on --op-sunk: ${rule.trim().slice(0, 80)}`);
  });
});
