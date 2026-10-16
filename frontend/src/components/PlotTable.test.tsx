import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlotSummary } from "../api/types";
import { summary } from "../test/fixtures";
import { renderWithTheme } from "../test/render";
import { PlotTable } from "./PlotTable";

const plots = [
  summary("a", { name: "Scan 2", points: 100, created_at: "2026-01-01T00:00:02Z", data_type: "pxrd", filenumber: 7 }),
  summary("b", { name: "Scan 10", points: 50, created_at: "2026-01-01T00:00:01Z", has_fit: true, colour_index: 3 }),
];

function setup(overrides: Partial<React.ComponentProps<typeof PlotTable>> = {}) {
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
    ttlSeconds: 3600,
    emptyMessage: "Nothing here",
    ...overrides,
  };
  renderWithTheme(<PlotTable {...props} />);
  return props;
}

const nameCellText = (name: string) => screen.getByText(name, { selector: "p" });

describe("PlotTable", () => {
  it("shows the empty message without plots", () => {
    setup({ plots: [] });
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("lists plots newest first with their details", () => {
    setup();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Scan 2");
    expect(screen.getByText("PXRD · #7 · errors")).toBeInTheDocument();
    expect(screen.getByText("errors · fit")).toBeInTheDocument();
    expect(screen.getAllByText("1h 0m")).toHaveLength(2);
  });

  it("sorts by name naturally, then reverses", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Scan 2");
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Scan 10");
  });

  it("sorts by point count and back to age", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Pts" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Scan 2");
    await userEvent.click(screen.getByRole("button", { name: "Pts" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Scan 10");
    await userEvent.click(screen.getByRole("button", { name: "TTL" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Scan 2");
  });

  it("selects all listed plots", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all listed plots" }));
    expect(props.onSelectAll).toHaveBeenCalledWith(["a", "b"]);
  });

  it("deselects all when everything is already selected", async () => {
    const props = setup({ selected: ["a", "b"] });
    await userEvent.click(screen.getByRole("checkbox", { name: "Deselect all listed plots" }));
    expect(props.onDeselectAll).toHaveBeenCalledWith(["a", "b"]);
  });

  it("marks the header checkbox indeterminate for a partial selection", () => {
    setup({ selected: ["a"] });
    expect(screen.getByRole("checkbox", { name: "Select all listed plots" })).toHaveAttribute(
      "data-indeterminate",
      "true",
    );
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

  it("shows nothing in the TTL column when plots never expire", () => {
    setup({ ttlSeconds: 0 });
    expect(screen.queryByText("1h 0m")).not.toBeInTheDocument();
  });
});
