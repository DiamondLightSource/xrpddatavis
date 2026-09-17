import type { Data, Layout } from "plotly.js";
import type { PlotData, PlotSummary } from "./api/types";
import { backgroundSeries, difference, isFittedDataPlot } from "./api/types";
import { DASHES, seriesColour } from "./palette";

export type LayoutMode = "overlay" | "offset" | "grid";

export interface ChartOptions {
  errors: boolean;
  calc: boolean;
  diff: boolean;
  background: boolean;
  markers: boolean;
  logy: boolean;
  normalise: boolean;
}

interface Prepared {
  summary: PlotSummary;
  plot: PlotData;
  colour: string;
  dash: (typeof DASHES)[number];
  mainY: number[];
  mainE: number[] | null;
  // undefined when this plot isn't a FittedDataPlot
  calcY?: number[];
  diffY?: number[];
  backgroundY?: number[];
  markerX?: number[];
}

/** Rescale `y` (and its errors) into [0, 1]. Returns the raw min/max too, so
 * a fit's calc/background curves - which share the obs y-axis - can be
 * rescaled the same way rather than independently against their own range. */
function normaliseMain(y: number[], e: number[] | null) {
  const max = Math.max(...y);
  const min = Math.min(...y);
  const span = max - min;
  if (span === 0) return { y: y.map(() => 0), e: e?.map(() => 0) ?? null, min, max };
  return {
    y: y.map((v) => (v - min) / span),
    e: e ? e.map((v) => v / span) : null,
    min,
    max,
  };
}

/** Rescale a curve that shares the obs y-axis (calc, background) using the
 * obs curve's own min/max, so it stays aligned with it once normalised. */
function rescaleLike(values: number[], min: number, max: number): number[] {
  const span = max - min;
  return span === 0 ? values.map(() => 0) : values.map((v) => (v - min) / span);
}

/** Rescale a curve that is itself an offset (diff) - divide by the span but
 * don't subtract the min, since diff is centred on zero rather than on the
 * obs curve's own scale. */
function rescaleOffset(values: number[], min: number, max: number): number[] {
  const span = max - min;
  return span === 0 ? values.map(() => 0) : values.map((v) => v / span);
}

function prepare(
  summaries: PlotSummary[],
  getData: (id: string) => PlotData | undefined,
  mode: "light" | "dark",
  options: ChartOptions,
): Prepared[] {
  const seenSlot = new Map<number, number>();
  const prepared: Prepared[] = [];
  for (const summary of summaries) {
    const plot = getData(summary.id);
    if (!plot) continue;
    const slot = summary.colour_index % 8;
    const repeat = seenSlot.get(slot) ?? 0;
    seenSlot.set(slot, repeat + 1);

    const rawE = options.errors ? plot.data.e : null;
    const main = options.normalise
      ? normaliseMain(plot.data.y, rawE)
      : { y: plot.data.y, e: rawE, min: Math.min(...plot.data.y), max: Math.max(...plot.data.y) };

    const item: Prepared = {
      summary,
      plot,
      colour: seriesColour(slot, mode),
      dash: DASHES[repeat % DASHES.length],
      mainY: main.y,
      mainE: main.e,
    };

    const data = plot.data;
    if (isFittedDataPlot(data)) {
      const rescale = (values: number[]) =>
        options.normalise ? rescaleLike(values, main.min, main.max) : values;
      item.calcY = rescale(data.calc);
      const bg = backgroundSeries(data);
      if (bg) item.backgroundY = rescale(bg);
      const diffValues = difference(data);
      item.diffY = options.normalise ? rescaleOffset(diffValues, main.min, main.max) : diffValues;
      if (data.markers) item.markerX = data.markers;
    }

    prepared.push(item);
  }
  return prepared;
}

function glyphType(pointCount: number, hasErrors: boolean): "scatter" | "scattergl" {
  // WebGL for big traces; SVG below that and whenever error bars are on,
  // which scattergl does not draw
  return pointCount > 4000 && !hasErrors ? "scattergl" : "scatter";
}

