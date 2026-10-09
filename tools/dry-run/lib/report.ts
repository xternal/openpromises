import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What the dry run found, area by area. Every difference between the live
 * site and what the engine would publish gets one verdict:
 *
 * - same: no difference a reader or a machine would notice
 * - better: the engine does more, or does it more correctly
 * - changed: different, and a person should look (does not fail the run)
 * - site: stays the site's own job; the engine does not replace it
 * - accepted: worse or different, but already decided (the reason says where)
 * - worse: the engine would lose or break something; the run fails
 */

export const VERDICTS = ["worse", "changed", "accepted", "site", "better", "same"] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface Finding {
  area: string;
  verdict: Verdict;
  /** One line: what was compared and what was found. */
  what: string;
  /** Examples or the full list, for the report. */
  items?: string[];
  /** Why it is accepted, or kept in the site. */
  reason?: string;
}

export interface Accepted {
  area: string;
  /** Matches a finding's `what`. */
  match: RegExp;
  verdict: "accepted" | "site";
  reason: string;
}

/** Turn worse and changed findings that were already decided into accepted (or site) ones. */
export function applyAccepted(findings: Finding[], accepted: readonly Accepted[]): Finding[] {
  return findings.map((f) => {
    if (f.verdict !== "worse" && f.verdict !== "changed") return f;
    const a = accepted.find((x) => x.area === f.area && x.match.test(f.what));
    return a ? { ...f, verdict: a.verdict, reason: a.reason } : f;
  });
}

const ICON: Record<Verdict, string> = { worse: "✗ worse", changed: "△ changed", accepted: "◇ accepted", site: "○ site", better: "▲ better", same: "✓ same" };

export function worst(findings: readonly Finding[]): Verdict {
  return VERDICTS.find((v) => findings.some((f) => f.verdict === v)) ?? "same";
}

export interface RunInfo {
  site: string;
  live: string;
  content: string;
  contentCommit: string;
  engine: string;
  started: string;
  pagesFetched: number;
  offline: boolean;
}

export function reportMarkdown(info: RunInfo, areas: readonly string[], findings: readonly Finding[]): string {
  const counts = (fs: readonly Finding[]) =>
    VERDICTS.map((v) => [v, fs.filter((f) => f.verdict === v).length] as const)
      .filter(([, n]) => n)
      .map(([v, n]) => `${n} ${v}`)
      .join(", ");
  const lines = [
    `# Dry run: ${info.site}`,
    "",
    `What OpenPromises would publish for ${info.live}, compared with what the site serves now. Nothing was changed or deployed: the site's content was read from ${info.content} (commit ${info.contentCommit}) and ${info.pagesFetched} live pages were fetched${info.offline ? " (from the cache of an earlier run)" : ""}.`,
    "",
    `- **Engine:** ${info.engine}`,
    `- **Run:** ${info.started}`,
    `- **Result:** ${findings.some((f) => f.verdict === "worse") ? `not yet good or better: ${findings.filter((f) => f.verdict === "worse").length} worse` : "good or better everywhere"} (${counts(findings)})`,
    "",
    "| Area | Verdict | Findings |",
    "|---|---|---|",
    ...areas.map((a) => {
      const fs = findings.filter((f) => f.area === a);
      return `| [${a}](#${a.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-")}) | ${ICON[worst(fs)]} | ${counts(fs)} |`;
    }),
    "",
    "Verdicts: **same** (no difference a reader or machine would notice), **better** (the engine does more, or more correctly), **changed** (different; a person should look), **site** (stays the site's own job), **accepted** (already decided; the reason says where), **worse** (the engine would lose or break something; the run fails).",
  ];
  for (const a of areas) {
    lines.push("", `## ${a}`, "");
    const fs = [...findings.filter((f) => f.area === a)].sort((x, y) => VERDICTS.indexOf(x.verdict) - VERDICTS.indexOf(y.verdict));
    for (const f of fs) {
      lines.push(`- **${ICON[f.verdict]}:** ${f.what}${f.reason ? ` *${f.reason}*` : ""}`);
      const items = f.items ?? [];
      for (const i of items.slice(0, 12)) lines.push(`  - ${i}`);
      if (items.length > 12) lines.push(`  - …and ${items.length - 12} more (report.json has them all)`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function writeReport(dir: string, info: RunInfo, areas: readonly string[], findings: readonly Finding[]): string {
  mkdirSync(dir, { recursive: true });
  const md = reportMarkdown(info, areas, findings);
  writeFileSync(join(dir, "report.md"), md);
  writeFileSync(join(dir, "report.json"), `${JSON.stringify({ ...info, areas, findings }, null, 2)}\n`);
  return md;
}
