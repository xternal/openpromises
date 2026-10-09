import { describe, expect, it } from "vitest";
import { checkSpan, decodeEntities, findSpan, looseKey, matchQuote, normalise, quoteWords, textFromHtml } from "@openpromises/quotes";

describe("normalise", () => {
  it("evens out quotation marks, apostrophes, dashes, spaces and the ellipsis", () => {
    expect(normalise("«Мы» — „всё“ … it’s")).toBe(normalise('"Мы" - "всё" ... it\'s'));
    expect(normalise("  a \n\t b  ")).toBe("a b");
    expect(normalise("co­operate​")).toBe("cooperate");
  });

  it("folds ё into е in Russian only", () => {
    expect(normalise("Всё ещё", "ru")).toBe("Все еще");
    expect(normalise("Всё ещё", "ru-RU")).toBe("Все еще");
    expect(normalise("Всё", "en")).toBe("Всё");
  });

  it("never changes words or case", () => {
    expect(normalise("We WILL cap fares")).toBe("We WILL cap fares");
  });
});

describe("matchQuote", () => {
  const source = "The Prime Minister said: “I’ve done it before and I will do it again now: a £2 cap on bus fares for millions across the country.” The cap starts in January.";

  it("is exact when the words are there, whatever the typography", () => {
    expect(matchQuote("I've done it before and I will do it again now: a £2 cap on bus fares", source).tier).toBe("exact");
    expect(matchQuote("Мы проиндексируем всё — с 1 января", "Сказано: «Мы проиндексируем все - с 1 января».", { lang: "ru" }).tier).toBe("exact");
  });

  it("is close when only case, punctuation or spacing differ", () => {
    expect(matchQuote("i've done it before, and i will do it again now", source).tier).toBe("close");
    expect(matchQuote("Мы проиндексируем всё", "мы проиндексируем все", { lang: "en" }).tier).toBe("close");
  });

  it("is none when a word differs, and says how far it matched", () => {
    const m = matchQuote("I will do it again now: a £3 cap on bus fares", source);
    expect(m.tier).toBe("none");
    expect(m.matchedWords).toBe(7);
    expect(m.missingFrom).toBe("£3 cap on bus fares");
  });

  it("never matches an empty quote", () => {
    expect(matchQuote("  ", source).tier).toBe("none");
  });
});

describe("checkSpan", () => {
  const text = "Intro. We will build 1.5 million homes in this Parliament. Outro.";
  const quote = "We will build 1.5 million homes in this Parliament.";
  const span = findSpan(quote, text)!;

  it("passes when the stored text at the span is the quote, character for character", () => {
    expect(span).toEqual([7, 58]);
    expect(checkSpan(quote, text, span, { minWords: 6 })).toEqual([]);
  });

  it("fails when one character differs, naming the first difference", () => {
    const [problem] = checkSpan("We will build 1.6 million homes in this Parliament.", text, span);
    expect(problem).toContain('first difference at character 16, the quote has "6 million');
  });

  it("does not normalise: curly and straight apostrophes differ in a stored text", () => {
    expect(checkSpan("it’s", "it's", [0, 4])).toHaveLength(1);
  });

  it("fails when the span is outside the text", () => {
    expect(checkSpan(quote, text, [50, 500])[0]).toContain("not inside the stored text");
    expect(checkSpan(quote, text, [10, 10])[0]).toContain("not inside the stored text");
  });

  it("fails a quote shorter than the minimum", () => {
    expect(checkSpan("Intro.", text, [0, 6], { minWords: 6 })).toEqual(["the quote has 1 word; a quote needs at least 6"]);
  });

  it("finds no span for words that are not there exactly", () => {
    expect(findSpan("we will build", text)).toBeNull();
  });
});

describe("quoteWords and loose keys", () => {
  it("counts words, money and percentages", () => {
    expect(quoteWords("Cap fares at £2 — that’s 20% off")).toBe(7);
    expect(quoteWords("Снизим налог на 5%")).toBe(4);
  });

  it("keeps only letters and digits in a loose key", () => {
    expect(looseKey("Всё, Ещё — 5!", "ru")).toBe("всееще5");
  });
});

describe("HTML", () => {
  it("keeps the readable text and decodes character references", () => {
    const html = `<html><head><style>p{}</style><script>var a = "<b>";</script></head><body><p>We&nbsp;will &laquo;cap&raquo; fares &#8212; at &pound;2&#x21;</p><!-- note --></body></html>`;
    const text = textFromHtml(html);
    expect(text).not.toContain("var a");
    expect(normalise(text)).toBe('We will "cap" fares - at £2!');
  });

  it("leaves unknown references alone", () => {
    expect(decodeEntities("&unknown; &amp;")).toBe("&unknown; &");
  });
});
