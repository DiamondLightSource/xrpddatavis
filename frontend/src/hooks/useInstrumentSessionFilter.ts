import { useEffect, useMemo } from "react";
import type { PlotSummary } from "../api/types";
import { usePersistentState } from "./usePersistentState";

export const ALL_SESSIONS = "__all_sessions__";

export interface SessionOption {
  value: string;
  label: string;
  count: number;
}

/**
 * The instrument-session picker in the title bar - a global scope selector,
 * upstream of the sidebar's Type/File # facets (see App.tsx), rather than
 * another facet alongside them. Computed from whatever plots are actually
 * live, same as those facets: the picker only exists while at least one
 * plot has a resolvable session (see DataPlot.get_instrument_session on the
 * server), and resets itself if the chosen session stops being live.
 */
export function useInstrumentSessionFilter(plots: PlotSummary[]) {
  const [session, setSession] = usePersistentState<string>("instrumentSession", ALL_SESSIONS);

  const options = useMemo<SessionOption[]>(() => {
    const counts = new Map<string, number>();
    for (const plot of plots) {
      if (plot.instrument_session) {
        counts.set(plot.instrument_session, (counts.get(plot.instrument_session) ?? 0) + 1);
      }
    }
    if (!counts.size) return [];
    const options: SessionOption[] = [{ value: ALL_SESSIONS, label: "All sessions", count: plots.length }];
    [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([value, count]) => options.push({ value, label: value, count }));
    return options;
  }, [plots]);

  useEffect(() => {
    if (options.length && !options.some((o) => o.value === session)) setSession(ALL_SESSIONS);
    if (!options.length && session !== ALL_SESSIONS) setSession(ALL_SESSIONS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const filtered = useMemo(
    () => (session === ALL_SESSIONS ? plots : plots.filter((p) => p.instrument_session === session)),
    [plots, session],
  );

  return { session, setSession, options, filtered };
}
