import type { CSSProperties, ReactNode } from "react";
import { categoryOf, standingOf, statusLabel, type Actor, type Config } from "@openpromises/core";
import {
  actorName,
  actorShortName,
  areaLabel,
  cardStory,
  climb,
  comparisonLines,
  correctionTarget,
  correctionValue,
  costFacts,
  countedEditor,
  estimateWords,
  costText,
  eventLabel,
  headline,
  jsonLdText,
  lastUpdated,
  longDate,
  metricText,
  monthYear,
  ownerOf,
  paths,
  pick,
  reviewerName,
  quoteIn,
  shownComparisons,
  spotlight,
  statusMix,
  verificationText,
  wordDiff,
  words,
  type CardView,
  type JsonLd as JsonLdData,
  type Words,
} from "@openpromises/publish";

/**
 * Server components for promise pages (RFC-0001 §6): they render to plain
 * HTML with no hooks and no script, so a page reads without JavaScript, from
 * a static export or a file:// mirror. Folded detail uses <details>. Words
 * come from @openpromises/publish's catalogues, in the reader's language;
 * classes are op-*, styled by @openpromises/react/styles.css or by the site.
 */

export interface Base {
  config: Config;
  /** The reader's language; the site's default when left out. */
  locale?: string;
}

const lang = (b: Base) => b.locale ?? b.config.locales.default;
const ctx = (b: Base): { config: Config; L: string; w: Words } => ({ config: b.config, L: lang(b), w: words(b.config, lang(b)) });

/** A status as a pill: its label carries the meaning, the colour only repeats it. */
export function StatusPill({ status, ...b }: Base & { status: string }) {
  const { config, L } = ctx(b);
  const top = climb(config).at(-1) === status;
  return (
    <span className="op-pill" data-category={categoryOf(config, status) ?? "off_ladder"} data-status-top={top ? "true" : undefined}>
      {statusLabel(config, status, L)}
    </span>
  );
}

