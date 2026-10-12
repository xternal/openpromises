import { defineConfig } from "@openpromises/core";
import base from "../../fixtures/borough-book/openpromises.config.ts";

/**
 * BoroughBook.UK as it would be configured on the day it moves: for now, the
 * fixture's configuration as it stands. The site's own words and settings are
 * added here as its dry run finds them (docs/MIGRATING.md).
 */
export default defineConfig({ ...base });
