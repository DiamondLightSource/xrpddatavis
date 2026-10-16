import { describe, expect, it } from "vitest";
import type { DataPlot, FittedDataPlot, PlotData, PlotSummary } from "./api/types";
import { type ChartOptions, buildChart } from "./chartBuilder";
import { PALETTE } from "./palette";

const THEME = {
  border: "#ccc",
  borderStrong: "#999",
  textPrimary: "#000",
  textSecondary: "#333",
  textMuted: "#666",
  surface: "#fff",
  fontFamily: "sans-serif",
};

const OPTIONS: ChartOptions = {
  errors: true,
  calc: true,
  diff: true,
  background: true,
  markers: true,
  logy: false,
  normalise: false,
};

// the handful of Plotly trace fields these tests look at - Plotly's own
// Data type is a wide union that doesn't narrow usefully here
interface Trace {
  name: string;
  mode: string;
  y: number[];
  xaxis?: string;
  line: { color: string; dash: string };
  error_y?: { array: number[] };
}

function dataPlot(overrides: Partial<DataPlot> = {}): DataPlot {
  return {
    title: "obs",
    x: [1, 2, 3],
    y: [10, 20, 30],
    e: [1, 1, 1],
    filepath: null,
    filenumber: null,
    instrument_session: null,
    x_label: null,
    y_label: null,
    data_type: null,
    plot_type: "line",
    upsert: false,
    ...overrides,
  };
}

function entry(id: string, data: DataPlot | FittedDataPlot, colourIndex = 0) {
  const summary: PlotSummary = {
    id,
    name: id,
    plot_type: data.plot_type,
    data_type: data.data_type,
    points: data.x.length,
    x_min: Math.min(...data.x),
    x_max: Math.max(...data.x),
    y_min: Math.min(...data.y),
    y_max: Math.max(...data.y),
    has_errors: data.e !== null,
    has_fit: "calc" in data,
    filepath: data.filepath,
    filenumber: data.filenumber,
    instrument_session: data.instrument_session,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    version: 1,
    colour_index: colourIndex,
    pinned: false,
    age_seconds: 0,
    expires_at: "2026-01-01T01:00:00Z",
    ttl_remaining_seconds: 3600,
  };
  const plot: PlotData = {
    data,
    id,
    created_at: summary.created_at,
    updated_at: summary.updated_at,
    version: 1,
    colour_index: colourIndex,
    pinned: false,
  };
  return { summary, plot };
}

function build(entries: ReturnType<typeof entry>[], mode: "overlay" | "offset" | "grid", options = OPTIONS) {
  const byId = new Map(entries.map((e) => [e.plot.id, e.plot]));
  const result = buildChart(
    entries.map((e) => e.summary),
    (id) => byId.get(id),
    mode,
    options,
    "light",
    THEME,
  );
  return { ...result, traces: result.traces as unknown as Trace[] };
}

describe("buildChart", () => {
  it("draws one trace per plain plot with its palette colour and errors", () => {
    const { traces } = build([entry("a", dataPlot(), 2)], "overlay");
    expect(traces).toHaveLength(1);
    const trace = traces[0];
    expect(trace.name).toBe("a");
    expect(trace.mode).toBe("lines");
    expect(trace.line.color).toBe(PALETTE.light[2]);
    expect(trace.error_y?.array).toEqual([1, 1, 1]);
  });

  it("skips summaries with no data loaded yet", () => {
    const { summary } = entry("missing", dataPlot());
    const result = buildChart([summary], () => undefined, "overlay", OPTIONS, "light", THEME);
    expect(result.traces).toHaveLength(0);
  });

  it("separates repeated colour slots by dash style", () => {
    const { traces } = build([entry("a", dataPlot(), 0), entry("b", dataPlot(), 8)], "overlay");
    const [first, second] = traces;
    expect(first.line.color).toBe(second.line.color);
    expect(first.line.dash).not.toBe(second.line.dash);
  });

  it("adds calc, background and diff traces for a fitted plot", () => {
    const fitted: FittedDataPlot = {
      ...dataPlot(),
      calc: [9, 21, 30],
      diff: null,
      background: 5,
      markers: [1.5, 2.5],
    };
    const { traces, prepared } = build([entry("fit", fitted)], "overlay");
    const names = traces.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["fit", "fit · calc", "fit · background", "fit · diff"]));
    expect(prepared[0].diffY).toEqual([1, -1, 0]);
    expect(prepared[0].backgroundY).toEqual([5, 5, 5]);
  });

  it("normalises the main curve into [0, 1]", () => {
    const { prepared } = build([entry("a", dataPlot())], "overlay", { ...OPTIONS, normalise: true });
    expect(prepared[0].mainY).toEqual([0, 0.5, 1]);
  });

  it("offsets later traces upwards in offset mode", () => {
    const { traces } = build([entry("a", dataPlot()), entry("b", dataPlot(), 1)], "offset");
    const [first, second] = traces;
    expect(second.y[0]).toBeGreaterThan(first.y[0]);
  });

  it("gives each trace its own axes in grid mode", () => {
    const { traces } = build([entry("a", dataPlot()), entry("b", dataPlot(), 1)], "grid");
    expect(traces[1].xaxis).toBe("x2");
  });
});
