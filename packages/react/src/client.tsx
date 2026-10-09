import { useEffect, useState } from "react";

/**
 * The one client part: a filter over a PromiseList already on the page. It
 * appears only once the script runs; without it, readers see the whole list
 * (and the area and actor pages it links to). It shows and hides rows by
 * their data-status, data-area and data-actor; nothing is fetched or stored.
 */

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterWords {
  label: string;
  all: string;
  status: string;
  area: string;
  actor: string;
  /** "Showing {n} promises" in each plural form the language has, and its Intl locale. */
  showing: Record<string, string>;
  intl: string;
}

export interface PromiseFilterProps {
  /** The id of the PromiseList to filter. */
  list: string;
  statuses: FilterOption[];
  areas: FilterOption[];
  actors: FilterOption[];
  words: FilterWords;
}

export function PromiseFilter({ list, statuses, areas, actors, words }: PromiseFilterProps) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const [area, setArea] = useState("");
  const [actor, setActor] = useState("");
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    const rows = document.getElementById(list)?.querySelectorAll<HTMLElement>("[data-op-card]") ?? [];
    let n = 0;
    rows.forEach((row) => {
      const match =
        (!status || row.dataset.status === status) && (!area || row.dataset.area === area) && (!actor || (row.dataset.actor ?? "").split(" ").includes(actor));
      row.hidden = !match;
      if (match) n++;
    });
    setShown(n);
  }, [list, status, area, actor]);

  if (!ready) return null;
  const rule = new Intl.PluralRules(words.intl).select(shown ?? 0);
  const showing = (words.showing[rule] ?? words.showing.other ?? "{n}").replace("{n}", String(shown ?? 0));
  const select = (label: string, value: string, set: (v: string) => void, options: FilterOption[]) => (
    <label>
      {label}
      <select value={value} onChange={(e) => set(e.target.value)}>
        <option value="">{words.all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form className="op-filter" role="search" aria-label={words.label} aria-controls={list} onSubmit={(e) => e.preventDefault()}>
      {statuses.length > 1 && select(words.status, status, setStatus, statuses)}
      {areas.length > 1 && select(words.area, area, setArea, areas)}
      {actors.length > 1 && select(words.actor, actor, setActor, actors)}
      <output aria-live="polite">{showing}</output>
    </form>
  );
}
