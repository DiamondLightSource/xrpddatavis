import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ALL } from "../hooks/useFacets";
import { renderWithTheme } from "../test/render";
import { Facets } from "./Facets";

describe("Facets", () => {
  it("renders only the rows that have options and reports picks", async () => {
    const onTypeChange = vi.fn();
    renderWithTheme(
      <Facets
        typeOptions={[
          { value: ALL, label: "All", count: 3 },
          { value: "gr", label: "GR", count: 1 },
        ]}
        dataType={ALL}
        onTypeChange={onTypeChange}
        filenumberOptions={[]}
        filenumber={ALL}
        onFilenumberChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "Filter by data type" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by file number" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /GR/ }));
    expect(onTypeChange).toHaveBeenCalledWith("gr");

    // clicking the active option un-presses it; that must not clear the facet
    await userEvent.click(screen.getByRole("button", { name: /All/ }));
    expect(onTypeChange).toHaveBeenCalledTimes(1);
  });
});
