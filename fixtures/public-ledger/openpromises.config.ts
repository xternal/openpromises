import { defineConfig } from "@openpromises/core";

// Public Ledger (ledgergov.uk) on format v1: the cards in v1/, converted from source/.
export default defineConfig({
  site: {
    name: "Public Ledger",
    url: "https://ledgergov.uk",
    description: { en: "What UK governments and parties promise: the exact words, the cost a year, and a timeline that moves only on evidence." },
  },
  content: "v1",
  timezone: "Europe/London",
  locales: { default: "en", all: ["en"] },
  // Every cost names who made its central figure, and every card who must deliver it (decision 14).
  money: { currency: "GBP", unit: "bn", period: "year", qualities: ["sourced", "approx", "modelled"], costedBy: "required" },
  actors: {
    kinds: ["person", "party", "government"],
    standing: "manual",
    responsible: ["government"],
    responsibleRequired: true,
    ids: { parliament_member_id: "UK Parliament Members API member id", parliament_party_id: "UK Parliament Members API party id" },
  },
  venues: ["manifesto", "speech", "debate", "tv", "interview", "press_release", "parliament", "social"],
  areas: {
    kind: "enum",
    values: ["taxes", "social_protection", "health", "education", "economic_affairs", "defence", "public_order", "general_services", "housing_env", "culture"],
    // Public Ledger's labels and its published area URLs (packages/server/src/seo/cards.ts AREA_SLUG): never change a slug.
    labels: {
      taxes: { en: "Taxes" },
      social_protection: { en: "Social protection" },
      health: { en: "Health" },
      education: { en: "Education" },
      economic_affairs: { en: "Transport & economy" },
      defence: { en: "Defence" },
      public_order: { en: "Police, courts, prisons" },
      general_services: { en: "Running government" },
      housing_env: { en: "Housing & environment" },
      culture: { en: "Culture & sport" },
    },
    slugs: {
      taxes: "taxes",
      social_protection: "social-protection",
      health: "health",
      education: "education",
      economic_affairs: "transport-and-economy",
      defence: "defence",
      public_order: "police-courts-and-prisons",
      general_services: "running-government",
      housing_env: "housing-and-environment",
      culture: "culture-and-sport",
    },
  },
  ladder: "national",
  editorial: { approvals: 2, partyConflict: true },
  quotes: { archive: "optional", require: "editor" },
  modules: ["contracts", "lever", "corrections", "reviews"],
  // Feed entry ids as Public Ledger's feeds already publish them (tag:ledgergov.uk,2026:promise/<id>/event/<n>).
  publish: { tag: "ledgergov.uk,2026", feeds: "atom", licence: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" } },
  legacy: "public-ledger",
});
