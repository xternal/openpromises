/**
 * @openpromises/files: read and write a content folder, compare it with a
 * git base, and convert older formats on read. Local files and local git
 * only; no network.
 */
export * from "./source";
export * from "./config";
export * from "./read";
export * from "./check";
export * from "./write";
