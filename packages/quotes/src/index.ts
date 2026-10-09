/**
 * Exact-quote matching (RFC-0001 principle 1: exact words).
 *
 * A quote is the speaker's words, copied from a source. We check it two ways:
 *
 *  - against a span of a stored source text: the characters at [start, end]
 *    must equal the quote exactly (checkSpan);
 *  - against the text of a source or an archived copy: the quote must be in it
 *    once typography is evened out (matchQuote).
 *
 * matchQuote answers in three tiers. `exact`: the normalised quote is in the
 * normalised text. `close`: it is there only once case, punctuation and
 * spacing are ignored, as happens with a scan read by OCR; an editor must
 * confirm it by eye. `none`: it is not there.
 *
 * Normalisation evens out typography only, never words: Unicode composition,
 * quotation marks, apostrophes, dashes, spaces, soft hyphens and the ellipsis
 * character, and in Russian and Belarusian ё/е. Pure functions, no I/O.
 */

export type Tier = "exact" | "close" | "none";

/** Languages where ё and е are written interchangeably, so a quote matches either. */
const YO_LANGUAGES = new Set(["ru", "be"]);

const baseLang = (lang?: string) => (lang ?? "").toLowerCase().split("-")[0] ?? "";

/** The text a quote is compared with: typography evened out, nothing else. */
export function normalise(text: string, lang?: string): string {
  let s = text
    .normalize("NFC")
    .replace(/[­​-‍⁠﻿]/g, "")
    .replace(/[«»„‟“”"〝〞＂]/g, '"')
    .replace(/[‘’‚‛'`´ʼ]/g, "'")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
  if (YO_LANGUAGES.has(baseLang(lang))) s = s.replace(/ё/g, "е").replace(/Ё/g, "Е");
  return s;
}

/** For a near match only: letters and digits, case folded. */
export function looseKey(text: string, lang?: string): string {
  return normalise(text, lang)
    .toLocaleLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export interface QuoteMatch {
  tier: Tier;
  /** For `none`: how many of the quote's words, from the start, were found together in the text. */
  matchedWords?: number;
  /** For `none`: the quote's word count. */
  words?: number;
  /** For `none`: the words from the first one not found, shortened. */
  missingFrom?: string;
}

/** Whether a quote is in a text: exact, close or none. */
export function matchQuote(quote: string, text: string, opts: { lang?: string } = {}): QuoteMatch {
  const q = normalise(quote, opts.lang);
  const t = normalise(text, opts.lang);
  if (!q) return { tier: "none", matchedWords: 0, words: 0, missingFrom: "" };
  if (t.includes(q)) return { tier: "exact" };
  const loose = looseKey(quote, opts.lang);
  if (loose && looseKey(text, opts.lang).includes(loose)) return { tier: "close" };
  // How far the quote matches from its start: the longest run of its first words found in the text.
  const words = q.split(" ");
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (t.includes(words.slice(0, mid).join(" "))) lo = mid;
    else hi = mid - 1;
  }
  const rest = words.slice(lo).join(" ");
  return { tier: "none", matchedWords: lo, words: words.length, missingFrom: rest.length > 60 ? `${rest.slice(0, 59)}…` : rest };
}

/** Words as the quote checks count them: runs of letters, digits and £$€%, ignoring apostrophes and accents. */
export function quoteWords(s: string): number {
  const folded = s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/['‘’ʼ`´]/gu, "");
  return folded.match(/[\p{L}\p{N}£$€₽%]+/gu)?.length ?? 0;
}

const show = (s: string) => JSON.stringify(s);

/**
 * Why a quote is not exactly its span of a stored source text, or [] when it
 * is: the span lies inside the text, the characters there equal the quote one
 * for one (JavaScript string offsets), and the quote has at least `minWords`
 * words. No normalisation: a stored text is the source itself.
 */
export function checkSpan(quote: string, text: string, span: readonly [number, number], opts: { minWords?: number } = {}): string[] {
  const out: string[] = [];
  const [start, end] = span;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || start >= end) {
    out.push(`the span [${start}, ${end}] is not inside the stored text (${text.length} characters)`);
  } else {
    const there = text.slice(start, end);
    if (there !== quote) {
      let i = 0;
      while (i < there.length && i < quote.length && there[i] === quote[i]) i++;
      out.push(
        `the quote is not the stored text at [${start}, ${end}]: first difference at character ${i}, the quote has ${show(quote.slice(i, i + 20))}, the source has ${show(there.slice(i, i + 20))}`,
      );
    }
  }
  const minWords = opts.minWords ?? 0;
  const words = quoteWords(quote);
  if (words < minWords) out.push(`the quote has ${words} word${words === 1 ? "" : "s"}; a quote needs at least ${minWords}`);
  return out;
}

/** Where a quote sits in a stored text, as a span for `source_text`, or null when it is not there character for character. */
export function findSpan(quote: string, text: string): [number, number] | null {
  const at = text.indexOf(quote);
  return at < 0 || !quote ? null : [at, at + quote.length];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "­",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  pound: "£",
  euro: "€",
  copy: "©",
  thinsp: " ",
  ensp: " ",
  emsp: " ",
};

/** Decode HTML character references: named ones in common use, and every numeric one. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[ref.toLowerCase()] ?? m;
  });
}

/** The readable text of an HTML page: scripts, styles and tags removed, character references decoded. */
export function textFromHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}
