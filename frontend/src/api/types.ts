// Mirrors src/xrpddatavis/models.py - keep these two in sync by hand.

export type PlotKind = "scatter" | "line" | "line+markers";

/** Known values of data_type; the field also accepts any other string. */
export type KnownDataType = "pxrd" | "gr" | "fq" | "sq" | "iq";
export type DataType = KnownDataType | (string & {});

/** A single 1D trace: x, y and optional y errors. Pure data - no plotting
 * or provenance metadata (mirrors XYEData). Not sent over the wire on its
 * own - see DataPlot/FittedDataPlot, which extend it with what a POST to
 * /plot actually needs. */
export interface XYEData {
  title: string;
  x: number[];
  y: number[];
  e: number[] | null;
}

/** An XYEData trace plus everything needed to plot and locate it - what
 * actually gets drawn (mirrors DataPlot). */
export interface DataPlot extends XYEData {
  filepath: string | null;
  filenumber: number | null;
  /** Explicit override - usually unset and derived from filepath instead. */
  instrument_session: string | null;
  x_label: string | null;
  y_label: string | null;
  data_type: DataType | null;
  plot_type: PlotKind;
  /** Replace an existing plot with the same title rather than adding a new
   * one - useful for live scans that push repeated updates of one trace. */
  upsert: boolean;
}

/** A DataPlot with a fit: a calculated curve sharing `x` with the observed
 * data, plus the difference, background and reflection-marker curves
 * conventionally drawn alongside it, as in a Rietveld refinement plot
 * (mirrors FittedDataPlot). */
export interface FittedDataPlot extends DataPlot {
  calc: number[];
  diff: number[] | null;
  background: number[] | number | null;
  markers: number[] | null;
}

export function isFittedDataPlot(data: DataPlot | FittedDataPlot): data is FittedDataPlot {
  return "calc" in data;
}

/** obs - calc, using the explicit `diff` array when the server sent one. */
export function difference(data: FittedDataPlot): number[] {
  if (data.diff) return data.diff;
  return data.y.map((v, i) => v - data.calc[i]);
}

/** `background` broadcast to one value per point, whether it was posted as
 * a single constant or a full array. */
export function backgroundSeries(data: FittedDataPlot): number[] | null {
  if (data.background === null) return null;
  return Array.isArray(data.background) ? data.background : data.x.map(() => data.background as number);
}

/** Body of a POST to /plot: a single flat document, either a plain DataPlot
 * or (if it carries `calc`) a FittedDataPlot. What the client needs to
 * send - server fields default when omitted. */
export type PlotRequest = DataPlotInput | FittedDataPlotInput;

export interface DataPlotInput {
  title: string;
  x: number[];
  y: number[];
  e?: number[] | null;
  filepath?: string | null;
  filenumber?: number | null;
  instrument_session?: string | null;
  x_label?: string | null;
  y_label?: string | null;
  data_type?: DataType | null;
  plot_type?: PlotKind;
  upsert?: boolean;
}

export interface FittedDataPlotInput extends DataPlotInput {
  calc: number[];
  diff?: number[] | null;
  background?: number[] | number | null;
  markers?: number[] | null;
}

export interface PlotResponse {
  name: string;
  plotted: boolean;
  error: string | null;
  id: string | null;
  expires_at: string | null;
  evicted: string[];
}

export interface PlotUpdate {
  name?: string;
  plot_type?: PlotKind;
  colour_index?: number;
  data_type?: DataType;
  pinned?: boolean;
}

export interface PlotData {
  data: DataPlot | FittedDataPlot;
  id: string;
  created_at: string;
  updated_at: string;
  version: number;
  colour_index: number;
  pinned: boolean;
}

export interface PlotSummary {
  id: string;
  name: string;
  plot_type: PlotKind;
  data_type: DataType | null;
  points: number;
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  has_errors: boolean;
  has_fit: boolean;
  filepath: string | null;
  filenumber: number | null;
  instrument_session: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  colour_index: number;
  pinned: boolean;
  age_seconds: number;
  expires_at: string;
  ttl_remaining_seconds: number;
}

export interface LivePlots {
  plots: PlotSummary[];
  max_plots: number;
  ttl_seconds: number;
  revision: number;
}

export interface Limits {
  max_plots: number;
  ttl_seconds: number;
}

export interface AppInfo {
  beamline: string;
}
