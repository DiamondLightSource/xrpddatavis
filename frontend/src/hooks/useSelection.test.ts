import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSelection } from "./useSelection";

describe("useSelection", () => {
  it("toggles, forces, selects and deselects ids", () => {
    const { result } = renderHook(() => useSelection(["a", "b", "c"]));

    act(() => result.current.toggle("a"));
    expect(result.current.selected).toEqual(["a"]);

    act(() => result.current.toggle("a", true));
    expect(result.current.selected).toEqual(["a"]);

    act(() => result.current.selectMany(["a", "b", "c"]));
    expect(result.current.selected).toEqual(["a", "b", "c"]);

    act(() => result.current.deselectMany(["a", "c"]));
    expect(result.current.selected).toEqual(["b"]);

    act(() => result.current.toggle("b"));
    expect(result.current.selected).toEqual([]);

    act(() => result.current.selectMany(["c"]));
    act(() => result.current.clear());
    expect(result.current.selected).toEqual([]);
  });

  it("drops ids that are no longer live", () => {
    const { result, rerender } = renderHook(({ ids }) => useSelection(ids), {
      initialProps: { ids: ["a", "b"] },
    });
    act(() => result.current.selectMany(["a", "b"]));

    rerender({ ids: ["b"] });

    expect(result.current.selected).toEqual(["b"]);
  });
});
