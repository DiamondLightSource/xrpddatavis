import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "../test/render";
import { ListToolbar } from "./ListToolbar";

function setup(overrides: Partial<React.ComponentProps<typeof ListToolbar>> = {}) {
  const props = {
    filterText: "",
    onFilterTextChange: vi.fn(),
    onUpload: vi.fn(),
    onClearServer: vi.fn(),
    canClearServer: true,
    ...overrides,
  };
  renderWithTheme(<ListToolbar {...props} />);
  return props;
}

describe("ListToolbar", () => {
  it("reports typing in the search box", async () => {
    const props = setup();
    await userEvent.type(screen.getByRole("searchbox", { name: /Filter plots/ }), "a");
    expect(props.onFilterTextChange).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("clears the search", async () => {
    const props = setup({ filterText: "scan" });
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(props.onFilterTextChange).toHaveBeenCalledWith("");
  });

  it("opens the upload dialog", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(props.onUpload).toHaveBeenCalled();
  });

  it("offers delete-all from the menu", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "More list actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete all plots/ }));
    expect(props.onClearServer).toHaveBeenCalled();
  });

  it("disables delete-all with nothing to delete", async () => {
    setup({ canClearServer: false });
    await userEvent.click(screen.getByRole("button", { name: "More list actions" }));
    expect(screen.getByRole("menuitem", { name: /Delete all plots/ })).toHaveAttribute("aria-disabled", "true");
  });
});
