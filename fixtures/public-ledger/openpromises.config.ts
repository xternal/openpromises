import { defineConfig } from "@openpromises/core";

// Public Ledger (ledgergov.uk) on format v1: the cards in v1/, converted from source/.
export default defineConfig({
  site: { name: "Public Ledger", url: "https://ledgergov.uk" },
  content: "v1",
  timezone: "Europe/London",
  locales: { default: "en", all: ["en"] },
  money: { currency: "GBP", unit: "bn", period: "year", qualities: ["sourced", "approx", "modelled"] },
  actors: {
    kinds: ["person", "party", "government"],
    standing: "manual",
    ids: { parliament_member_id: "UK Parliament Members API member id", parliament_party_id: "UK Parliament Members API party id" },
  },
  venues: ["manifesto", "speech", "debate", "tv", "interview", "press_release", "parliament", "social"],
  areas: {
    kind: "enum",
    values: ["taxes", "social_protection", "health", "education", "economic_affairs", "defence", "public_order", "general_services", "housing_env", "culture"],
  },
  ladder: "national",
  editorial: { approvals: 2, partyConflict: true },
  quotes: { archive: "optional", require: "editor" },
  modules: ["contracts", "lever", "corrections", "reviews"],
  legacy: "public-ledger",
});
