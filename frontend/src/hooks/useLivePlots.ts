import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { LivePlots, PlotSummary } from "../api/types";

export type ConnectionState = "connecting" | "live" | "polling" | "down";

const POLL_MS = 5000;

const emptyLimits = { max_plots: 0, ttl_seconds: 0 };

/**
 * Keeps the live plot list in step with the server: a server-sent event
 * stream carries a revision number whenever the store changes, and we
 * re-fetch `/liveplots` when we see one we haven't handled. Falls back to
 * polling if EventSource is unavailable or the stream drops.
 */
export function useLivePlots() {
  const [plots, setPlots] = useState<PlotSummary[]>([]);
  const [limits, setLimits] = useState(emptyLimits);
  const [revision, setRevision] = useState(-1);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const refreshingRef = useRef<Promise<void> | null>(null);
  const sseHealthyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return refreshingRef.current;
    const run = (async () => {
      let payload: LivePlots;
      try {
        payload = await api.liveplots();
      } catch (err) {
        setConnection("down");
        setError(err instanceof Error ? err.message : "Could not reach the server");
        return;
      }
      setError(null);
      setConnection(sseHealthyRef.current ? "live" : "polling");
      setPlots(payload.plots);
      setLimits({ max_plots: payload.max_plots, ttl_seconds: payload.ttl_seconds });
      setRevision(payload.revision);
      setUpdatedAt(new Date());
    })();
    refreshingRef.current = run;
    try {
      await run;
    } finally {
      refreshingRef.current = null;
    }
  }, []);

  useEffect(() => {
    let pollTimer: number | undefined;
    const stopPolling = () => {
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };
    const startPolling = () => {
      if (pollTimer === undefined) pollTimer = window.setInterval(refresh, POLL_MS);
    };

    let source: EventSource | null = null;
    if ("EventSource" in window) {
      source = new EventSource("events");
      source.onopen = () => {
        sseHealthyRef.current = true;
        setConnection("live");
        stopPolling();
      };
      source.onmessage = (event) => {
        let nextRevision: number | null = null;
        try {
          nextRevision = (JSON.parse(event.data) as { revision: number }).revision;
        } catch {
          /* keep-alive or malformed - just refresh */
        }
        if (nextRevision === null || nextRevision !== revisionRef.current) void refresh();
      };
      source.onerror = () => {
        sseHealthyRef.current = false;
        setConnection("polling");
        startPolling(); // EventSource retries on its own; poll until it is back
      };
    } else {
      startPolling();
    }

    void refresh();

    return () => {
      source?.close();
      stopPolling();
    };
  }, [refresh]);

  return { plots, limits, revision, connection, error, updatedAt, refresh };
}
