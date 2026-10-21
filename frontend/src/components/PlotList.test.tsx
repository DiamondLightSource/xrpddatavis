import { render, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider } from "@diamondlightsource/sci-react-ui";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlotSummary } from "../api/types";
import { SORT_OPTIONS, type SortOrder } from "../hooks/usePlotSort";
import { summary } from "../test/fixtures";
import { renderWithTheme } from "../test/render";
import { PlotList } from "./PlotList";

const plots = [
  summary("a", { name: "Scan 2", points: 100, created_at: "2026-01-01T00:00:02Z", data_type: "pxrd", filenumber: 7 }),
  summary("b", { name: "Scan 10", points: 50, created_at: "2026-01-01T00:00:01Z", has_fit: true, colour_index: 3 }),
];

function setup(overrides: Partial<React.ComponentProps<typeof PlotList>> = {}) {
  const props = {
    plots,
    selected: [] as string[],
    onToggle: vi.fn(),
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onDelete: vi.fn(),
    onTogglePin: vi.fn(),
    onCycleColour: vi.fn(),
    onRename: vi.fn(),
    totalCount: overrides.plots?.length ?? plots.length,
    filtersActive: false,
    onClearFilters: vi.fn(),
    sortOrder: "newest" as SortOrder,
    onSortOrderChange: vi.fn(),
    ttlSeconds: 3600,
    emptyMessage: "Nothing here",
    ...overrides,
  };
  renderWithTheme(<PlotList {...props} />);
  return props;
}

const nameCellText = (name: string) => screen.getByText(name, { selector: "p" });

