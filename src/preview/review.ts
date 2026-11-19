// The review's order and the owner's marks: every state x language x theme, one page each, in
// the order the index and the view page's bar walk them (language by language). Marks live in
// this browser's localStorage only.
import { LANGS, type Lang } from "@/lib/i18n";
import { STATES } from "./states";

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export type Mark = "ok" | "change";

export interface Cell {
  state: string;
  lang: Lang;
  theme: Theme;
}

export const ORDER: Cell[] = LANGS.flatMap((lang) =>
  STATES.flatMap((s) => THEMES.map((theme) => ({ state: s.id, lang, theme }))));

export const cellKey = (c: Cell) => `${c.state}|${c.lang}|${c.theme}`;

export const viewHref = (c: Cell, extra = "") =>
  `/states/view?s=${c.state}&lang=${c.lang}&theme=${c.theme}${extra}`;

const MARKS = "einkk.states-review";

export function readMarks(): Record<string, Mark> {
  try {
    return JSON.parse(localStorage.getItem(MARKS) ?? "{}") as Record<string, Mark>;
  } catch {
    return {};
  }
}

export function setMark(c: Cell, mark: Mark | null) {
  const marks = readMarks();
  if (mark) marks[cellKey(c)] = mark;
  else delete marks[cellKey(c)];
  try {
    localStorage.setItem(MARKS, JSON.stringify(marks));
  } catch {}
}
