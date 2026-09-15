// Mirrors src/xrddatavis/models.py - keep these two in sync by hand.

export type PlotKind = "scatter" | "line" | "line+markers";

/** Known values of data_type; the field also accepts any other string. */
export type KnownDataType = "pxrd" | "gr" | "fq" | "sq" | "iq";
export type DataType = KnownDataType | (string & {});

export interface XYEData {
  name: string;
  x: number[];
  y: number[];
  e: number[] | null;
  filepath: string | null;
  filenumber: number | null;
  /** Explicit override - usually unset and derived from filepath instead. */
  instrument_session: string | null;
  x_label: string | null;
  y_label: string | null;
  data_type: DataType | null;
}

export interface PlotRequest {
  data: XYEDataInput;
  fit?: XYEDataInput | null;
  plot_type?: PlotKind;
  upsert?: boolean;
}

/** What the client needs to send - server fields default when omitted. */
export interface XYEDataInput {
  name: string;
  x: number[];
  y: number[];
  e?: number[] | null;
  filepath?: string | null;
  filenumber?: number | null;
  instrument_session?: string | null;
  x_label?: string | null;
  y_label?: string | null;
  data_type?: DataType | null;
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
  data: XYEData;
  fit: XYEData | null;
  plot_type: PlotKind;
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
