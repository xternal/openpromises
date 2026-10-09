/**
 * Status ladders (RFC-0001 §7, decision 6). A site names its own statuses,
 * but every status belongs to one of four engine categories, so deadlines,
 * feeds and reviews work the same whatever the ladder is called.
 */

export const CATEGORIES = ["open", "progress", "finished", "off_ladder"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface LadderStatus {
  id: string;
  category: Category;
}

const s = (id: string, category: Category): LadderStatus => ({ id, category });

export const PRESETS = {
  national: [
    s("promised", "open"),
    s("in_plan", "progress"),
    s("legislated", "progress"),
    s("funded", "progress"),
    s("delivering", "progress"),
    s("delivered", "finished"),
    s("failed", "finished"),
    s("quietly_dropped", "finished"),
    s("unscoreable", "off_ladder"),
  ],
  local: [
    s("promised", "open"),
    s("in_plan", "progress"),
    s("budgeted", "progress"),
    s("delivering", "progress"),
    s("delivered", "finished"),
    s("failed", "finished"),
    s("quietly_dropped", "finished"),
    s("not_in_power", "off_ladder"),
    s("unscoreable", "off_ladder"),
  ],
} as const satisfies Record<string, readonly LadderStatus[]>;
export type Preset = keyof typeof PRESETS;

/** Event types that are not statuses. */
export const EVENT_TYPES = ["promised", "reworded", "restated", "deadline", "deadline_missed", "reply"] as const;

/** Status ids the rules give a meaning to. */
export const PROMISED = "promised";
export const UNSCOREABLE = "unscoreable";
export const NOT_IN_POWER = "not_in_power";

/** Neutral labels: they name a fact, never a verdict on a person (RFC-0001 §7). */
export const DEFAULT_LABELS: Record<string, Record<string, string>> = {
  en: {
    promised: "Promised",
    in_plan: "In plan",
    legislated: "Legislated",
    funded: "Funded",
    budgeted: "Budgeted",
    delivering: "Delivering",
    delivered: "Delivered",
    failed: "Not met",
    quietly_dropped: "Undone",
    not_in_power: "Not in power",
    unscoreable: "Unscoreable",
  },
  ru: {
    promised: "Обещано",
    in_plan: "В плане",
    legislated: "Закон принят",
    funded: "Профинансировано",
    budgeted: "В бюджете",
    delivering: "Выполняется",
    delivered: "Выполнено",
    failed: "Не выполнено",
    quietly_dropped: "Без продолжения",
    not_in_power: "Не у власти",
    unscoreable: "Нельзя оценить",
  },
};

/** The words of the automatic deadline_missed event, per language. */
export const DEFAULT_DEADLINE_TEXT: Record<string, string> = {
  en: "The deadline passed with no evidence of delivery recorded. An editor confirms or corrects this within 30 days.",
  ru: "Срок прошёл, а свидетельств выполнения не записано. Редактор подтверждает или исправляет это в течение 30 дней.",
};
