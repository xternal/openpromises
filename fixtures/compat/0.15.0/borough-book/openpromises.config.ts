import { defineConfig } from "@openpromises/core";

// Borough Book (boroughbook.uk) on format v1: the cards in v1/, converted from source/.
export default defineConfig({
  site: {
    name: "Borough Book",
    url: "https://boroughbook.uk",
    description: { en: "What the parties on Hammersmith & Fulham Council promised, what each pledge costs, and what the council has done about it." },
    // Borough Book's own URLs: /party/<id>, /topic/<slug>, and a feed beside each page (<page>/feed.xml).
    paths: { promises: "/promises", card: "/promise/{id}", actor: "/party/{id}", area: "/topic/{area}", feeds: "{page}/feed.xml" },
  },
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
  // RSS, with item ids as Borough Book's feeds already publish them (tag:borough-ledger,2026:promise/<id>/event/<n>).
  publish: { tag: "borough-ledger,2026", feeds: "rss" },
  legacy: "borough-book",
});
