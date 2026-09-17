import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Config, Data, Layout } from "plotly.js";

export interface PlotlyChartHandle {
  resetView: () => void;
  resize: () => void;
}

interface PlotlyChartProps {
  traces: Data[];
  layout: Partial<Layout>;
  /** Shown instead of the plot - e.g. "nothing selected" or a load error. */
  overlay?: React.ReactNode;
}

const CONFIG: Partial<Config> = {
  responsive: true,
  displaylogo: false,
  scrollZoom: true,
  modeBarButtonsToRemove: ["select2d", "lasso2d"],
  toImageButtonOptions: { filename: "xrpddatavis", scale: 2 },
};

/**
 * A thin React wrapper around the global `Plotly` loaded from cdnjs (see
 * index.html) - kept out of the bundle since it is ~1MB. `Plotly.react` is
 * used throughout so redraws diff against the previous state rather than
 * tearing the plot down each time.
 */
export const PlotlyChart = forwardRef<PlotlyChartHandle, PlotlyChartProps>(
  ({ traces, layout, overlay }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      resetView: () => {
        const Plotly = window.Plotly;
        const node = containerRef.current;
        if (!Plotly || !node) return;
        const gd = node as unknown as { layout?: Record<string, unknown> };
        const axisKeys = Object.keys(gd.layout ?? {}).filter((key) => /^[xy]axis\d*$/.test(key));
        const update: Record<string, boolean> = {};
        for (const key of axisKeys.length ? axisKeys : ["xaxis", "yaxis"]) {
          update[`${key}.autorange`] = true;
        }
        void Plotly.relayout(node, update);
      },
      resize: () => {
        const Plotly = window.Plotly;
        const node = containerRef.current;
        if (!Plotly || !node) return;
        Plotly.Plots.resize(node);
      },
    }));

    useEffect(() => {
      const Plotly = window.Plotly;
      const node = containerRef.current;
      if (!Plotly || !node) return;
      if (overlay || !traces.length) {
        Plotly.purge(node);
        return;
      }
      void Plotly.react(node, traces, layout, CONFIG);
    }, [traces, layout, overlay]);

    useEffect(() => {
      const node = containerRef.current;
      return () => {
        if (window.Plotly && node) window.Plotly.purge(node);
      };
    }, []);

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {overlay && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 24,
              pointerEvents: "none",
            }}
          >
            {overlay}
          </div>
        )}
      </div>
    );
  },
);
PlotlyChart.displayName = "PlotlyChart";
