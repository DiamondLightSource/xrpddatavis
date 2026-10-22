import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api/client";
import { plotData, summary } from "./test/fixtures";
import { renderWithTheme } from "./test/render";
import App from "./App";

const plots = [
  summary("a", { name: "Alpha", data_type: "pxrd", instrument_session: "cm1-1", filepath: "/data/alpha.xye" }),
  summary("b", {
    name: "Beta",
    data_type: "gr",
    instrument_session: "cm1-2",
    created_at: "2026-01-01T00:05:00Z",
  }),
];

beforeEach(() => {
  // no EventSource in jsdom: the app falls back to polling
  vi.stubGlobal("Plotly", { react: vi.fn(), purge: vi.fn(), relayout: vi.fn(), Plots: { resize: vi.fn() } });
  vi.spyOn(api, "liveplots").mockResolvedValue({ plots, max_plots: 10, ttl_seconds: 3600, revision: 1 });
  vi.spyOn(api, "info").mockResolvedValue({ beamline: "i11" });
  vi.spyOn(api, "plot").mockImplementation(async (id) => plotData(id));
  vi.spyOn(api, "edit").mockResolvedValue(undefined);
  vi.spyOn(api, "remove").mockResolvedValue(undefined);
  vi.spyOn(api, "clearAll").mockResolvedValue({ removed: 2 });
  vi.spyOn(api, "post").mockResolvedValue({ id: "new" } as Awaited<ReturnType<typeof api.post>>);
});

const typeFacet = () => screen.getByRole("combobox", { name: /Filter by data type/ });

async function pickFacet(name: RegExp, option: RegExp) {
  await userEvent.click(screen.getByRole("combobox", { name }));
  await userEvent.click(screen.getByRole("option", { name: option }));
  await userEvent.keyboard("{Escape}"); // the open menu hides the rest of the page
}

const status = () => screen.getByText(/plots · \d+ selected/);
const selection = () => screen.getByRole("checkbox", { name: "Select all listed plots" });

async function renderApp() {
  renderWithTheme(<App />);
  await screen.findByText("Alpha");
}

