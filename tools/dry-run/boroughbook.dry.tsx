import { BOROUGHBOOK } from "./boroughbook";
import { dryRun } from "./lib/run";

/**
 * Dry run for Borough Book (boroughbook.uk): is everything OpenPromises would
 * publish for it as good as what the site serves now, or better? Reads the
 * site's checkout and its live pages; changes neither. tools/dry-run/README.md.
 */
dryRun(BOROUGHBOOK);
