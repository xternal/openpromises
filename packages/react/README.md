# @openpromises/react

React server components for [OpenPromises](https://github.com/xternal/openpromises) promise pages: `PromiseCard`, `PromiseList`, `ComingUp`, `Ladder`, `StatusPill`, `Breadcrumbs`, `ActorIndex`, `AreaIndex` and `JsonLd`. They render to plain HTML with no script, so pages read without JavaScript, from a static export or a `file://` mirror. The one client part, `PromiseFilter`, is in `@openpromises/react/client`.

```tsx
import { PromiseCard } from "@openpromises/react";
import "@openpromises/react/styles.css";

<PromiseCard view={view} config={config} today={today} />;
```

The stylesheet is optional: every colour is a token, dark mode is navy slate, and every text colour passes WCAG AA. See [docs/PUBLISHING.md](https://github.com/xternal/openpromises/blob/main/docs/PUBLISHING.md).

Licence: Apache-2.0.
