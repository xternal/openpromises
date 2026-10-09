import type { Actor, Config } from "@openpromises/core";
import type { Words } from "./messages";
import { absolute, paths } from "./urls";
import { actorName, actorShortName, areaLabel, cardDescription, cardTitle, headline, lastUpdated, pick, type CardView } from "./view";

/**
 * schema.org structured data (JSON-LD): facts only, never rating markup (no
 * ClaimReview), so search engines show what was promised and where it stands,
 * not a verdict. Builders return plain objects; jsonLdScript prints one.
 */

export type JsonLd = Record<string, unknown>;

const CONTEXT = "https://schema.org";

export interface LdContext {
  config: Config;
  w: Words;
  today: string;
}

const website = ({ config }: LdContext) => ({ "@type": "WebSite", "@id": absolute(config, "/#website"), name: config.site.name, url: absolute(config, "/") });
const organisation = ({ config }: LdContext) => ({ "@type": "Organization", "@id": absolute(config, "/#organization"), name: config.site.name, url: absolute(config, "/") });

const areaThing = (area: string, ctx: LdContext) => ({ "@type": "Thing", name: areaLabel(ctx.config, area, ctx.w.locale), url: absolute(ctx.config, paths(ctx.config).area(area, ctx.w.locale)) });

/**
 * Official pages that identify an actor (schema.org sameAs): pages made from
 * its outside ids where the configuration gives a URL template for the id
 * ("https://members.parliament.uk/member/{id}"), then the pages an editor
 * checked (same_as). Nothing is guessed.
 */
export function actorSameAs(a: Actor, config: Config): string[] {
  const fromIds = Object.entries(a.identifiers ?? {}).flatMap(([key, value]) => {
    const template = config.actors.ids?.[key];
    return template && /^https?:\/\/.*\{id\}/.test(template) ? [template.replace("{id}", encodeURIComponent(String(value)))] : [];
  });
  return [...fromIds, ...(a.same_as ?? [])];
}

/** An actor as a Person, Organization or GovernmentOrganization, with its page and official pages; a person carries their party. */
export function actorEntity(a: Actor, party: Actor | null, ctx: LdContext, opts: { jobTitle?: boolean } = {}): JsonLd {
  const { config, w } = ctx;
  const sameAs = actorSameAs(a, config);
  const url = absolute(config, paths(config).actor(a.id, w.locale));
  const base = {
    "@id": `${url}#${a.kind === "person" ? "person" : "organization"}`,
    name: actorName(a, w.locale, config),
    ...(a.short_name ? { alternateName: actorShortName(a, w.locale, config) } : {}),
    url,
    ...(sameAs.length ? { sameAs } : {}),
  };
  if (a.kind !== "person") return { "@type": a.kind === "government" ? "GovernmentOrganization" : "Organization", ...base };
  const roles = opts.jobTitle
    ? (a.roles ?? []).filter((r) => (!r.from || r.from <= ctx.today) && (!r.to || r.to >= ctx.today)).map((r) => pick(r.title, w.locale, config)!)
    : [];
  return {
    "@type": "Person",
    ...base,
    ...(roles.length ? { jobTitle: roles.length === 1 ? roles[0] : roles } : {}),
    ...(party && party.id !== a.id ? { affiliation: actorEntity(party, null, ctx) } : {}),
  };
}

const crumbs = (items: { name: string; path: string }[], ctx: LdContext): JsonLd => ({
  "@context": CONTEXT,
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absolute(ctx.config, it.path) })),
});

/** The newest last-updated day among some cards. */
export const latestUpdate = (views: readonly CardView[], today: string) =>
  views
    .map((v) => lastUpdated(v.card, today))
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

/**
 * A promise card: an Article about its area, whose main entity is the promise
 * as a Quotation by its speaker; and the breadcrumb site › promises › area › card.
 */
