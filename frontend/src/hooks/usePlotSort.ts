import { useMemo } from "react";
import type { PlotSummary } from "../api/types";
import { usePersistentState } from "./usePersistentState";

export interface SortOption {
  value: string;
  label: string;
}

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "points-desc", label: "Most points" },
  { value: "points-asc", label: "Fewest points" },
  { value: "file-asc", label: "File # low–high" },
  { value: "file-desc", label: "File # high–low" },
] as const satisfies readonly SortOption[];

export type SortOrder = (typeof SORT_OPTIONS)[number]["value"];

export const DEFAULT_SORT: SortOrder = "newest";

const isSortOrder = (value: unknown): value is SortOrder =>
  SORT_OPTIONS.some((option) => option.value === value);

/** Plots without a file number always sink to the bottom, whichever way the
 * file numbers themselves run. */
function compare(a: PlotSummary, b: PlotSummary, order: SortOrder): number {
  switch (order) {
    case "newest":
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    case "oldest":
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    case "name-asc":
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    case "name-desc":
      return b.name.localeCompare(a.name, undefined, { numeric: true });
    case "points-desc":
      return b.points - a.points;
    case "points-asc":
      return a.points - b.points;
    case "file-asc":
    case "file-desc": {
      if (a.filenumber === null || b.filenumber === null) {
        return (a.filenumber === null ? 1 : 0) - (b.filenumber === null ? 1 : 0);
      }
      return order === "file-asc" ? a.filenumber - b.filenumber : b.filenumber - a.filenumber;
    }
  }
}

export function sortPlots(plots: PlotSummary[], order: SortOrder): PlotSummary[] {
  return [...plots].sort((a, b) => compare(a, b, order) || a.id.localeCompare(b.id));
}

/** The list's sort order, remembered per browser. A stored value this build
 * no longer knows falls back to the default instead of leaving the list
 * unsorted. */
export function usePlotSort(plots: PlotSummary[]) {
  const [stored, setOrder] = usePersistentState<string>("sortOrder", DEFAULT_SORT);
  const order = isSortOrder(stored) ? stored : DEFAULT_SORT;
  const sorted = useMemo(() => sortPlots(plots, order), [plots, order]);
  return { order, setOrder, sorted };
}