describe("PlotList", () => {
  it("shows the empty message without plots", () => {
    setup({ plots: [], totalCount: 0 });
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("lists the plots in the order given, each as a card with its details", () => {
    setup();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Scan 2");
    expect(cards[0]).toHaveTextContent("PXRD · #7");
    expect(cards[0]).toHaveTextContent("x 1 – 3 · 100 pts");
    expect(cards[0]).toHaveTextContent("1h 0m");
    expect(cards[1]).toHaveTextContent("Scan 10");
    expect(cards[1]).toHaveTextContent("fit");
    expect(cards[1]).toHaveTextContent("x 1 – 3 · 50 pts");
  });

  it("offers every sort order in a dropdown and reports the pick", async () => {
    const props = setup();
    const sort = screen.getByRole("combobox", { name: /Sort plots/ });
    expect(sort).toHaveTextContent("Newest first");

    await userEvent.click(sort);
    expect(within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent)).toEqual(
      SORT_OPTIONS.map((o) => o.label),
    );

    await userEvent.click(screen.getByRole("option", { name: "Most points" }));
    expect(props.onSortOrderChange).toHaveBeenCalledWith("points-desc");
  });

  it("shows the current sort order", () => {
    setup({ sortOrder: "name-asc" });
    expect(screen.getByRole("combobox", { name: /Sort plots/ })).toHaveTextContent("Name A–Z");
  });

  it("selects all listed plots", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all listed plots" }));
    expect(props.onSelectAll).toHaveBeenCalledWith(["a", "b"]);
  });

  it("shows the plot and selected counts, and clears the selection when all are selected", async () => {
    const props = setup({ selected: ["a", "b"] });
    expect(screen.getByRole("status")).toHaveTextContent("2 plots · 2 selected");
    const box = screen.getByRole("checkbox", { name: "Select all listed plots" });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(props.onDeselectAll).toHaveBeenCalledWith(["a", "b"]);
  });

  it("marks the header checkbox indeterminate for a partial selection", () => {
    setup({ selected: ["a"] });
    expect(screen.getByRole("status")).toHaveTextContent("2 plots · 1 selected");
    expect(screen.getByRole("checkbox", { name: "Select all listed plots" })).toHaveAttribute(
      "data-indeterminate",
      "true",
    );
  });

  it("clears a partial selection from the half-ticked header checkbox", async () => {
    const props = setup({ selected: ["a"] });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all listed plots" }));
    expect(props.onDeselectAll).toHaveBeenCalledWith(["a"]);
    expect(props.onSelectAll).not.toHaveBeenCalled();
  });

  it("counts selected plots the current filters hide, and clears them too", async () => {
    const props = setup({ selected: ["a", "gone"] });
    expect(screen.getByRole("status")).toHaveTextContent("2 plots · 2 selected (1 hidden)");
    const box = screen.getByRole("checkbox", { name: "Select all listed plots" });
    expect(box).toHaveAttribute("data-indeterminate", "true");
    await userEvent.click(box);
    expect(props.onDeselectAll).toHaveBeenCalledWith(["a", "gone"]);
  });

  it("shows how many of the plots the filters leave, and clears them from the header", async () => {
    const props = setup({ plots: [plots[0]], totalCount: 5, filtersActive: true });
    expect(screen.getByRole("status")).toHaveTextContent("1 of 5 plots · 0 selected");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(props.onClearFilters).toHaveBeenCalled();
  });

  it("moves focus to the counts when the clear-filters button it was on goes away", async () => {
    setup({ plots: [plots[0]], totalCount: 5, filtersActive: true });
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("status")).toHaveFocus();
  });

  it("keeps the header checkbox enabled when clearing leaves nothing to select", () => {
    setup({ plots: [], totalCount: 4, filtersActive: true, selected: ["gone"] });
    expect(screen.getByRole("checkbox", { name: "Select all listed plots" })).toBeEnabled();
  });

  it("does nothing when the header checkbox is clicked with no plots listed and none selected", async () => {
    const props = setup({ plots: [], totalCount: 4, filtersActive: true });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all listed plots" }));
    expect(props.onSelectAll).not.toHaveBeenCalled();
    expect(props.onDeselectAll).not.toHaveBeenCalled();
  });

  it("offers no clear-filters button while nothing is filtered", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("keeps the header and explains when the filters leave nothing", () => {
    setup({ plots: [], totalCount: 4, filtersActive: true, emptyMessage: "No match" });
    expect(screen.getByText("No match")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 of 4 plots");
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("toggles a plot from its checkbox or its row", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Show Scan 2" }));
    expect(props.onToggle).toHaveBeenLastCalledWith("a", true);

    await userEvent.click(nameCellText("Scan 10"));
    expect(props.onToggle).toHaveBeenLastCalledWith("b");
  });

  it("cycles a plot's colour", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Change colour for Scan 10" }));
    expect(props.onCycleColour).toHaveBeenCalledWith("b", 4);
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it("pins and unpins", async () => {
    const props = setup({ plots: [summary("a", { name: "A", pinned: true })] });
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pin A" }));
    expect(props.onTogglePin).toHaveBeenCalledWith("a", false);
  });

  it("confirms before unpinning an expired plot", async () => {
    const expired: PlotSummary = summary("a", { name: "A", pinned: true, ttl_remaining_seconds: 0 });
    const props = setup({ plots: [expired] });

    await userEvent.click(screen.getByRole("button", { name: "Pin A (expired)" }));
    expect(props.onTogglePin).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Unpin and remove" }));
    expect(props.onTogglePin).toHaveBeenCalledWith("a", false);
  });

  it("deletes an unpinned plot straight from its menu", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "More actions for Scan 2" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith("a");
  });

  it("confirms before deleting a pinned plot", async () => {
    const props = setup({ plots: [summary("a", { name: "A", pinned: true })] });
    await userEvent.click(screen.getByRole("button", { name: "More actions for A" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(props.onDelete).not.toHaveBeenCalled();

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith("a");
  });

  describe("focus when a card leaves the list", () => {
    const pinnedA = summary("a", { name: "A", pinned: true });
    const b = summary("b", { name: "B" });
    const baseProps = {
      selected: [] as string[],
      onToggle: vi.fn(),
      onSelectAll: vi.fn(),
      onDeselectAll: vi.fn(),
      onDelete: vi.fn(),
      onTogglePin: vi.fn(),
      onCycleColour: vi.fn(),
      onRename: vi.fn(),
      filtersActive: true,
      onClearFilters: vi.fn(),
      sortOrder: "newest" as SortOrder,
      onSortOrderChange: vi.fn(),
      ttlSeconds: 3600,
      emptyMessage: "Nothing here",
    };
    const list = (listed: PlotSummary[], extra: React.ReactNode = null) => (
      <ThemeProvider>
        {extra}
        <PlotList {...baseProps} plots={listed} totalCount={2} />
      </ThemeProvider>
    );

    it("moves to the counts when the focused card is removed, e.g. unpinned under a Pinned filter", () => {
      const { rerender } = render(list([pinnedA, b]));
      screen.getByRole("button", { name: "Pin A" }).focus();
      expect(screen.getByRole("button", { name: "Pin A" })).toHaveFocus();

      rerender(list([b]));

      expect(screen.getByRole("status")).toHaveFocus();
    });

    it("moves to the counts after a delete from the row menu", async () => {
      const unpinnedA = summary("a", { name: "A" });
      const { rerender } = render(list([unpinnedA, b]));
      await userEvent.click(screen.getByRole("button", { name: "More actions for A" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
      rerender(list([b]));

      await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
    });

    it("leaves focus alone when it was somewhere else", () => {
      const outside = <button>elsewhere</button>;
      const { rerender } = render(list([pinnedA, b], outside));
      screen.getByRole("button", { name: "Pin A" }).focus();
      screen.getByRole("button", { name: "elsewhere" }).focus();

      rerender(list([b], outside));

      expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
    });

    it("does not grab focus for a card that lost focus before it left", async () => {
      const { rerender } = render(list([pinnedA, b]));
      screen.getByRole("button", { name: "Pin A" }).focus();
      (document.activeElement as HTMLElement).blur();
      await Promise.resolve();

      rerender(list([b]));

      expect(screen.getByRole("status")).not.toHaveFocus();
    });
  });

  it("keeps an open delete confirmation when the last plot goes away underneath it", async () => {
    const pinned = summary("a", { name: "A", pinned: true });
    const props = {
      plots: [pinned],
      selected: [] as string[],
      onToggle: vi.fn(),
      onSelectAll: vi.fn(),
      onDeselectAll: vi.fn(),
      onDelete: vi.fn(),
      onTogglePin: vi.fn(),
      onCycleColour: vi.fn(),
      onRename: vi.fn(),
      totalCount: 1,
      filtersActive: false,
      onClearFilters: vi.fn(),
      sortOrder: "newest" as SortOrder,
      onSortOrderChange: vi.fn(),
      ttlSeconds: 3600,
      emptyMessage: "Nothing here",
    };
    const { rerender } = renderWithTheme(<PlotList {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "More actions for A" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    rerender(
      <ThemeProvider>
        <PlotList {...props} plots={[]} totalCount={0} />
      </ThemeProvider>,
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancels a pinned delete", async () => {
    const props = setup({ plots: [summary("a", { name: "A", pinned: true })] });
    await userEvent.click(screen.getByRole("button", { name: "More actions for A" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("renames on double-click and Enter", async () => {
    const props = setup();
    await userEvent.dblClick(nameCellText("Scan 2"));
    const input = screen.getByRole("textbox", { name: "Rename Scan 2" });
    await userEvent.clear(input);
    await userEvent.type(input, "Better name{Enter}");
    expect(props.onRename).toHaveBeenCalledWith("a", "Better name");
    expect(props.onRename).toHaveBeenCalledOnce();
  });

  it("abandons a rename on Escape and ignores an unchanged name on blur", async () => {
    const props = setup();
    await userEvent.dblClick(nameCellText("Scan 2"));
    await userEvent.type(screen.getByRole("textbox", { name: "Rename Scan 2" }), " x{Escape}");
    expect(props.onRename).not.toHaveBeenCalled();

    await userEvent.dblClick(nameCellText("Scan 2"));
    await userEvent.click(document.body);
    expect(props.onRename).not.toHaveBeenCalled();
  });

  it("starts a rename from the row menu", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "More actions for Scan 10" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Rename Scan 10" })).toBeInTheDocument());
  });

  it("shows no time left when plots never expire", () => {
    setup({ ttlSeconds: 0 });
    expect(screen.queryByText("1h 0m")).not.toBeInTheDocument();
  });

  it("warns in the time text when a plot is about to expire", () => {
    setup({ plots: [summary("a", { name: "A", ttl_remaining_seconds: 60 })] });
    expect(screen.getByText("1m 0s")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar", { hidden: true })).not.toBeInTheDocument();
  });

  it("does not toggle the plot when an action button is clicked", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Pin Scan 2" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Show Scan 2" }));
    expect(props.onToggle).toHaveBeenCalledOnce();
  });
});
