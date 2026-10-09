import { z } from "zod";
import { defineConfig } from "@openpromises/core";
import base from "../../fixtures/public-ledger/openpromises.config.ts";

/**
 * Public Ledger as it would be configured on the day it moves: the fixture's
 * configuration, plus the site's own words, its links to UK Parliament's
 * member pages, and a schema for the fields it keeps in x. A draft for the
 * move (docs/MIGRATING.md); the dry run reads it.
 */

export default defineConfig({
  ...base,
  actors: {
    ...base.actors,
    ids: { parliament_member_id: "https://members.parliament.uk/member/{id}", parliament_party_id: "UK Parliament Members API party id" },
  },
  quotes: {
    ...base.quotes,
    // The terms each quote may be reused on, by where it comes from (open-pnl packages/server/src/api/envelope.ts quoteLicence).
    licences: [
      { hosts: ["parliament.uk"], name: "Open Parliament Licence v3.0" },
      { hosts: ["gov.uk", "gov.scot", "gov.wales"], name: "Open Government Licence v3.0" },
    ],
    otherLicence: "Quoted for reporting; rights stay with the publisher",
  },
  // The automated reviewer was called "Junior Editor" until 8 October 2026.
  editorial: { ...base.editorial, renamed: { "Junior Editor": "AI Journalist" } },
  publish: { ...base.publish, licence: { name: "Creative Commons Attribution 4.0 (CC BY 4.0)", url: "https://creativecommons.org/licenses/by/4.0/" } },
  messages: {
    en: {
      "card.area": "Policy area",
      "card.timeline": "Timeline",
      "card.corrections": "Corrections",
      "card.corrected_on": "{date}, {target}",
      "nav.promises": "Promise ledger",
      "feed.actor": "{site}: {who}",
      "feed.all": "{site}: every change",
      "feed.area": "{site}: {area}",
      "feed.sub.all":
        "New timeline events, rewordings, replies and cost changes on every tracked UK political promise, changes to the contracts behind them, and new editions of the headline figures, newest first.",
      "md.quote_checked": "checked word for word on {date}",
      "md.licence":
        "{site}'s own writing (headlines, status notes, cost notes, summaries) is licensed under {licence}: reuse it, crediting {site} with a link to the card. Official figures are under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) unless their source says otherwise; quotes from Parliament under the [Open Parliament Licence v3.0](https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/); other quotes are short extracts whose rights stay with the speaker. How the numbers and statuses are made: https://ledgergov.uk/method.",
    },
  },
  // The fields Public Ledger keeps beyond format v1 (open-pnl packages/schema/src/content.ts). Who must deliver and
  // who brought it about are format fields since decision 14 (responsible, brought_about_by).
  x: {
    card: z.strictObject({
      submission_ref: z.string().optional(),
      credit: z.string().optional(),
      editor_check_required: z.boolean().optional(),
    }),
  },
});
