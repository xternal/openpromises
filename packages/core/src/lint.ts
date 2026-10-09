import type { Config } from "./config";
import { issue, type Issue } from "./issues";
import { langMaps } from "./rules";
import type { Card } from "./schema";

/**
 * The neutral-words lint (RFC-0001 §4: labels stay neutral; principle 5). Our
 * own text states facts; it never passes judgement on a person. The lint finds
 * judgement words in the text we write, per language. The speaker's words are
 * never linted: quote fields are skipped, and so is anything inside quotation
 * marks in our text, because an attributed quote may use any words.
 *
 * A term is a word or phrase; a trailing * on a word matches any ending
 * ("betray*" finds "betrayed" and "betrayal").
 */

export const DEFAULT_LINT_WORDS: Record<string, string[]> = {
  en: [
    "broken promise*",
    "broken pledge*",
    "betray*",
    "lie",
    "lies",
    "lied",
    "lying",
    "liar*",
    "shame*",
    "disgrace*",
    "scandal*",
    "fiasco*",
    "sham",
    "shams",
    "propagand*",
    "regime*",
    "puppet*",
    "crony",
    "cronies",
    "cronyism",
    "incompeten*",
    "reckless*",
    "disastrous*",
    "catastroph*",
    "u-turn*",
    "kleptocra*",
  ],
  ru: [
    "режим*",
    "хунт*",
    "лжив*",
    "ложь",
    "лжи",
    "ложью",
    "провал*",
    "позор*",
    "грабёж*",
    "грабеж*",
    "воровств*",
    "кровав*",
    "преступн*",
    "пропаганд*",
    "фейк*",
    "обман*",
    "марионеточн*",
    "предател*",
    "мошенни*",
  ],
};

/** Neutral phrases that contain a listed word. They are cleared first. */
export const DEFAULT_LINT_ALLOW: Record<string, string[]> = {
  en: ["tax regime*", "sanctions regime*", "regulatory regime*", "visa regime*", "planning regime*", "trade regime*", "benefit* regime*", "lies with", "lies within", "lies between", "lies outside"],
  ru: ["налогов* режим*", "специальн* налогов* режим*", "режим* налогообложени*", "режим* работы", "режим* доступа", "режим* санкций", "преступност*"],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A term as a regular expression with Unicode-aware word edges (so it works for Cyrillic too). */
export function termPattern(term: string): RegExp {
  const words = term
    .trim()
    .split(/\s+/)
    .map((w) => (w.endsWith("*") ? `${escape(w.slice(0, -1))}[\\p{L}\\p{N}-]*` : escape(w)));
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join("\\s+")}(?![\\p{L}\\p{N}])`, "giu");
}

/** Blank out text inside quotation marks, keeping its length so positions stay right. */
export function stripQuoted(s: string): string {
  const blank = (m: string) => " ".repeat(m.length);
  return s.replace(/«[^»]*»/g, blank).replace(/„[^“”]*[“”]/g, blank).replace(/“[^”]*”/g, blank).replace(/"[^"]*"/g, blank);
}

const baseLang = (l: string) => l.toLowerCase().split("-")[0]!;

export interface Lexicon {
  words: RegExp[];
  allow: RegExp[];
}

/** The lint's words for one language: the built-in ones plus the site's own. */
export function lexicon(config: Pick<Config, "lint">, locale: string): Lexicon {
  const l = baseLang(locale);
  return {
    words: [...(DEFAULT_LINT_WORDS[l] ?? []), ...(config.lint.words[locale] ?? [])].map(termPattern),
    allow: [...(DEFAULT_LINT_ALLOW[l] ?? []), ...(config.lint.allow[locale] ?? [])].map(termPattern),
  };
}

/** The judgement words in a text, outside quotation marks. */
export function lintText(text: string, lex: Lexicon): string[] {
  let t = stripQuoted(text);
  for (const re of lex.allow) t = t.replace(re, (m) => " ".repeat(m.length));
  const hits: { at: number; word: string }[] = [];
  for (const re of lex.words) for (const m of t.matchAll(re)) hits.push({ at: m.index, word: m[0] });
  return hits.sort((a, b) => a.at - b.at).map((h) => h.word);
}

/** Judgement words in the text we write on a card (headline, notes, event texts, …), per language. */
export function lintCard(card: Card, config: Config): Issue[] {
  const out: Issue[] = [];
  const cache = new Map<string, Lexicon>();
  for (const at of langMaps(card, config.locales.default)) {
    if (at.kind !== "ours" || !at.lint) continue;
    for (const [locale, text] of Object.entries(at.map)) {
      const lex = cache.get(locale) ?? lexicon(config, locale);
      cache.set(locale, lex);
      for (const word of lintText(text, lex))
        out.push(issue("lint", [...at.path, locale], `"${word}" passes judgement; our own words state the facts (quote the speaker, in quotation marks, if their words are needed)`));
    }
  }
  return out;
}
