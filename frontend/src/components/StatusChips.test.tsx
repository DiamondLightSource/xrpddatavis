import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithTheme } from "../test/render";
import { ConnectionStatus, PlotCapacity } from "./StatusChips";

describe("ConnectionStatus", () => {
  it.each([
    ["live", "live"],
    ["polling", "polling"],
    ["down", "offline"],
    ["connecting", "connecting"],
  ] as const)("labels %s as %s", (connection, label) => {
    renderWithTheme(<ConnectionStatus connection={connection} />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });
});

describe("PlotCapacity", () => {
  it("shows how many plots are held and the ttl", () => {
    renderWithTheme(<PlotCapacity held={3} maxPlots={10} ttlSeconds={125} />);
    expect(screen.getByText("3 / 10 plots")).toBeInTheDocument();
    expect(screen.getByText("ttl 2m 5s")).toBeInTheDocument();
  });

  it("shows dashes before the limits are known", () => {
    renderWithTheme(<PlotCapacity held={0} maxPlots={0} ttlSeconds={0} />);
    expect(screen.getByText("0 / — plots")).toBeInTheDocument();
    expect(screen.getByText("ttl —")).toBeInTheDocument();
  });
});
