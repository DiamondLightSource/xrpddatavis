import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePersistentState } from "./usePersistentState";

describe("usePersistentState", () => {
  it("starts from the fallback and persists updates", () => {
    const { result } = renderHook(() => usePersistentState("count", 1));
    expect(result.current[0]).toBe(1);

    act(() => result.current[1]((prev) => prev + 1));

    expect(result.current[0]).toBe(2);
    expect(localStorage.getItem("xrpddatavis.count")).toBe("2");
  });

  it("reads a previously stored value", () => {
    localStorage.setItem("xrpddatavis.mode", JSON.stringify("grid"));
    const { result } = renderHook(() => usePersistentState("mode", "overlay"));
    expect(result.current[0]).toBe("grid");
  });

  it("falls back on unreadable storage and keeps working when writes fail", () => {
    localStorage.setItem("xrpddatavis.bad", "{not json");
    const { result } = renderHook(() => usePersistentState("bad", "fallback"));
    expect(result.current[0]).toBe("fallback");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    act(() => result.current[1]("next"));
    expect(result.current[0]).toBe("next");
  });
});
