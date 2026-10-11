import { LEDGERGOV } from "./ledgergov";
import { dryRun } from "./lib/run";

/**
 * Dry run for Public Ledger (ledgergov.uk): is everything OpenPromises would
 * publish for it as good as what the site serves now, or better? Reads the
 * site's checkout and its live pages; changes neither. tools/dry-run/README.md.
 */
dryRun(LEDGERGOV);