export function buildChart(
  summaries: PlotSummary[],
  getData: (id: string) => PlotData | undefined,
  mode: LayoutMode,
  options: ChartOptions,
  colourScheme: "light" | "dark",
  themeColours: {
    border: string;
    borderStrong: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    surface: string;
    fontFamily: string;
  },
): { traces: Data[]; layout: Partial<Layout>; prepared: Prepared[] } {
  const prepared = prepare(summaries, getData, colourScheme, options);

  // vertical offset per trace, so a stack of similar patterns is readable
  let step = 0;
  let factor = 1;
  if (mode === "offset" && prepared.length > 1) {
    if (options.logy) {
      factor = 3;
    } else {
      const spans = prepared.map((p) => Math.max(...p.mainY) - Math.min(...p.mainY));
      step = 0.5 * Math.max(...spans, 0);
    }
  }

  const traces: Data[] = [];
  prepared.forEach((item, index) => {
    const shift = (values: number[]) =>
      mode === "offset"
        ? values.map((v) => (options.logy ? v * factor ** index : v + step * index))
        : values;

    const plotlyMode =
      item.summary.plot_type === "scatter"
        ? "markers"
        : item.summary.plot_type === "line+markers"
          ? "lines+markers"
          : "lines";

    const axes = mode === "grid" ? { xaxis: `x${index + 1}`, yaxis: `y${index + 1}` } : {};
    const withErrors = options.errors && item.mainE !== null;
    const glyph = glyphType(item.plot.data.x.length, withErrors);
    const legendgroup = item.summary.id;

    const trace: Data = {
      type: glyph,
      mode: plotlyMode,
      name: item.summary.name,
      x: item.plot.data.x,
      y: shift(item.mainY),
      customdata: item.plot.data.y,
      line: { color: item.colour, width: 2, dash: item.dash, shape: "linear" },
      marker: { color: item.colour, size: 5, line: { width: 0 } },
      hovertemplate: "%{customdata:.5g}<extra>%{fullData.name}</extra>",
      legendgroup,
      ...axes,
      ...(withErrors
        ? {
            error_y: {
              type: "data",
              array: item.mainE!,
              color: item.colour,
              thickness: 1,
              width: 0,
              opacity: 0.55,
            },
          }
        : {}),
    };
    traces.push(trace);

    // rows for diff and markers sit a fixed distance below the lowest point
    // of the obs curve - a classic Rietveld-style difference plot, so a fit
    // reads the same way whether or not the underlying values are normalised
    const rowSpan = Math.max(...item.mainY) - Math.min(...item.mainY) || 1;
    const rowGap = 0.15 * rowSpan;
    const diffBase = Math.min(...item.mainY) - 3 * rowGap;

    if (options.calc && item.calcY) {
      traces.push({
        type: glyph,
        mode: "lines",
        name: `${item.summary.name} · calc`,
        x: item.plot.data.x,
        y: shift(item.calcY),
        line: { color: item.colour, width: 2, dash: "dot" },
        hovertemplate: "%{y:.5g}<extra>%{fullData.name}</extra>",
        legendgroup,
        ...axes,
      });
    }

    if (options.background && item.backgroundY) {
      traces.push({
        type: glyph,
        mode: "lines",
        name: `${item.summary.name} · background`,
        x: item.plot.data.x,
        y: shift(item.backgroundY),
        line: { color: item.colour, width: 1, dash: "longdash" },
        opacity: 0.6,
        hovertemplate: "%{y:.5g}<extra>%{fullData.name}</extra>",
        legendgroup,
        ...axes,
      });
    }

    if (options.diff && item.diffY) {
      traces.push({
        type: glyph,
        mode: "lines",
        name: `${item.summary.name} · diff`,
        x: item.plot.data.x,
        y: shift(item.diffY.map((v) => v + diffBase)),
        line: { color: item.colour, width: 1 },
        opacity: 0.75,
        hovertemplate: "%{customdata:.5g}<extra>%{fullData.name}</extra>",
        customdata: item.diffY,
        legendgroup,
        ...axes,
      });
    }

    if (options.markers && item.markerX) {
      const markerBase = diffBase - (options.diff ? 2 : 0) * rowGap;
      traces.push({
        type: "scatter",
        mode: "markers",
        name: `${item.summary.name} · markers`,
        x: item.markerX,
        y: shift(item.markerX.map(() => markerBase)),
        marker: { color: item.colour, symbol: "line-ns-open", size: 10, line: { width: 1.5 } },
        hovertemplate: "%{x:.5g}<extra>%{fullData.name}</extra>",
        legendgroup,
        ...axes,
      });
    }
  });

  const layout = buildLayout(prepared, traces.length, mode, options, themeColours);
  return { traces, layout, prepared };
}