export function cardJsonLd(v: CardView, ctx: LdContext): JsonLd[] {
  const { config, w } = ctx;
  const p = paths(config);
  const path = p.card(v.id, w.locale);
  const url = absolute(config, path);
  const area = areaThing(v.card.area, ctx);
  const updated = lastUpdated(v.card, ctx.today);
  const first = v.card.versions[0]!;
  const said = v.current;
  return [
    {
      "@context": CONTEXT,
      "@type": "Article",
      "@id": url,
      url,
      headline: headline(v, w.locale, config),
      name: cardTitle(v, config, w).social,
      description: cardDescription(v, config, w),
      inLanguage: w.m.intl,
      isPartOf: website(ctx),
      datePublished: first.recorded_on,
      ...(updated ? { dateModified: updated } : {}),
      author: organisation(ctx),
      publisher: organisation(ctx),
      about: area,
      ...(config.publish.licence ? { license: config.publish.licence.url } : {}),
      mainEntity: {
        "@type": "Quotation",
        text: said.text,
        inLanguage: said.lang ?? config.locales.default,
        spokenByCharacter: actorEntity(v.actor, v.party, ctx),
        dateCreated: v.card.made_on,
        about: area,
        isBasedOn: said.source_url,
        ...(v.card.sources?.length ? { citation: v.card.sources.map((s) => s.url) } : {}),
      },
    },
    crumbs(
      [
        { name: config.site.name, path: config.site.localePaths[w.locale] || "/" },
        { name: w.t("nav.promises"), path: p.promises(w.locale) },
        { name: areaLabel(config, v.card.area, w.locale), path: p.area(v.card.area, w.locale) },
        { name: headline(v, w.locale, config), path },
      ],
      ctx,
    ),
  ];
}

/** An ItemList of cards, named by their headlines, in the order the page shows them. */
export function cardItemList(views: readonly CardView[], ctx: LdContext): JsonLd {
  const { config, w } = ctx;
  return {
    "@type": "ItemList",
    numberOfItems: views.length,
    itemListElement: views.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absolute(config, paths(config).card(v.id, w.locale)),
      name: `${headline(v, w.locale, config)} (${actorShortName(v.actor, w.locale, config)})`,
    })),
  };
}

export interface CollectionInput {
  path: string;
  name: string;
  description: string;
  views: readonly CardView[];
  /** The trail above this page, after the site itself. */
  breadcrumb?: { name: string; path: string }[];
  about?: JsonLd;
}

/** A page that lists cards (all promises, an area): a CollectionPage whose main entity is the list. */
export function collectionJsonLd(input: CollectionInput, ctx: LdContext): JsonLd[] {
  const url = absolute(ctx.config, input.path);
  const updated = latestUpdate(input.views, ctx.today);
  return [
    {
      "@context": CONTEXT,
      "@type": "CollectionPage",
      "@id": url,
      url,
      name: input.name,
      description: input.description,
      inLanguage: ctx.w.m.intl,
      isPartOf: website(ctx),
      ...(updated ? { dateModified: updated } : {}),
      ...(input.about ? { about: input.about } : {}),
      mainEntity: cardItemList(input.views, ctx),
    },
    ...(input.breadcrumb ? [crumbs([{ name: ctx.config.site.name, path: ctx.config.site.localePaths[ctx.w.locale] || "/" }, ...input.breadcrumb], ctx)] : []),
  ];
}

/** An actor's page: a ProfilePage about the person or organisation, and its breadcrumb. */
export function actorJsonLd(a: Actor, party: Actor | null, views: readonly CardView[], ctx: LdContext): JsonLd[] {
  const { config, w } = ctx;
  const p = paths(config);
  const path = p.actor(a.id, w.locale);
  const url = absolute(config, path);
  const updated = latestUpdate(views, ctx.today);
  return [
    {
      "@context": CONTEXT,
      "@type": "ProfilePage",
      "@id": url,
      url,
      name: w.t("title.actor", { who: actorName(a, w.locale, config) }),
      inLanguage: w.m.intl,
      isPartOf: website(ctx),
      ...(updated ? { dateModified: updated } : {}),
      mainEntity: actorEntity(a, party, ctx, { jobTitle: true }),
    },
    crumbs(
      [
        { name: config.site.name, path: config.site.localePaths[w.locale] || "/" },
        { name: w.t("nav.promises"), path: p.promises(w.locale) },
        { name: actorName(a, w.locale, config), path },
      ],
      ctx,
    ),
  ];
}

/** JSON-LD as the text of a <script type="application/ld+json">, safe to put in HTML: "<" never closes the script. */
export const jsonLdText = (data: JsonLd | JsonLd[]) => JSON.stringify(data).replace(/</g, "\\u003c");
