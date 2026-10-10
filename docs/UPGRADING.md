# Upgrading

This guide is for a site that runs on OpenPromises: what a new version can and cannot do to it, and how to move to one. The rules behind it are decision 13 in [DECISIONS.md](DECISIONS.md).

## What an upgrade never breaks

- **Your cards.** A card valid in format v1 stays valid in every later release. The format only grows, by optional fields; whether your site requires one is your setting, never an upgrade's. A field added to the format may be filled in once on a published card without a correction ([FORMAT.md §9](FORMAT.md#9-corrections), late fields). If a format v2 is ever needed, the engine reads v1 cards by converting them on read, so no published card is rewritten.
- **Your publishing.** A new or stricter check arrives as a warning that says from which version it becomes an error, and becomes one no sooner than the next minor release. An upgrade never stops you publishing without notice.
- **What your readers and their tools rely on.** Feed entry ids, page addresses, structured-data ids and open-data columns never change for an existing card. New open-data columns are added at the end.
- **Your code.** Every name the packages export stays exported. A renamed configuration key keeps working, with a warning, for one major version more.

Words do change: a label, a feed title, a sentence in Markdown. The changelog lists every change of wording, and anything you want worded your own way you set in `messages` (FORMAT.md §2); your words always win.

Every release proves these promises before it ships. The fixtures' outputs of each released version are kept in `fixtures/compat/`, and every later version must still produce them. A test fails if an exported name disappears. Each site's dry run (`tools/dry-run`) must find nothing worse than the live site.

## Versions

The six packages share one version number and are released together, so move them together.

| Change | What it may do |
|---|---|
| Patch (0.2.0 → 0.2.1) | Fixes only. |
| Minor (0.2 → 0.3) | Adds fields, checks (as warnings first), settings and words. While the version is 0.x, a minor may also break something, but only with the steps to take under "Upgrading" in the changelog. |
| Major (1.x → 2.0) | Breaking changes, from version 1.0 on, with the old way still working, with a warning, for one major more. |

Version 1.0 comes once Public Ledger and Borough Book run on the engine. Node 22 is supported until its end of life (30 April 2027).

## How to upgrade

1. Move every `@openpromises/*` package to the new version in one change:

   ```bash
   pnpm up "@openpromises/*@0.3.0"
   ```

   On pnpm 12, run it a day after the release: pnpm waits 1,440 minutes before installing a new version by default. If the setting is not written down, check that `pnpm-workspace.yaml` gained no `minimumReleaseAgeExclude` entries; remove any it did.

2. Read the changelog's "Upgrading" notes for every version you pass.
3. Run your checks and your build, as your CI does:

   ```bash
   pnpm exec openpromises validate
   ```

   New warnings tell you what a later version will refuse; fix them at your own pace before then.
4. Merge when green.

A dependency bot can do steps 1 and 3 for you. With Renovate, keep the packages in one pull request:

```json
{
  "packageRules": [{ "matchPackageNames": ["@openpromises/**"], "groupName": "OpenPromises" }]
}
```

With Dependabot, use a group with the pattern `@openpromises/*`.

When a release renames a configuration key, `openpromises upgrade` will rewrite your configuration file for you. It touches the configuration, never a card. No key has been renamed so far.