/** The status ladder, with the card's step marked (aria-current="step"); an ending (not met, undone) is named under it. */
export function Ladder({ view, ...b }: Base & { view: CardView }) {
  const { config, L, w } = ctx(b);
  const status = view.card.status;
  const label = statusLabel(config, status, L);
  if (categoryOf(config, status) === "off_ladder") {
    return (
      <div className="op-ladder">
        <p className="op-ladder__note">{status === "unscoreable" ? w.t("card.unscoreable") : label}</p>
      </div>
    );
  }
  const steps = climb(config);
  const at = steps.indexOf(status);
  return (
    <div className="op-ladder" style={{ "--op-steps": steps.length } as CSSProperties}>
      <ol aria-label={w.t("card.ladder", { status: label })}>
        {steps.map((s, i) => (
          <li key={s} aria-current={i === at ? "step" : undefined} data-passed={i < at ? "true" : undefined}>
            <span className="op-ladder__bar" aria-hidden="true" />
            <span className="op-ladder__label">{statusLabel(config, s, L)}</span>
          </li>
        ))}
      </ol>
      {at < 0 && <p className="op-ladder__end">{label}</p>}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="op-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="op-fact">
      <dt>{label}</dt>
      {children}
    </div>
  );
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="op-fold">
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

const Time = ({ iso, w }: { iso: string; w: Words }) => <time dateTime={iso}>{longDate(w, iso)}</time>;

export interface PromiseCardProps extends Base {
  view: CardView;
  /** The build or request day, YYYY-MM-DD: what "last updated" and "to come" are measured from. */
  today: string;
  /** Add a "Today" marker to the timeline. Leave it off for a static page that is not rebuilt daily. */
  markToday?: boolean;
  /** Up to three other cards to read next (relatedCards). */
  related?: readonly CardView[];
  /** The site's own actions (follow, share, add evidence), shown with the facts. */
  actions?: ReactNode;
  /** Sections for the site's modules (contracts, decisions), shown after the cost. */
  children?: ReactNode;
  /** Show how far the card has been verified (decision 23) beside the source; false to place <Verification> elsewhere. */
  verification?: boolean;
}

/**
 * What a card's cost compares with (decision 28): per person, per household,
 * a share of the site's total and the first units of the site's basket, then
 * a table of every comparison with its prices and source. Plain text and a
 * table, no chart. Nothing without a basket or a cost range.
 */
export function Comparisons({ view, ...b }: Base & { view: CardView }) {
  const { config, w } = ctx(b);
  const params = view.current.parameters;
  const lines = [...comparisonLines(params?.cost, config, w), ...comparisonLines(params?.capital_cost, config, w, { oneOff: true })];
  if (!lines.length) return null;
  return (
    <div className="op-compare">
      <ul>
        {shownComparisons(lines, config).map((l) => (
          <li key={`${l.comparison.kind}-${l.comparison.id}`}>{l.text}</li>
        ))}
      </ul>
      {params?.funding_verifiable === false && <p className="op-muted">{w.t("compare.unverifiable")}</p>}
      <details>
        <summary>{w.t("compare.title")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{w.t("compare.col.equal")}</th>
              <th scope="col">{w.t("compare.col.prices")}</th>
              <th scope="col">{w.t("compare.col.quality")}</th>
              <th scope="col">{w.t("compare.col.source")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={`${l.comparison.kind}-${l.comparison.id}`}>
                <td>{l.text}</td>
                <td>{l.comparison.year}</td>
                <td>{l.comparison.quality}</td>
                <td>
                  <a href={l.comparison.source.url} rel="noopener noreferrer">
                    {l.comparison.source.title}
                  </a>
                  {l.comparison.source.locator ? `, ${l.comparison.source.locator}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/**
 * A promise's whole story in one dated line (decision 29): the words as
 * first said, rewordings, events with their evidence, replies, cost changes,
 * corrections, and what is still to come. The same layout for every party;
 * nothing the card does not record. Made to stand on its own page, so it is
 * easy to share.
 */
export function PromiseStory({ view, today, headingLevel = 2, ...b }: Base & { view: CardView; today: string; headingLevel?: 2 | 3 }) {
  const { config, w } = ctx(b);
  const H = `h${headingLevel}` as const;
  const items = cardStory(view, config, w, today);
  return (
    <section className="op-story" aria-labelledby={`op-story-${view.id}`}>
      <H id={`op-story-${view.id}`}>{w.t("story.title")}</H>
      <ol>
        {items.map((i, n) => (
          <li key={n} className={`op-story__item op-story__item--${i.kind}`} data-to-come={i.toCome ? "true" : undefined}>
            <Time iso={i.date} w={w} />
            {i.toCome && <span className="op-muted"> ({w.t("card.to_come")})</span>}
            <strong className="op-story__label">{i.label}</strong>
            {i.quote && <blockquote>{i.quote}</blockquote>}
            {i.text && <p>{i.text}</p>}
            {i.link && (
              <a href={i.link} rel="noopener noreferrer">
                {w.t("story.link")}
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** How far a card has been verified, in words (decision 23): nothing when the views were made without the editors list. */
export function Verification({ view, ...b }: Base & { view: CardView }) {
  const { config, w } = ctx(b);
  const text = verificationText(view, config, w);
  return text ? <span className={`op-verified op-verified--${view.verification!.level}`}>{text}</span> : null;
}

/**
 * The full promise card, read in one pass: the promise and where it stands
 * first; beside it, the facts at a glance; then the story in order (where it
 * stands, timeline, cost, the site's own sections, replies); detail folded
 * last (sources, earlier wording, corrections, checks); then related cards.
 */
export function PromiseCard({ view, today, markToday, related = [], actions, children, verification = true, ...b }: PromiseCardProps) {
  const { config, L, w } = ctx(b);
  const p = paths(config);
  const f = view.card;
  const params = view.current.parameters;
  const q = quoteIn(view.current, L, config);
  const id = (part: string) => `op-${part}-${view.id}`;
  const updated = lastUpdated(f, today);
  const cost = params?.cost;
  const est = estimateWords(view, config, w);
  const facts = cost?.range ? costFacts(w, config, cost.range) : null;
  const deadline = params?.deadline;
  const whenText = pick(params?.when, L, config);
  const when = (whenText ? longDate(w, whenText) : undefined) ?? (deadline ? w.t("card.by_deadline", { date: longDate(w, deadline) }) : null);
  const funded = params ? pick(params.funded_by, L, config) : undefined;
  const approvers = [...new Set((f.reviews ?? []).filter((r) => r.kind === "editor" && r.approves).map((r) => reviewerName(config, r.by)))];
  const events = [
    ...f.events.map((e, i) => ({ key: `e${i}`, date: e.date, label: eventLabel(config, w, e.type, e.subtype), text: pick(e.text, L, config) ?? "", evidence: e.evidence_url, today: false })),
    ...(markToday ? [{ key: "today", date: today, label: w.t("card.today"), text: w.t("card.we_are_here"), evidence: undefined, today: true }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const venue = pick(f.venue_label, L, config);

  return (
    <article className="op-card" aria-labelledby={id("quote")}>
      <header className="op-card__head">
        {view.where === "drafts" && <p className="op-card__draft">{w.t("card.draft")}</p>}
        <p className="op-card__who">
          <a href={p.actor(view.actor.id, L)}>{actorName(view.actor, L, config)}</a>
          {view.party && view.party.id !== view.actor.id && (
            <>
              <span aria-hidden="true">·</span>
              <a href={p.actor(view.party.id, L)}>{actorName(view.party, L, config)}</a>
            </>
          )}
          <span aria-hidden="true">·</span>
          <a href={p.area(f.area, L)}>{areaLabel(config, f.area, L)}</a>
        </p>
        <p className="op-card__headline">{headline(view, L, config)}</p>
        <h1 id={id("quote")} className="op-card__quote" lang={q.lang}>
          {w.q(q.text)}
        </h1>
        {q.translated && (
          <p className="op-card__original">
            {w.t("card.translation")}. {w.t("card.original")}: <span lang={q.originalLang}>{w.q(q.original)}</span>
          </p>
        )}
        <p className="op-card__meta">
          <StatusPill status={f.status} config={config} locale={L} />
          {view.broughtAboutBy && (
            <span title={pick(f.brought_about_by?.note, L, config)}>
              {w.t("card.credit", { who: actorName(view.broughtAboutBy, L, config) })}
            </span>
          )}
          <span>
            {venue ? `${venue}, ` : ""}
            <Time iso={f.made_on} w={w} />
          </span>
          {/* Where the words come from, and the archived copy that keeps them if the page moves. */}
          <span>
            <a href={view.current.source_url} rel="noopener noreferrer">
              {w.t("card.source")}
            </a>
            {view.current.archived_url && (
              <>
                {" · "}
                <a href={view.current.archived_url} rel="noopener noreferrer">
                  {w.t("card.archive")}
                </a>
              </>
            )}
          </span>
          {!view.current.quote_checked_on && <span>{w.t("card.quote_not_checked")}</span>}
          {verification && <Verification view={view} {...b} />}
        </p>
        <Ladder view={view} config={config} locale={L} />
      </header>

      <div className="op-card__body">
        <aside className="op-card__aside" aria-labelledby={id("glance")}>
          <div className="op-glance">
            <h2 id={id("glance")}>{w.t("card.at_a_glance")}</h2>
            <dl>
              <Fact label={w.t(facts?.raises ? "cost.raises_short" : "cost.costs_short", { per: w.t(`per.${config.money.period}`) })}>
                {facts ? (
                  <>
                    <dd className="op-fact__figure">{facts.central}</dd>
                    <dd className="op-muted">{w.t("cost.range", { low: facts.low, high: facts.high })}</dd>
                    {cost?.by && <dd className="op-muted">{w.t("cost.made_by", { name: cost.by.name, kind: w.t(`cost.by.${cost.by.kind}`) })}</dd>}
                  </>
                ) : (
                  <dd>{costText(w, config, cost, { costable: params !== null })}</dd>
                )}
              </Fact>
              {params?.capital_cost && (
                <Fact label={w.t("cost.capital")}>
                  <dd>{costText(w, config, params.capital_cost, { period: "total" })}</dd>
                </Fact>
              )}
              {(["staff", "reached", "time"] as const).map((k) =>
                est[k] ? (
                  <Fact key={k} label={w.t(`estimate.${k}`)}>
                    <dd>{est[k]}</dd>
                  </Fact>
                ) : null,
              )}
              {est.path && (
                <Fact label={w.t("estimate.path")}>
                  <dd>{est.path}</dd>
                  <dd>
                    <ol className="op-steps">
                      {est.steps.map((s) => (
                        <li key={s.label} data-done={s.done ? "true" : undefined}>
                          {s.label} <span className="op-muted">({s.done ? w.t("estimate.step_done") : s.by ? w.t("estimate.step_by", { date: s.by }) : "…"})</span>
                        </li>
                      ))}
                    </ol>
                  </dd>
                </Fact>
              )}
              {params?.who && (
                <Fact label={w.t("card.who")}>
                  <dd>{pick(params.who, L, config)}</dd>
                </Fact>
              )}
              {when && (
                <Fact label={w.t("card.when")}>
                  <dd>{when}</dd>
                </Fact>
              )}
              {params?.metric && (
                <Fact label={w.t("card.target")}>
                  <dd>{metricText(params.metric, w)}</dd>
                  {f.links?.measurement && (
                    <dd className="op-muted">
                      {w.t(`card.measurement.${f.links.measurement.status}`)}
                      {f.links.measurement.since ? ` ${w.t("card.measurement_since", { date: longDate(w, f.links.measurement.since) })}` : ""}
                    </dd>
                  )}
                </Fact>
              )}
              {params && (
                <Fact label={w.t("funding.label")}>
                  <dd>{funded ?? <strong>{w.t("funding.not_stated_long")}</strong>}</dd>
                  {params.funding_verifiable === false && <dd className="op-muted">{w.t("funding.unverifiable")}</dd>}
                </Fact>
              )}
            </dl>
            {actions}
          </div>
          {!view.verification && approvers.length > 0 && <p className="op-card__small">{w.t("card.approvals", { names: approvers.join(", ") })}</p>}
          {updated && (
            <p className="op-card__small">
              {w.t("card.updated")} <Time iso={updated} w={w} />
            </p>
          )}
        </aside>

        <div className="op-card__main">
          {f.status_note && (
            <Section id={id("stands")} title={w.t("card.where_it_stands")}>
              <p>{pick(f.status_note, L, config)}</p>
            </Section>
          )}

          <Section id={id("timeline")} title={w.t("card.timeline")}>
            <ol className="op-timeline">
              {events.map((e) => (
                <li key={e.key} data-today={e.today ? "true" : undefined} data-future={!e.today && e.date > today ? "true" : undefined}>
                  <span className="op-timeline__date">{e.today ? w.t("card.today") : <Time iso={e.date} w={w} />}</span>
                  <span className="op-timeline__dot" aria-hidden="true" />
                  <span>
                    {!e.today && <span className="op-timeline__label">{e.label}. </span>}
                    {e.text}
                    {!e.today && e.date > today && <span className="op-muted"> ({w.t("card.to_come")})</span>}
                    {e.evidence && (
                      <>
                        {" "}
                        <a href={e.evidence} rel="noopener noreferrer">
                          {w.t("card.evidence")}
                        </a>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          {(cost?.note || cost?.method || cost?.sources?.length) && (
            <Section id={id("cost")} title={w.t("card.about_cost")}>
              {cost.note && <p>{pick(cost.note, L, config)}</p>}
              {cost.method && (
                <p>
                  <strong>{w.t("card.cost_method")}:</strong> {pick(cost.method, L, config)}
                </p>
              )}

          {config.comparisons && (cost?.range || params?.capital_cost?.range) && (
            <Section id={id("compare")} title={w.t("compare.title")}>
              <Comparisons view={view} config={config} locale={L} />
            </Section>
          )}
              {cost.sources?.length ? (
                <ul className="op-links" aria-label={w.t("card.cost_sources")}>
                  {cost.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} rel="noopener noreferrer">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Section>
          )}

          {children}

          {(f.replies?.length ?? 0) > 0 && (
            <Section id={id("replies")} title={w.t("card.replies")}>
              {f.replies!.map((r, i) => {
                const response = pick(r.editor_response, L, config);
                return (
                  <blockquote key={i} className="op-reply" lang={r.lang ?? undefined}>
                    <span className="op-muted">
                      <Time iso={r.date} w={w} />
                    </span>
                    <span>{r.text}</span>
                    {response && <span className="op-muted">{w.t("card.editors_response", { text: response })}</span>}
                  </blockquote>
                );
              })}
            </Section>
          )}

          <Section id={id("more")} title={w.t("card.more")}>
            <div>
              {(f.sources?.length ?? 0) > 0 && (
                <Fold title={`${w.t("card.sources")} (${f.sources!.length})`}>
                  <ul className="op-links">
                    {f.sources!.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} rel="noopener noreferrer">
                          {s.title}
                        </a>
                        {s.archived_url && (
                          <>
                            {" · "}
                            <a href={s.archived_url} rel="noopener noreferrer">
                              {w.t("card.archive")}
                            </a>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </Fold>
              )}
              {f.versions.length > 1 && (
                <Fold title={`${w.t("card.earlier_wording")} (${f.versions.length - 1})`}>
                  <ol>
                    {[...f.versions].reverse().map((ver, i, all) => {
                      const older = all[i + 1];
                      const text = quoteIn(ver, L, config);
                      return (
                        <li key={ver.version}>
                          <span className="op-muted">{w.t("card.version", { n: ver.version, date: longDate(w, ver.recorded_on) })}</span>
                          <span className="op-diff" lang={text.lang}>
                            {older
                              ? wordDiff(quoteIn(older, L, config).text, text.text).map((d, k) =>
                                  d.kind === "same" ? <span key={k}>{d.text} </span> : d.kind === "removed" ? <del key={k}>{d.text} </del> : <ins key={k}>{d.text} </ins>,
                                )
                              : text.text}
                          </span>
                          {ver.parameters?.cost?.range && <span className="op-muted">{w.t("cost.then", { cost: costText(w, config, ver.parameters.cost) })}</span>}
                        </li>
                      );
                    })}
                  </ol>
                </Fold>
              )}
              {(f.corrections?.length ?? 0) > 0 && (
                <Fold title={`${w.t("card.corrections")} (${f.corrections!.length})`}>
                  <ol>
                    {f.corrections!.map((c, i) => (
                      <li key={i}>
                        <span className="op-muted">{w.t("card.corrected_on", { date: longDate(w, c.date), target: correctionTarget(c, f, config, w) })}</span>
                        <span>{pick(c.reason, L, config)}</span>
                        <span className="op-muted">{w.t("card.was", { value: correctionValue(c, c.was, config, w) })}</span>
                        <span className="op-muted">{w.t("card.now", { value: correctionValue(c, c.now, config, w) })}</span>
                        {c.source_url && (
                          <a href={c.source_url} rel="noopener noreferrer">
                            {w.t("card.correction_source")}
                          </a>
                        )}
                      </li>
                    ))}
                  </ol>
                </Fold>
              )}
              <Fold title={w.t("card.checks")}>
                <ul className="op-links">
                  {f.versions.map((ver) =>
                    ver.quote_checked_on ? (
                      <li key={`q${ver.version}`}>
                        {w.t("card.version", { n: ver.version, date: longDate(w, ver.recorded_on) })}: {w.t("card.quote_checked", { date: longDate(w, ver.quote_checked_on) })}
                      </li>
                    ) : null,
                  )}
                  {[...(f.reviews ?? [])].reverse().map((r, i) => (
                    <li key={`r${i}`}>
                      {r.kind === "editor" && r.approves
                        ? `${countedEditor(view, r.by) ? w.t("card.approved_by_counted", { date: longDate(w, r.on) }) : w.t("card.approved_by", { by: reviewerName(config, r.by), date: longDate(w, r.on) })}${r.batch ? ` ${w.t("card.approved_batch")}` : ""}`
                        : w.t("card.reviewed_by", { by: reviewerName(config, r.by), kind: w.t(`card.review_kind.${r.kind}`), date: longDate(w, r.on) })}
                      {r.note ? `: ${pick(r.note, L, config)}` : ""}
                    </li>
                  ))}
                </ul>
              </Fold>
            </div>
          </Section>

          {related.length > 0 && (
            <Section id={id("related")} title={w.t("card.related")}>
              <PromiseList views={related} config={config} locale={L} today={today} />
              <p>
                <a href={p.area(f.area, L)}>{w.t("card.every_in_area", { area: areaLabel(config, f.area, L) })}</a>
              </p>
            </Section>
          )}
        </div>
      </div>
    </article>
  );
}

export interface PromiseListProps extends Base {
  views: readonly CardView[];
  today: string;
  /** Every actor, so each row can say where its party stands (in power, in opposition). */
  actors?: ReadonlyMap<string, Actor>;
  /** An id for the list, so a PromiseFilter can find it. */
  id?: string;
  empty?: string;
}

/**
 * Cards as a list of links to their pages, one row each: who made it (and
 * where they stand), then the promise in their words with its status, area,
 * cost and deadline. Each row carries data-status, data-area and data-actor
 * for PromiseFilter.
 */
export function PromiseList({ views, today, actors, id, empty, ...b }: PromiseListProps) {
  const { config, L, w } = ctx(b);
  const p = paths(config);
  if (!views.length) return <p className="op-empty">{empty ?? w.t("list.empty")}</p>;
  return (
    <ul className="op-list" id={id}>
      {views.map((v) => {
        const owner = ownerOf(v);
        const standing = actors ? standingOf(v.actor.id, actors, config) : undefined;
        const deadline = v.current.parameters?.deadline;
        const open = ["open", "progress"].includes(categoryOf(config, v.card.status) ?? "");
        return (
          <li key={v.id} data-op-card="" data-status={v.card.status} data-area={v.card.area} data-actor={[...new Set([v.actor.id, ...(v.party ? [v.party.id] : [])])].join(" ")}>
            <a className="op-row" href={p.card(v.id, L)}>
              <span className="op-row__who">
                <span className="op-row__owner">{actorShortName(owner, L, config)}</span>
                {standing && <span className="op-muted">{w.t(`standing.${standing}`)}</span>}
              </span>
              <span className="op-row__body">
                {v.card.headline && <span className="op-row__headline">{pick(v.card.headline, L, config)}</span>}
                <span className="op-row__quote" lang={quoteIn(v.current, L, config).lang}>
                  {w.q(quoteIn(v.current, L, config).text)}
                </span>
                <span className="op-row__meta">
                  <StatusPill status={v.card.status} config={config} locale={L} />
                  <span>{areaLabel(config, v.card.area, L)}</span>
                  <span>{costText(w, config, v.current.parameters?.cost, { costable: v.current.parameters !== null })}</span>
                  {deadline &&
                    (open && deadline < today ? (
                      <span className="op-row__late">{w.t("list.deadline_passed", { date: monthYear(w, deadline) })}</span>
                    ) : (
                      <span>{w.t("list.due", { date: monthYear(w, deadline) })}</span>
                    ))}
                  <span>
                    {v.actor.kind === "person" ? `${actorName(v.actor, L, config)}, ` : ""}
                    {longDate(w, v.card.made_on)}
                  </span>
                </span>
                <span className="op-row__open" aria-hidden="true">
                  {w.t("list.open")} →
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Promises for the first screen (decision 30): how many and where they
 * stand, the latest changes and what is due next, each a link straight to
 * its card, then a link to them all. Chosen by rule (spotlight() in
 * @openpromises/publish), the same for every party. Place it high on the
 * home page, after the site's own opening.
 */
export function PromiseSpotlight({ views, today, recent = 3, due = 3, actors, ...b }: Base & { views: readonly CardView[]; today: string; recent?: number; due?: number; actors?: ReadonlyMap<string, Actor> }) {
  const { config, L, w } = ctx(b);
  const p = paths(config);
  const s = spotlight(views, config, today, { recent, due });
  if (!s.total) return null;
  const headingId = "op-spotlight";
  return (
    <section className="op-spotlight" aria-labelledby={headingId}>
      <h2 id={headingId}>{w.t("spotlight.title")}</h2>
      <p className="op-spotlight__count">
        <a href={p.promises(L)}>{w.n("spotlight.count", s.total)}</a>: {statusMix(views.filter((v) => v.where === "promises"), config, w)}
      </p>
      {s.recent.length > 0 && (
        <>
          <h3>{w.t("spotlight.recent")}</h3>
          <PromiseList views={s.recent} today={today} config={config} locale={L} {...(actors ? { actors } : {})} />
        </>
      )}
      {s.due.length > 0 && (
        <>
          <h3>{w.t("spotlight.due")}</h3>
          <PromiseList views={s.due} today={today} config={config} locale={L} {...(actors ? { actors } : {})} />
        </>
      )}
      <p className="op-spotlight__all">
        <a href={p.promises(L)}>{w.t("spotlight.all")} →</a>
      </p>
    </section>
  );
}

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
function monthEnd(iso: string, months: number): string {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  const end = new Date(Date.UTC(y, m - 1 + months, 0));
  return end.toISOString().slice(0, 10);
}

/**
 * "Coming up": open promises due from the start of this month for `months`
 * months, nearest deadline first. Drawn for `today`; a static page shows the
 * build day's list.
 */
export function ComingUp({ views, today, months = 12, limit = 10, ...b }: Base & { views: readonly CardView[]; today: string; months?: number; limit?: number }) {
  const { config, L, w } = ctx(b);
  const p = paths(config);
  const from = monthStart(today);
  const to = monthEnd(today, months);
  const due = views
    .filter((v) => v.where === "promises" && ["open", "progress"].includes(categoryOf(config, v.card.status) ?? ""))
    .map((v) => ({ v, deadline: v.current.parameters?.deadline ?? null }))
    .filter((x): x is { v: CardView; deadline: string } => !!x.deadline && x.deadline >= from && x.deadline <= to)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || (a.v.id < b.v.id ? -1 : 1));
  const span = w.t("coming.window", { from: monthYear(w, from), to: monthYear(w, to) });
  const headingId = `op-coming-${from}`;
  return (
    <section className="op-coming" aria-labelledby={headingId}>
      <h2 id={headingId}>{w.t("coming.title")}</h2>
      <p>{due.length ? w.n("coming.count", due.length, { when: span }) : w.t("coming.none", { when: span })}</p>
      {due.length > 0 && (
        <ol>
          {due.slice(0, limit).map(({ v, deadline }) => (
            <li key={v.id}>
              <a className="op-due" href={p.card(v.id, L)}>
                <span className="op-due__date" data-late={deadline < today ? "true" : undefined}>
                  <time dateTime={deadline}>{longDate(w, deadline)}</time>
                  {deadline < today && <span className="op-sr-only">, {w.t("event.deadline_missed")}</span>}
                </span>
                <span>
                  {headline(v, L, config)} <span className="op-muted">({actorShortName(ownerOf(v), L, config)})</span> <StatusPill status={v.card.status} config={config} locale={L} />
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** A breadcrumb trail; the last item is the page the reader is on (aria-current="page"). */
export function Breadcrumbs({ items, ...b }: Base & { items: readonly { name: string; href: string }[] }) {
  const { w } = ctx(b);
  return (
    <nav className="op-crumbs" aria-label={w.t("nav.breadcrumb")}>
      <ol>
        {items.map((it, i) => (
          <li key={it.href}>
            {i === items.length - 1 ? (
              <span aria-current="page">{it.name}</span>
            ) : (
              <a href={it.href}>{it.name}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Every actor with published cards, with how many, linking to their pages; the one being read is marked (aria-current="page"). */
export function ActorIndex({ views, current, ...b }: Base & { views: readonly CardView[]; current?: string }) {
  const { config, L, w } = ctx(b);
  const p = paths(config);
  const counts = new Map<string, { actor: Actor; n: number }>();
  for (const v of views.filter((x) => x.where === "promises")) {
    const o = ownerOf(v);
    counts.set(o.id, { actor: o, n: (counts.get(o.id)?.n ?? 0) + 1 });
  }
  const items = [...counts.values()].sort((a, b) => b.n - a.n || actorName(a.actor, L, config).localeCompare(actorName(b.actor, L, config), w.m.intl));
  return (
    <nav className="op-index" aria-label={w.t("nav.actors")}>
      <ul>
        {items.map(({ actor, n }) => (
          <li key={actor.id}>
            <a href={p.actor(actor.id, L)} aria-current={current === actor.id ? "page" : undefined}>
              {actorName(actor, L, config)}
            </a>{" "}
            <span className="op-muted">{n}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Every area with published cards, with how many, linking to its page; the one being read is marked (aria-current="page"). */
export function AreaIndex({ views, current, ...b }: Base & { views: readonly CardView[]; current?: string }) {
  const { config, L, w } = ctx(b);
  const p = paths(config);
  const counts = new Map<string, number>();
  for (const v of views.filter((x) => x.where === "promises")) counts.set(v.card.area, (counts.get(v.card.area) ?? 0) + 1);
  const items = [...counts].sort((a, b) => areaLabel(config, a[0], L).localeCompare(areaLabel(config, b[0], L), w.m.intl));
  return (
    <nav className="op-index" aria-label={w.t("nav.areas")}>
      <ul>
        {items.map(([area, n]) => (
          <li key={area}>
            <a href={p.area(area, L)} aria-current={current === area ? "page" : undefined}>
              {areaLabel(config, area, L)}
            </a>{" "}
            <span className="op-muted">{n}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Structured data in a <script type="application/ld+json">, safe from "</script>" in any text. */
export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />;
}
