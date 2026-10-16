import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Data } from "plotly.js";
import { PlotlyChart, type PlotlyChartHandle } from "./PlotlyChart";

const plotly = {
  react: vi.fn(),
  purge: vi.fn(),
  relayout: vi.fn(),
  Plots: { resize: vi.fn() },
};

const traces: Data[] = [{ x: [1], y: [2] }];

beforeEach(() => {
  [plotly.react, plotly.purge, plotly.relayout, plotly.Plots.resize].forEach((fn) => fn.mockReset());
  vi.stubGlobal("Plotly", plotly);
});

describe("PlotlyChart", () => {
  it("draws traces with Plotly.react and purges on unmount", () => {
    const { unmount } = render(<PlotlyChart traces={traces} layout={{}} />);
    expect(plotly.react).toHaveBeenCalledWith(expect.any(HTMLDivElement), traces, {}, expect.any(Object));

    unmount();
    expect(plotly.purge).toHaveBeenCalled();
  });

  it("clears the plot and shows the overlay instead", () => {
    render(<PlotlyChart traces={traces} layout={{}} overlay={<span>Nothing selected</span>} />);
    expect(screen.getByText("Nothing selected")).toBeInTheDocument();
    expect(plotly.purge).toHaveBeenCalled();
    expect(plotly.react).not.toHaveBeenCalled();
  });

  it("resets every axis and resizes through its handle", () => {
    const ref = createRef<PlotlyChartHandle>();
    const { container } = render(<PlotlyChart ref={ref} traces={traces} layout={{}} />);
    // the inner div Plotly draws into, inside the overlay wrapper
    const node = container.firstElementChild!.firstElementChild as HTMLDivElement & { layout?: object };

    ref.current!.resetView();
    expect(plotly.relayout).toHaveBeenLastCalledWith(node, {
      "xaxis.autorange": true,
      "yaxis.autorange": true,
    });

    node.layout = { xaxis2: {}, yaxis2: {}, title: {} };
    ref.current!.resetView();
    expect(plotly.relayout).toHaveBeenLastCalledWith(node, {
      "xaxis2.autorange": true,
      "yaxis2.autorange": true,
    });

    ref.current!.resize();
    expect(plotly.Plots.resize).toHaveBeenCalledWith(node);
  });

  it("does nothing while Plotly hasn't loaded", () => {
    vi.stubGlobal("Plotly", undefined);
    const ref = createRef<PlotlyChartHandle>();
    render(<PlotlyChart ref={ref} traces={traces} layout={{}} />);
    ref.current!.resetView();
    ref.current!.resize();
    expect(plotly.react).not.toHaveBeenCalled();
    expect(plotly.relayout).not.toHaveBeenCalled();
  });
});
