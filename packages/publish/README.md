# @openpromises/publish

What an [OpenPromises](https://github.com/xternal/openpromises) site publishes about its promises, built from cards at build time: Atom and RSS feeds whose entry ids never change, JSON-LD (an Article whose main entity is the quotation; never rating markup), Markdown per card, `llms.txt` and `llms-full.txt`, a sitemap with hreflang alternates, open data (JSON and CSV) and IndexNow change lists. Words in English and Russian, overridable per site. Pure functions; no network calls.

```ts
import { cardViews, publishFiles } from "@openpromises/publish";

for (const file of publishFiles({ config, views: cardViews(cards, actors), today })) write(file.path, file.body);
```

See [docs/PUBLISHING.md](https://github.com/xternal/openpromises/blob/main/docs/PUBLISHING.md).

Licence: Apache-2.0.
