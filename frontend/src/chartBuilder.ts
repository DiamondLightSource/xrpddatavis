import type { Data, Layout } from "plotly.js";
import type { PlotData, PlotSummary } from "./api/types";
import { DASHES, seriesColour } from "./palette";

export type LayoutMode = "overlay" | "offset" | "grid";

export interface ChartOptions {
  errors: boolean;
  fits: boolean;
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
  fitY: number[] | null;
}

function transform(y: number[], e: number[] | null, normalise: boolean) {
  if (!normalise) return { y, e };
  const max = Math.max(...y);
  const min = Math.min(...y);
  const span = max - min;
  if (span === 0) return { y: y.map(() => 0), e: e?.map(() => 0) ?? null };
  return {
    y: y.map((v) => (v - min) / span),
    e: e ? e.map((v) => v / span) : null,
  };
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
    const main = transform(plot.data.y, options.errors ? plot.data.e : null, options.normalise);
    const fit = plot.fit ? transform(plot.fit.y, null, options.normalise) : null;
    prepared.push({
      summary,
      plot,
      colour: seriesColour(slot, mode),
      dash: DASHES[repeat % DASHES.length],
      mainY: main.y,
      mainE: main.e,
      fitY: fit?.y ?? null,
    });
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
      legendgroup: item.summary.id,
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

    if (options.fits && item.plot.fit && item.fitY) {
      traces.push({
        type: glyph,
        mode: "lines",
        name: item.plot.fit.name,
        x: item.plot.fit.x,
        y: shift(item.fitY),
        customdata: item.plot.fit.y,
        line: { color: item.colour, width: 2, dash: "dot" },
        hovertemplate: "%{customdata:.5g}<extra>%{fullData.name}</extra>",
        legendgroup: item.summary.id,
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
  const first = prepared[0]?.plot.data;
  const xTitle = first?.x_label || "x";
  const yBase = first?.y_label || "Intensity";
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
        prepared.flatMap((_, index) => {
          const n = index + 1;
          return [
            [
              `xaxis${n}`,
              axisStyle(themeColours, {
                title: {
                  text: index >= count - columns ? xTitle : "",
                  font: { color: themeColours.textSecondary, size: 11 },
                },
              }),
            ],
            [
              `yaxis${n}`,
              axisStyle(themeColours, {
                type: options.logy ? "log" : "linear",
                title: {
                  text: index % columns === 0 ? yTitle : "",
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
