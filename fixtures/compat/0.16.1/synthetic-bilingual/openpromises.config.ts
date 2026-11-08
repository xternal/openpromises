import { defineConfig } from "@openpromises/core";

// An invented bilingual tracker in the third site's format, on format v1: the cards in v1/, converted from source/.
export default defineConfig({
  site: {
    name: "Example bilingual tracker",
    url: "https://example.org",
    description: { ru: "Вымышленный трекер обещаний для тестов.", en: "An invented promise tracker for tests." },
  },
  content: "v1",
  timezone: "Europe/Moscow",
  locales: { default: "ru", all: ["ru", "en"] },
  money: { currency: "RUB", unit: "bn", period: "year" },
  actors: { kinds: ["person", "party", "government", "region"], standing: "none", levels: ["federal", "regional"] },
  venues: [
    "address",
    "direct_line",
    "decree",
    "national_goal",
    "national_project",
    "government_programme",
    "party_programme",
    "election_programme",
    "governor_address",
    "speech",
    "interview",
    "press_release",
    "parliament",
    "social",
  ],
  areas: {
    kind: "codes",
    pattern: "^(0[1-9]|1[0-4])$",
    labels: {
      "01": { ru: "Общегосударственные вопросы", en: "General government" },
      "04": { ru: "Национальная экономика", en: "National economy" },
      "07": { ru: "Образование", en: "Education" },
      "10": { ru: "Социальная политика", en: "Social policy" },
    },
  },
  ladder: "national",
  editorial: { approvals: 2, partyConflict: true },
  quotes: { archive: "required", require: "match" },
  modules: ["metrics", "designations", "lever"],
  publish: { tag: "example.org,2026", feeds: "both" },
  legacy: "russia-ledger",
});
