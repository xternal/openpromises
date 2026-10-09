import { statusLabel, type Config } from "@openpromises/core";
import { correctionTarget, correctionValue } from "./corrections";
import { costFacts, costText, longDate } from "./format";
import type { Words } from "./messages";
import { absolute, paths } from "./urls";
import { actorName, areaLabel, cardCostText, climb, eventLabel, headline, lastUpdated, metricText, pick, quoteIn, statusMix, type CardView } from "./view";

/**
 * Promise cards as Markdown, for AI assistants and anyone who reads plain
 * text: <card>.md (one card), llms.txt (a guide) and llms-full.txt (every
 * card, the method in short and the licence). The same facts as the page, in
 * the same order, numbers first. Ported from Public Ledger's.
 */

export const MARKDOWN_TYPE = "text/markdown; charset=utf-8";

export interface MdContext {
  config: Config;
  w: Words;
  today: string;
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim();
/** Link text cannot hold square brackets or backslashes unescaped. */
const link = (text: string, url: string) => `[${flat(text).replace(/([\\[\]])/g, "\\$1")}](${url})`;

/** "Costs £1.53bn to £1.87bn a year (central £1.7bn)", or why there is no figure. */
function costLine(v: CardView, ctx: MdContext): string {
  const { config, w } = ctx;
  const cost = v.current.parameters?.cost;
  const text = cardCostText(v, config, w);
  return cost?.range ? `${text} (${w.t("cost.central", { value: costFacts(w, config, cost.range).central })})` : text;
}

/** One card in Markdown. `level` is its title's heading level: 1 for its own file, 2 inside llms-full.txt. */
export function cardMarkdown(v: CardView, ctx: MdContext, level: 1 | 2 = 1): string {
  const { config, w, today } = ctx;
  const L = w.locale;
  const h = (n: number) => "#".repeat(level + n);
  const p = paths(config);
  const f = v.card;
  const params = v.current.parameters;
  const url = absolute(config, p.card(v.id, L));
  const updated = lastUpdated(f, today);
  const role = pick(v.role, L, config);
  const speaker = [actorName(v.actor, L, config), role, v.party && v.party.id !== v.actor.id ? actorName(v.party, L, config) : null].filter(Boolean).join(", ");
  const said = [pick(f.venue_label, L, config), longDate(w, f.made_on)].filter(Boolean).join(", ");
  const q = quoteIn(v.current, L, config);
  const out: string[] = [];
  const line = (...xs: string[]) => out.push(...xs);
  const section = (title: string, body: string[]) => {
    if (body.length) line(`${h(1)} ${title}`, "", ...body, "");
  };

  line(`${h(0)} ${headline(v, L, config)}`, "", `> ${w.q(flat(q.text))}`, ...(q.translated ? [">", `> ${w.t("card.translation")}. ${w.t("card.original")}: ${w.q(flat(q.original))}`] : []), ">", `> — ${speaker}; ${said}`, "");
  const ladder = climb(config).map((s) => statusLabel(config, s, L));
  const offLadder = config.ladder.statuses.find((s) => s.id === f.status)?.category === "off_ladder";
  const metric = params?.metric;
  const measurement = f.links?.measurement;
  const deadline = params?.deadline;
  const facts: [string, string | null][] = [
    ["card.status", statusLabel(config, f.status, L)],
    ["card.status_ladder", offLadder ? null : ladder.join(" → ")],
    ["card.area", link(areaLabel(config, f.area, L), absolute(config, p.area(f.area, L)))],
    ["card.speaker", link(actorName(v.actor, L, config), absolute(config, p.actor(v.actor.id, L))) + (role ? `, ${role}` : "")],
    ["card.party", v.party && v.party.id !== v.actor.id ? link(actorName(v.party, L, config), absolute(config, p.actor(v.party.id, L))) : null],
    ["card.made_on", longDate(w, f.made_on)],
    ["card.where", pick(f.venue_label, L, config) ?? f.venue ?? null],
    ["card.deadline", deadline ? longDate(w, deadline) : null],
    ["cost.label", costLine(v, ctx)],
    ["cost.capital", params?.capital_cost ? costText(w, config, params.capital_cost, { period: "total" }) : null],
    [
      "card.target",
      metric
        ? `${metricText(metric, w)}${measurement ? `. ${w.t(`card.measurement.${measurement.status}`)}${measurement.since ? ` ${w.t("card.measurement_since", { date: longDate(w, measurement.since) })}` : ""}${measurement.note ? `: ${pick(measurement.note, L, config)}` : ""}` : ""}`
        : null,
    ],
    ["card.who", pick(params?.who, L, config) ?? null],
    ["card.when", pick(params?.when, L, config) ?? null],
    ["funding.label", params ? (pick(params.funded_by, L, config) ?? w.t("funding.not_stated_long")) : null],
    [
      "card.quote_source",
      `${v.current.source_url} (${[
        ...(v.current.archived_url ? [link(w.t("card.archive"), v.current.archived_url)] : []),
        v.current.quote_checked_on ? w.t("md.quote_checked", { date: longDate(w, v.current.quote_checked_on) }) : w.t("md.quote_not_checked"),
      ].join("; ")})`,
    ],
    ["card.updated", updated ? longDate(w, updated) : null],
    ["card.card", url],
  ];
  const label = (key: string) => w.t(key, { per: w.t(`per.${config.money.period}`) });
  line(...facts.filter(([, x]) => x).map(([k, x]) => `- **${flat(label(k))}:** ${flat(x!)}`), "");

  section(w.t("card.where_it_stands"), f.status_note ? [flat(pick(f.status_note, L, config)!)] : []);
  section(
    w.t("card.timeline"),
    [...f.events]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(
        (e) =>
          `- ${longDate(w, e.date)}, ${eventLabel(config, w, e.type, e.subtype)}${e.date > today ? ` (${w.t("card.to_come")})` : ""}: ${flat(pick(e.text, L, config) ?? "")}${
            e.evidence_url ? ` (${link(w.t("card.evidence"), e.evidence_url)})` : ""
          }`,
      ),
  );
  const cost = params?.cost;
  section(w.t("card.about_cost"), [
    ...(cost?.note ? [flat(pick(cost.note, L, config)!)] : []),
    ...(cost?.sources?.length ? ["", `${w.t("card.cost_sources")}:`, ...cost.sources.map((s) => `- ${link(s.title, s.url)}`)] : []),
  ]);
  section(
    w.t("card.replies"),
    (f.replies ?? []).map((r) => {
      const response = pick(r.editor_response, L, config);
      return `- ${longDate(w, r.date)}: ${flat(r.text)}${response ? ` ${w.t("card.editors_response", { text: flat(response) })}` : ""}`;
    }),
  );
  section(
    w.t("card.earlier_wording"),
    f.versions.length > 1
      ? f.versions.slice(0, -1).map((ver) => `- ${w.t("card.version", { n: ver.version, date: longDate(w, ver.recorded_on) })}: ${w.q(flat(quoteIn(ver, L, config).text))} (${link(w.t("card.source"), ver.source_url)})`)
      : [],
  );
  section(
    w.t("card.corrections"),
    (f.corrections ?? []).map(
      (c) =>
        `- ${w.t("card.corrected_on", { date: longDate(w, c.date), target: correctionTarget(c, f, config, w) })}. ${flat(pick(c.reason, L, config) ?? "")} ${w.t("card.was", {
          value: correctionValue(c, c.was, config, w),
        })}. ${w.t("card.now", { value: correctionValue(c, c.now, config, w) })}.${c.source_url ? ` (${link(w.t("card.source"), c.source_url)})` : ""}`,
    ),
  );
  section(w.t("card.sources"), (f.sources ?? []).map((s) => `- ${link(s.title, s.url)}`));
  section(
    w.t("card.checks"),
    [...(f.reviews ?? [])].reverse().map((r) =>
      r.kind === "editor" && r.approves
        ? `- ${w.t("card.approved_by", { by: r.by, date: longDate(w, r.on) })}${r.batch ? ` ${w.t("card.approved_batch")}` : ""}.`
        : `- ${w.t("card.reviewed_by", { by: r.by, kind: w.t(`card.review_kind.${r.kind}`), date: longDate(w, r.on) })}.`,
    ),
  );
  return `${out.join("\n").trimEnd()}\n`;
}

/** The licence note that ends every Markdown file. */
export function licenceMarkdown(ctx: MdContext): string {
  const { config, w } = ctx;
  const licence = config.publish.licence;
  return licence ? w.t("md.licence", { site: config.site.name, licence: link(licence.name, licence.url) }) : w.t("md.licence_none", { site: config.site.name });
}

/** <card>.md: one card, then the licence. */
export const cardMarkdownFile = (v: CardView, ctx: MdContext) => `${cardMarkdown(v, ctx, 1)}\n---\n\n${licenceMarkdown(ctx)}\n`;

/** How a card works, in short, for readers who have only the text. */
export function methodMarkdown(ctx: MdContext): string[] {
  const { config, w } = ctx;
  const ladder = climb(config).map((s) => statusLabel(config, s, w.locale));
  return [
    w.t("md.method.standard"),
    w.t("md.method.quote"),
    w.t("md.method.ladder", { ladder: ladder.join(" → ") }),
    w.t("md.method.cost"),
    w.t("md.method.history"),
    w.t("md.method.editors"),
  ].map((x) => `- ${x}`);
}

/** llms.txt: a short guide to the promises for AI assistants (llmstxt.org): what the site is, where everything is, every card. */
export function llmsTxt(views: readonly CardView[], ctx: MdContext): string {
  const { config, w } = ctx;
  const L = w.locale;
  const p = paths(config);
  const published = views.filter((v) => v.where === "promises");
  const feed = config.publish.feeds === "rss" ? "rss" : "atom";
  return [
    `# ${config.site.name}`,
    "",
    ...(config.site.description[L] ? [`> ${config.site.description[L]}`, ""] : []),
    ...methodMarkdown(ctx),
    "",
    `## ${w.t("llms.promises")}`,
    "",
    `- ${link(w.t("nav.promises"), absolute(config, p.promises(L)))}`,
    `- ${link(w.t("llms.full"), absolute(config, p.llmsFull(L)))}`,
    `- ${link(w.t("llms.feed_all"), absolute(config, p.feed("all", "", L, feed)))}`,
    `- ${link(w.t("llms.data_json"), absolute(config, p.data("json")))}`,
    `- ${link(w.t("llms.data_csv"), absolute(config, p.data("csv")))}`,
    "",
    `## ${w.t("llms.cards")}`,
    "",
    ...published.map((v) => `- ${link(headline(v, L, config), absolute(config, p.card(v.id, L)))}: ${actorName(v.actor, L, config)}, ${statusLabel(config, v.card.status, L)} (${link("Markdown", absolute(config, p.markdown(v.id, L)))})`),
    "",
  ].join("\n");
}

/** llms-full.txt: every published card in Markdown, after the method in short and the licence. */
export function llmsFull(views: readonly CardView[], ctx: MdContext): string {
  const { config, w } = ctx;
  const L = w.locale;
  const p = paths(config);
  const published = views.filter((v) => v.where === "promises");
  return [
    `# ${w.t("md.every_promise", { site: config.site.name })}`,
    "",
    ...(config.site.description[L] ? [`> ${config.site.description[L]}`, ""] : []),
    w.t("md.built", {
      n: published.length,
      mix: statusMix(published, config, w),
      date: longDate(w, ctx.today),
      page: absolute(config, p.card("<id>", L)).replace("%3Cid%3E", "<id>"),
      md: absolute(config, p.markdown("<id>", L)).replace("%3Cid%3E", "<id>"),
      llms: absolute(config, p.llms(L)),
    }),
    "",
    `## ${w.t("md.how_it_works")}`,
    "",
    ...methodMarkdown(ctx),
    "",
    `## ${w.t("md.licences")}`,
    "",
    licenceMarkdown(ctx),
    "",
    `## ${w.t("md.cards")}`,
    "",
    ...published.map((v) => `- ${link(headline(v, L, config), absolute(config, p.card(v.id, L)))}: ${actorName(v.actor, L, config)}, ${statusLabel(config, v.card.status, L)}`),
    "",
    ...published.flatMap((v) => ["---", "", cardMarkdown(v, ctx, 2)]),
  ].join("\n");
}

