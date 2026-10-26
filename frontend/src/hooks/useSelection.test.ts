import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSelection } from "./useSelection";

describe("useSelection", () => {
  it("toggles, forces, selects and deselects ids", () => {
    const { result } = renderHook(() => useSelection(["a", "b", "c"], null));

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
    const { result, rerender } = renderHook(({ ids }) => useSelection(ids, null), {
      initialProps: { ids: ["a", "b"] },
    });
    act(() => result.current.selectMany(["a", "b"]));

    rerender({ ids: ["b"] });

    expect(result.current.selected).toEqual(["b"]);
  });

  describe("newest plot", () => {
    interface Props {
      ids: string[];
      newest: string | null;
    }
    const render = (initial: Props) =>
      renderHook(({ ids, newest }: Props) => useSelection(ids, newest), { initialProps: initial });

    it("ticks the newest plot when plots first arrive and nothing is selected", () => {
      const { result, rerender } = render({ ids: [], newest: null });
      expect(result.current.selected).toEqual([]);

      rerender({ ids: ["a", "b"], newest: "b" });

      expect(result.current.selected).toEqual(["b"]);
    });

    it("ticks it straight away if plots are there on first render", () => {
      const { result } = render({ ids: ["a", "b"], newest: "a" });
      expect(result.current.selected).toEqual(["a"]);
    });

    it("keeps an existing (persisted) selection instead", () => {
      localStorage.setItem("xrpddatavis.selected", JSON.stringify(["a"]));
      const { result } = render({ ids: ["a", "b"], newest: "b" });
      expect(result.current.selected).toEqual(["a"]);
    });

    it("ticks only once, so clearing the selection sticks", () => {
      const { result, rerender } = render({ ids: ["a"], newest: "a" });
      expect(result.current.selected).toEqual(["a"]);

      act(() => result.current.clear());
      rerender({ ids: ["a", "b"], newest: "b" });

      expect(result.current.selected).toEqual([]);
    });
  });
});
