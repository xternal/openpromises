import { defineConfig } from "@openpromises/core";

// Borough Book (boroughbook.uk) on format v1: the cards in v1/, converted from source/.
export default defineConfig({
  site: { name: "Borough Book", url: "https://boroughbook.uk" },
  content: "v1",
  timezone: "Europe/London",
  locales: { default: "en", all: ["en"] },
  money: { currency: "GBP", unit: "m", period: "year", qualities: ["sourced", "approx", "modelled"] },
  actors: { kinds: ["party", "person"], standing: "fromSeats" },
  venues: ["manifesto", "leaflet", "hustings", "council_meeting", "press", "social"],
  areas: { kind: "text" },
  ladder: "local",
  labels: { en: { not_in_power: "Opposition pledge" } },
  editorial: { approvals: 2, partyConflict: true },
  quotes: { archive: "required", require: "editor" },
  modules: ["decisions", "lever", "wards"],
  legacy: "borough-book",
});
