**What this changes, and why**

**Checks** (CONTRIBUTING.md)

- [ ] Tests: a failing and a passing example for each rule touched; `pnpm test` and `pnpm typecheck` pass
- [ ] No party, person or place in the engine's code; the conformance test passes
- [ ] No valid card becomes invalid (decision 13): new fields are optional, a stricter check starts as a warning; `fixtures/compat` passes
- [ ] `docs/FORMAT.md` updated if the format, the configuration or a rule changed; `pnpm build && pnpm schema` committed
- [ ] The changelog has a line under the next version, with "Upgrading" steps if a site must do anything
