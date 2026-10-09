/**
 * @openpromises/react: server components for promise pages, rendered to
 * plain HTML with no script (RFC-0001 §6). The one client part,
 * PromiseFilter, is in @openpromises/react/client. Styles:
 * @openpromises/react/styles.css (optional; every colour is a token).
 */
export * from "./components";
export * from "./filter";
export type { FilterOption, FilterWords, PromiseFilterProps } from "./client";
