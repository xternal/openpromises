// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { filterOptions, filterWords, PromiseList } from "@openpromises/react";
import { PromiseFilter } from "@openpromises/react/client";
import { site } from "../../publish/test/helpers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PromiseFilter", () => {
  it("renders nothing without a script, then filters the list in place", async () => {
    const s = await site("borough-book");
    expect(renderToStaticMarkup(<PromiseFilter list="cards" {...filterOptions(s.views, s.config)} words={filterWords(s.config)} />)).toBe("");

    document.body.innerHTML = `<div id="filter"></div>${renderToStaticMarkup(<PromiseList views={s.views} config={s.config} today={s.today} id="cards" />)}`;
    const root = createRoot(document.getElementById("filter")!);
    await act(async () => root.render(<PromiseFilter list="cards" {...filterOptions(s.views, s.config)} words={filterWords(s.config)} />));
    const visible = () => [...document.querySelectorAll<HTMLElement>("[data-op-card]")].filter((r) => !r.hidden).length;
    expect(visible()).toBe(18);
    expect(document.querySelector("output")!.textContent).toBe("Showing 18 promises");

    const [status, , actor] = [...document.querySelectorAll("select")];
    await act(async () => {
      actor!.value = "conservative";
      actor!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(visible()).toBe(9);
    await act(async () => {
      status!.value = "in_plan";
      status!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(visible()).toBe(0);
    expect(document.querySelector("output")!.textContent).toBe("Showing 0 promises");
    await act(async () => root.unmount());
  });

  it("offers statuses in ladder order, and words in the reader's language", async () => {
    const s = await site("synthetic-bilingual");
    expect(filterOptions(s.views, s.config).statuses.map((o) => o.value)).toEqual(["promised", "in_plan", "legislated"]);
    expect(filterWords(s.config, "ru")).toMatchObject({ all: "Все", intl: "ru-RU", showing: { one: "Показано {n} обещание", few: "Показано {n} обещания" } });
  });
});
