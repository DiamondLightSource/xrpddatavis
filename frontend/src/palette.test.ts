import { describe, expect, it } from "vitest";
import { PALETTE, seriesColour } from "./palette";

describe("seriesColour", () => {
  it("picks the slot for the colour scheme", () => {
    expect(seriesColour(0, "light")).toBe(PALETTE.light[0]);
    expect(seriesColour(3, "dark")).toBe(PALETTE.dark[3]);
  });

  it("wraps past the last slot", () => {
    expect(seriesColour(PALETTE.light.length + 1, "light")).toBe(PALETTE.light[1]);
  });
});
