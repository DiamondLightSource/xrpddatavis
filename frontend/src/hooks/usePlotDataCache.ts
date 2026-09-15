import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { PlotData, PlotSummary } from "../api/types";

interface CacheEntry {
  version: number;
  plot: PlotData;
}

/**
 * Fetches and caches the full arrays for whichever summaries are requested,
 * re-fetching only when the server says a plot's version changed. Entries
 * for plots no longer in `summaries` are dropped.
 */
export function usePlotDataCache(summaries: PlotSummary[]) {
  const cacheRef = useRef(new Map<string, CacheEntry>());
  const [, setTick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    const live = new Set(summaries.map((s) => s.id));
    for (const id of cacheRef.current.keys()) {
      if (!live.has(id)) cacheRef.current.delete(id);
    }

    const missing = summaries.filter((summary) => {
      const cached = cacheRef.current.get(summary.id);
      return (!cached || cached.version !== summary.version) && !inFlight.current.has(summary.id);
    });
    if (!missing.length) return;

    missing.forEach((summary) => inFlight.current.add(summary.id));
    void Promise.all(
      missing.map(async (summary) => {
        try {
          const plot = await api.plot(summary.id);
          cacheRef.current.set(summary.id, { version: plot.version, plot });
        } catch (err) {
          setLoadError(
            `Could not load "${summary.name}": ${err instanceof Error ? err.message : err}`,
          );
        } finally {
          inFlight.current.delete(summary.id);
        }
      }),
    ).then(() => setTick((t) => t + 1));
  }, [summaries]);

  const get = useCallback((id: string): PlotData | undefined => cacheRef.current.get(id)?.plot, []);

  return { get, loadError };
}
