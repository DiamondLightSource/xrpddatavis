import { describe, expect, it } from "vitest";
import { fmtDuration, fmtNumber } from "./format";

describe("fmtNumber", () => {
  it("shows non-finite values as a dash", () => {
    expect(fmtNumber(NaN)).toBe("—");
    expect(fmtNumber(Infinity)).toBe("—");
  });

  it("keeps five significant figures in the normal range", () => {
    expect(fmtNumber(0)).toBe("0");
    expect(fmtNumber(1.234567)).toBe("1.2346");
    expect(fmtNumber(-42)).toBe("-42");
  });

  it("switches to exponential for very small or large values", () => {
    expect(fmtNumber(0.0001234)).toBe("1.23e-4");
    expect(fmtNumber(123456)).toBe("1.23e+5");
  });
});

describe("fmtDuration", () => {
  it("clamps non-positive and non-finite values to 0s", () => {
    expect(fmtDuration(0)).toBe("0s");
    expect(fmtDuration(-5)).toBe("0s");
    expect(fmtDuration(NaN)).toBe("0s");
  });

  it("formats seconds, minutes and hours", () => {
    expect(fmtDuration(42.4)).toBe("42s");
    expect(fmtDuration(125)).toBe("2m 5s");
    expect(fmtDuration(3725)).toBe("1h 2m");
  });
});
