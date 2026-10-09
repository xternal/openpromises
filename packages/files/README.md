# @openpromises/files

Reads and writes an [OpenPromises](https://github.com/xternal/openpromises) content folder: loads the configuration, converts older formats on read, compares published cards with a git base (`VALIDATE_BASE`, then `origin/$GITHUB_BASE_REF`, then `origin/main`), and writes YAML that changes only the lines it must. Local files and local git only; no network.

Licence: Apache-2.0.
