import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { summary } from "../test/fixtures";
import { ALL, UNTYPED, useFacets } from "./useFacets";

const plots = [
  summary("a", { data_type: "pxrd", filenumber: 1 }),
  summary("b", { data_type: "pxrd", filenumber: 2 }),
  summary("c", { data_type: "gr", filenumber: 1 }),
  summary("d"),
];

describe("useFacets", () => {
  it("offers no facets without plots", () => {
    const { result } = renderHook(() => useFacets([]));
    expect(result.current.typeOptions).toEqual([]);
    expect(result.current.filenumberOptions).toEqual([]);
    expect(result.current.isActive).toBe(false);
  });

  it("counts types, sorted, with untyped last", () => {
    const { result } = renderHook(() => useFacets(plots));
    expect(result.current.typeOptions).toEqual([
      { value: ALL, label: "All", count: 4 },
      { value: "gr", label: "GR", count: 1 },
      { value: "pxrd", label: "PXRD", count: 2 },
      { value: UNTYPED, label: "Untyped", count: 1 },
    ]);
    expect(result.current.filenumberOptions.map((o) => o.label)).toEqual(["All", "#1", "#2"]);
  });

  it("filters by type and then by file number", () => {
    const { result } = renderHook(() => useFacets(plots));

    act(() => result.current.setType("pxrd"));
    expect(result.current.visible.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result.current.isActive).toBe(true);

    act(() => result.current.setFilenumber("2"));
    expect(result.current.visible.map((p) => p.id)).toEqual(["b"]);

    act(() => result.current.setType(UNTYPED));
    expect(result.current.filenumber).toBe(ALL);
    expect(result.current.visible.map((p) => p.id)).toEqual(["d"]);
  });

  it("resets a choice that is no longer offered", () => {
    const { result, rerender } = renderHook(({ list }) => useFacets(list), {
      initialProps: { list: plots },
    });
    act(() => result.current.setType("gr"));
    act(() => result.current.setFilenumber("1"));

    rerender({ list: plots.filter((p) => p.data_type !== "gr") });
    expect(result.current.dataType).toBe(ALL);

    rerender({ list: [] });
    expect(result.current.dataType).toBe(ALL);
    expect(result.current.filenumber).toBe(ALL);
  });
});