function axisStyle(
  themeColours: { border: string; borderStrong: string; textSecondary: string; textMuted: string },
  extra: Partial<Layout["xaxis"]> = {},
) {
  return {
    gridcolor: themeColours.border,
    zerolinecolor: themeColours.borderStrong,
    linecolor: themeColours.borderStrong,
    tickfont: { color: themeColours.textSecondary, size: 11 },
    automargin: true,
    ...extra,
  };
}

/** Join the distinct labels across all plotted series, in first-seen order,
 * so an axis shown by several units (e.g. overlay/offset) states all of them
 * instead of silently taking on whichever plot happened to load first. */
function combineLabels(labels: string[]): string {
  return Array.from(new Set(labels)).join(" / ");
}

function buildLayout(
  prepared: Prepared[],
  traceCount: number,
  mode: LayoutMode,
  options: ChartOptions,
  themeColours: {
    border: string;
    borderStrong: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    surface: string;
    fontFamily: string;
  },
): Partial<Layout> {
  const xTitle = combineLabels(prepared.map((p) => p.plot.data.x_label || "x")) || "x";
  const yBase = combineLabels(prepared.map((p) => p.plot.data.y_label || "Intensity")) || "Intensity";
  const yTitle = options.normalise ? `${yBase} (normalised)` : yBase;

  const base: Partial<Layout> = {
    paper_bgcolor: themeColours.surface,
    plot_bgcolor: themeColours.surface,
    font: { color: themeColours.textPrimary, family: themeColours.fontFamily },
    margin: { l: 62, r: 18, t: 34, b: 48 },
    showlegend: traceCount > 1,
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.01,
      xanchor: "left",
      x: 0,
      font: { color: themeColours.textSecondary, size: 11 },
      bgcolor: "rgba(0,0,0,0)",
    },
    hoverlabel: {
      bgcolor: themeColours.surface,
      bordercolor: themeColours.borderStrong,
      font: { color: themeColours.textPrimary, size: 12 },
    },
    // keep the user's zoom across live updates, reset it when the view changes
    uirevision: `${mode}|${options.logy}|${options.normalise}`,
  };

  if (mode === "grid") {
    const count = Math.max(1, prepared.length);
    const columns = Math.min(3, Math.ceil(Math.sqrt(count)));
    const rows = Math.ceil(count / columns);
    return {
      ...base,
      grid: { rows, columns, pattern: "independent", xgap: 0.12, ygap: 0.22 },
      showlegend: false,
      hovermode: "closest",
      margin: { l: 56, r: 16, t: 46, b: 44 },
      annotations: prepared.map((item, index) => ({
        text: item.summary.name,
        xref: `x${index + 1} domain` as never,
        yref: `y${index + 1} domain` as never,
        x: 0,
        y: 1.03,
        xanchor: "left",
        yanchor: "bottom",
        showarrow: false,
        font: { color: item.colour, size: 11 },
      })),
      ...Object.fromEntries(
        prepared.flatMap((item, index) => {
          const n = index + 1;
          const itemXTitle = item.plot.data.x_label || "x";
          const itemYBase = item.plot.data.y_label || "Intensity";
          const itemYTitle = options.normalise ? `${itemYBase} (normalised)` : itemYBase;
          return [
            [
              `xaxis${n}`,
              axisStyle(themeColours, {
                title: {
                  text: itemXTitle,
                  font: { color: themeColours.textSecondary, size: 11 },
                },
              }),
            ],
            [
              `yaxis${n}`,
              axisStyle(themeColours, {
                type: options.logy ? "log" : "linear",
                title: {
                  text: itemYTitle,
                  font: { color: themeColours.textSecondary, size: 11 },
                },
              }),
            ],
          ];
        }),
      ),
    };
  }

  return {
    ...base,
    hovermode: "x unified",
    xaxis: axisStyle(themeColours, {
      title: { text: xTitle, font: { color: themeColours.textSecondary, size: 12 } },
      showspikes: true,
      spikemode: "across",
      spikethickness: 1,
      spikedash: "dot",
      spikecolor: themeColours.textMuted,
    }),
    yaxis: axisStyle(themeColours, {
      type: options.logy ? "log" : "linear",
      title: {
        text: mode === "offset" ? `${yTitle} (offset)` : yTitle,
        font: { color: themeColours.textSecondary, size: 12 },
      },
    }),
  };
}