describe("App", () => {
  it("shows the beamline, the plots and the capacity", async () => {
    await renderApp();
    expect(await screen.findByText("I11")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(status()).toHaveTextContent("2 plots · 1 selected");
    expect(screen.getByText("2 / 10 plots")).toBeInTheDocument();
    expect(screen.getByText(/^updated /)).toBeInTheDocument();
  });

  it("ticks the newest plot on first load", async () => {
    await renderApp();
    expect(screen.getByRole("checkbox", { name: "Show Beta" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Show Alpha" })).not.toBeChecked();
  });

  it("finds the newest plot wherever it sits in the list", async () => {
    vi.mocked(api.liveplots).mockResolvedValue({
      plots: [...plots].reverse(),
      max_plots: 10,
      ttl_seconds: 3600,
      revision: 1,
    });
    await renderApp();
    expect(screen.getByRole("checkbox", { name: "Show Beta" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Show Alpha" })).not.toBeChecked();
  });

  it("keeps a cleared selection cleared when the list refreshes", async () => {
    await renderApp();
    await userEvent.click(selection());
    expect(status()).toHaveTextContent("0 selected");
    expect(localStorage.getItem("xrpddatavis.selected")).toBe("[]");
  });

  it("puts a ticked plot on the chart and clears the selection", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("checkbox", { name: "Show Alpha" }));
    expect(status()).toHaveTextContent("2 selected");

    await userEvent.click(selection());
    expect(status()).toHaveTextContent("0 selected");
  });

  it("filters by search text and facets, then resets", async () => {
    await renderApp();

    await userEvent.type(screen.getByRole("searchbox"), "alpha");
    expect(status()).toHaveTextContent("1 of 2 plots · 1 selected (1 hidden)");
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(status()).toHaveTextContent("2 plots · ");
    expect(status()).not.toHaveTextContent("of 2");

    await pickFacet(/Filter by data type/, /GR/);
    expect(status()).toHaveTextContent("1 of 2 plots");

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(status()).toHaveTextContent("2 plots · ");
    expect(status()).not.toHaveTextContent("of 2");
    expect(typeFacet()).toHaveTextContent("All");
  });

  it("combines several types in the dropdown", async () => {
    await renderApp();
    await pickFacet(/Filter by data type/, /GR/);
    expect(status()).toHaveTextContent("1 of 2 plots");

    await userEvent.click(screen.getByRole("combobox", { name: /Filter by data type/ }));
    await userEvent.click(screen.getByRole("option", { name: /PXRD/ }));
    await userEvent.keyboard("{Escape}");
    expect(status()).toHaveTextContent("2 plots");
    expect(typeFacet()).toHaveTextContent("GR, PXRD");
  });

  it("sorts the cards from the dropdown, and filters by status", async () => {
    vi.mocked(api.liveplots).mockResolvedValue({
      plots: [{ ...plots[0], pinned: true }, plots[1]],
      max_plots: 10,
      ttl_seconds: 3600,
      revision: 1,
    });
    await renderApp();
    const names = () => screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
    expect(names()).toEqual(["Beta", "Alpha"]);

    await userEvent.click(screen.getByRole("combobox", { name: /Sort plots/ }));
    await userEvent.click(screen.getByRole("option", { name: "Name A–Z" }));
    expect(names()).toEqual(["Alpha", "Beta"]);

    await pickFacet(/^Show$/, /Unpinned/);
    expect(status()).toHaveTextContent("1 of 2 plots");
    expect(names()).toEqual(["Beta"]);

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(names()).toEqual(["Alpha", "Beta"]);
  });

  it("deletes everything after confirming", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: "More list actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete all plots/ }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete all" }));
    await waitFor(() => expect(api.clearAll).toHaveBeenCalled());
  });

  it("can back out of deleting everything", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: "More list actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete all plots/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.clearAll).not.toHaveBeenCalled();
  });

  it("sends row actions to the server", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Pin Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "Change colour for Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "More actions for Beta" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.dblClick(screen.getByText("Alpha", { selector: "p" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Rename Alpha" }), "2{Enter}");

    await waitFor(() => expect(api.edit).toHaveBeenCalledWith("a", { name: "Alpha2" }));
    expect(api.edit).toHaveBeenCalledWith("a", { pinned: true });
    expect(api.edit).toHaveBeenCalledWith("a", { colour_index: 1 });
    expect(api.remove).toHaveBeenCalledWith("b");
  });

  it("toasts a failed action", async () => {
    vi.mocked(api.edit).mockRejectedValue(new ApiError("locked"));
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Pin Alpha" }));
    expect(await screen.findByText("Pin failed: locked")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByText("Pin failed: locked")).not.toBeInTheDocument());
  });

  it("uploads a file and selects the new plot", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, new File(["1 2\n3 4\n5 6\n"], "new.xy"));
    await screen.findByText(/3 data rows/);
    await userEvent.click(screen.getByRole("button", { name: "Plot it" }));

    expect(await screen.findByText('Plotted "new" (3 points).')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalled();
  });

  it("shows when the server can't be reached", async () => {
    vi.mocked(api.liveplots).mockRejectedValue(new Error("connection refused"));
    renderWithTheme(<App />);
    expect(await screen.findByText(/Could not reach the server: connection refused/)).toBeInTheDocument();
    expect(screen.getByText("Plots could not be loaded.")).toBeInTheDocument();
  });

  it("explains an empty server", async () => {
    vi.mocked(api.liveplots).mockResolvedValue({ plots: [], max_plots: 10, ttl_seconds: 0, revision: 1 });
    renderWithTheme(<App />);
    expect(await screen.findByText("No plots yet — POST a DataPlot to /plot.")).toBeInTheDocument();
  });

  it("filters to one instrument session", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("combobox", { name: "" }));
    await userEvent.click(within(screen.getByRole("listbox")).getByText("cm1-2"));
    expect(status()).toHaveTextContent("1 of 2 plots");
  });
});
