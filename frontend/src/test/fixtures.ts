import type { DataPlot, FittedDataPlot, PlotData, PlotSummary } from "../api/types";

export function dataPlot(overrides: Partial<DataPlot> = {}): DataPlot {
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

export function summary(id: string, overrides: Partial<PlotSummary> = {}): PlotSummary {
  return {
    id,
    name: id,
    plot_type: "line",
    data_type: null,
    points: 3,
    x_min: 1,
    x_max: 3,
    y_min: 10,
    y_max: 30,
    has_errors: true,
    has_fit: false,
    filepath: null,
    filenumber: null,
    instrument_session: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    version: 1,
    colour_index: 0,
    pinned: false,
    age_seconds: 0,
    expires_at: "2026-01-01T01:00:00Z",
    ttl_remaining_seconds: 3600,
    ...overrides,
  };
}

export function plotData(
  id: string,
  data: DataPlot | FittedDataPlot = dataPlot(),
  overrides: Partial<PlotData> = {},
): PlotData {
  return {
    data,
    id,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    version: 1,
    colour_index: 0,
    pinned: false,
    ...overrides,
  };
}
