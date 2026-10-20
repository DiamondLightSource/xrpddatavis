import type { ComponentProps } from "react";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "../test/render";
import { Facets } from "./Facets";

const typeOptions = [
  { value: "gr", label: "GR", count: 1 },
  { value: "pxrd", label: "PXRD", count: 2 },
];
const filenumberOptions = [
  { value: "1", label: "#1", count: 2 },
  { value: "2", label: "#2", count: 1 },
];
const letters = ["a", "b", "c", "d"].map((v) => ({ value: v, label: v.toUpperCase(), count: 1 }));

function setup(props: Partial<ComponentProps<typeof Facets>> = {}) {
  const onTypesChange = vi.fn();
  const onFilenumbersChange = vi.fn();
  renderWithTheme(
    <Facets
      typeOptions={typeOptions}
      dataTypes={[]}
      onTypesChange={onTypesChange}
      filenumberOptions={filenumberOptions}
      filenumbers={[]}
      onFilenumbersChange={onFilenumbersChange}
      {...props}
    />,
  );
  return { onTypesChange, onFilenumbersChange };
}

const typeSelect = () => screen.getByRole("combobox", { name: /Filter by data type/ });
const fileSelect = () => screen.getByRole("combobox", { name: /Filter by file number/ });

describe("Facets", () => {
  it("shows All while nothing is selected", () => {
    setup();
    expect(typeSelect()).toHaveTextContent("All");
    expect(fileSelect()).toHaveTextContent("All");
  });

  it("lists the options with counts and ticked state", async () => {
    setup({ dataTypes: ["pxrd"] });
    await userEvent.click(typeSelect());

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["GR1", "PXRD2"]);
    expect(within(options[0]).getByRole("checkbox")).not.toBeChecked();
    expect(within(options[1]).getByRole("checkbox")).toBeChecked();
  });

  it("reports the full new selection when an option is added or removed", async () => {
    const { onTypesChange } = setup({ dataTypes: ["gr"] });
    await userEvent.click(typeSelect());

    await userEvent.click(screen.getByRole("option", { name: /PXRD/ }));
    expect(onTypesChange).toHaveBeenLastCalledWith(["gr", "pxrd"]);

    await userEvent.click(screen.getByRole("option", { name: /GR/ }));
    expect(onTypesChange).toHaveBeenLastCalledWith([]);
  });

  it("reports file number picks separately from type picks", async () => {
    const { onTypesChange, onFilenumbersChange } = setup();
    await userEvent.click(fileSelect());
    await userEvent.click(screen.getByRole("option", { name: /#2/ }));

    expect(onFilenumbersChange).toHaveBeenCalledWith(["2"]);
    expect(onTypesChange).not.toHaveBeenCalled();
  });

  it("accepts a plain string value, as a browser autofill would send", () => {
    const { onTypesChange } = setup();
    const native = typeSelect().parentElement!.querySelector("input.MuiSelect-nativeInput")!;
    fireEvent.change(native, { target: { value: "gr" } });
    expect(onTypesChange).toHaveBeenCalledWith(["gr"]);
  });

  it("names up to three selections", () => {
    setup({ typeOptions: letters, dataTypes: ["a", "b", "c"] });
    expect(typeSelect()).toHaveTextContent("A, B, C");
  });

  it("counts the selections when there are more than three", () => {
    setup({ typeOptions: letters, dataTypes: ["a", "b", "c", "d"] });
    expect(typeSelect()).toHaveTextContent("4 selected");
  });

  it("falls back to the raw value for a selection with no matching option", () => {
    setup({ dataTypes: ["mystery"] });
    expect(typeSelect()).toHaveTextContent("mystery");
  });

  it("stays in the row, disabled, with a dash when there is nothing to choose", () => {
    setup({ typeOptions: [], filenumberOptions: [] });
    expect(typeSelect()).toHaveAttribute("aria-disabled", "true");
    expect(typeSelect()).toHaveTextContent("–");
    expect(fileSelect()).toHaveAttribute("aria-disabled", "true");
  });

  it("shows a lone option as the value, disabled", () => {
    setup({ filenumberOptions: [{ value: "7", label: "#7", count: 3 }] });
    expect(fileSelect()).toHaveAttribute("aria-disabled", "true");
    expect(fileSelect()).toHaveTextContent("#7");
    expect(typeSelect()).not.toHaveAttribute("aria-disabled", "true");
  });
});
