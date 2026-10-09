# @openpromises/quotes

Exact-quote matching for [OpenPromises](https://github.com/xternal/openpromises): normalisation per language (Russian ё/е, quotation marks, dashes, spaces), the tiers exact / close / none, and character-for-character spans in stored source texts. No dependencies.

```ts
import { matchQuote } from "@openpromises/quotes";

matchQuote("Мы проиндексируем всё", "«Мы проиндексируем все»", { lang: "ru" }).tier; // "exact"
```

Licence: Apache-2.0.
