import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { ChartOptions } from "../chartBuilder";
import { plotData, summary } from "../test/fixtures";
import { renderWithTheme } from "../test/render";
import { ChartPanel } from "./ChartPanel";

const OPTIONS: ChartOptions = {
  errors: true,
  calc: true,
  diff: false,
  background: false,
  markers: false,
  logy: false,
  normalise: false,
};

const plotly = { react: vi.fn(), purge: vi.fn(), relayout: vi.fn(), Plots: { resize: vi.fn() } };

beforeEach(() => {
  [plotly.react, plotly.purge, plotly.relayout].forEach((fn) => fn.mockReset());
  vi.stubGlobal("Plotly", plotly);
});

function setup(overrides: Partial<React.ComponentProps<typeof ChartPanel>> = {}) {
  const props = {
    selectedSummaries: [],
    hasAnyPlots: true,
    mode: "overlay" as const,
    onModeChange: vi.fn(),
    options: OPTIONS,
    onOptionsChange: vi.fn(),
    ...overrides,
  };
  renderWithTheme(<ChartPanel {...props} />);
  return props;
}

describe("ChartPanel", () => {
  it("explains an empty server", () => {
    setup({ hasAnyPlots: false });
    expect(screen.getByText("No plots on the server")).toBeInTheDocument();
  });

  it("asks for a selection when there are plots", () => {
    setup();
    expect(screen.getByText("Nothing selected")).toBeInTheDocument();
  });

  it("loads and draws the selected plots", async () => {
    let resolve!: (value: ReturnType<typeof plotData>) => void;
    vi.spyOn(api, "plot").mockReturnValue(new Promise((r) => (resolve = r)));

    setup({ selectedSummaries: [summary("a")] });
    expect(screen.getByRole("status")).toHaveTextContent("Loading selected plots");

    await act(async () => resolve(plotData("a")));
    await waitFor(() => expect(plotly.react).toHaveBeenCalled());
    const [, traces] = plotly.react.mock.lastCall!;
    expect(traces).toHaveLength(1);
  });

  it("shows an error when the selected plots can't be loaded", async () => {
    vi.spyOn(api, "plot").mockRejectedValue(new Error("gone"));
    setup({ selectedSummaries: [summary("a")] });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the selected plots");
  });

  it("toggles trace and scale options", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Diff" }));
    expect(props.onOptionsChange).toHaveBeenLastCalledWith({ ...OPTIONS, diff: true });

    await userEvent.click(screen.getByRole("checkbox", { name: "Error bars" }));
    expect(props.onOptionsChange).toHaveBeenLastCalledWith({ ...OPTIONS, errors: false });
  });

  it("switches layout", async () => {
    const props = setup();
    const layout = screen.getByRole("combobox", { name: "Plot layout" });
    expect(layout).toHaveTextContent("Overlay");

    await userEvent.click(layout);
    await userEvent.click(within(screen.getByRole("listbox")).getByText("Grid"));
    expect(props.onModeChange).toHaveBeenCalledWith("grid");
  });

  it("resets the view", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(plotly.relayout).toHaveBeenCalled();
  });

  it("re-resolves theme colours when the colour scheme flips", async () => {
    vi.spyOn(api, "plot").mockResolvedValue(plotData("a"));
    setup({ selectedSummaries: [summary("a")] });
    await waitFor(() => expect(plotly.react).toHaveBeenCalled());
    const calls = plotly.react.mock.calls.length;

    await act(async () => {
      document.documentElement.setAttribute("data-mode", "dark");
    });
    await waitFor(() => expect(plotly.react.mock.calls.length).toBeGreaterThan(calls));
  });
});
