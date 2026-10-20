import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { summary } from "../test/fixtures";
import { UNTYPED, useFacets } from "./useFacets";

const plots = [
  summary("a", { data_type: "pxrd", filenumber: 1 }),
  summary("b", { data_type: "pxrd", filenumber: 2 }),
  summary("c", { data_type: "gr", filenumber: 1 }),
  summary("d"),
];

const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("useFacets", () => {
  it("offers no facets without plots", () => {
    const { result } = renderHook(() => useFacets([]));
    expect(result.current.typeOptions).toEqual([]);
    expect(result.current.filenumberOptions).toEqual([]);
    expect(result.current.isActive).toBe(false);
  });

  it("counts types, sorted, with untyped last and no All entry", () => {
    const { result } = renderHook(() => useFacets(plots));
    expect(result.current.typeOptions).toEqual([
      { value: "gr", label: "GR", count: 1 },
      { value: "pxrd", label: "PXRD", count: 2 },
      { value: UNTYPED, label: "Untyped", count: 1 },
    ]);
    expect(result.current.filenumberOptions).toEqual([
      { value: "1", label: "#1", count: 2 },
      { value: "2", label: "#2", count: 1 },
    ]);
  });

  it("offers a single file number rather than hiding it", () => {
    const { result } = renderHook(() => useFacets([summary("a", { filenumber: 7 })]));
    expect(result.current.filenumberOptions).toEqual([{ value: "7", label: "#7", count: 1 }]);
  });

  it("shows everything while nothing is selected", () => {
    const { result } = renderHook(() => useFacets(plots));
    expect(result.current.dataTypes).toEqual([]);
    expect(result.current.filenumbers).toEqual([]);
    expect(ids(result.current.visible)).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by several types at once, including untyped", () => {
    const { result } = renderHook(() => useFacets(plots));

    act(() => result.current.setTypes(["pxrd"]));
    expect(ids(result.current.visible)).toEqual(["a", "b"]);
    expect(result.current.isActive).toBe(true);

    act(() => result.current.setTypes(["pxrd", "gr"]));
    expect(ids(result.current.visible)).toEqual(["a", "b", "c"]);

    act(() => result.current.setTypes(["gr", UNTYPED]));
    expect(ids(result.current.visible)).toEqual(["c", "d"]);
  });

  it("filters by several file numbers at once", () => {
    const { result } = renderHook(() => useFacets(plots));

    act(() => result.current.setFilenumbers(["2"]));
    expect(ids(result.current.visible)).toEqual(["b"]);

    act(() => result.current.setFilenumbers(["1", "2"]));
    expect(ids(result.current.visible)).toEqual(["a", "b", "c"]);
    expect(result.current.isActive).toBe(true);
  });

  it("scopes file numbers to the selected types", () => {
    const list = [...plots, summary("e", { data_type: "gr", filenumber: 3 })];
    const { result } = renderHook(() => useFacets(list));

    act(() => result.current.setTypes(["pxrd"]));
    expect(result.current.filenumberOptions.map((o) => o.value)).toEqual(["1", "2"]);

    act(() => result.current.setTypes(["gr"]));
    expect(result.current.filenumberOptions.map((o) => o.value)).toEqual(["1", "3"]);
  });

  it("keeps a selected file number across a type change while it is still offered", () => {
    const { result } = renderHook(() => useFacets(plots));
    act(() => result.current.setTypes(["pxrd"]));
    act(() => result.current.setFilenumbers(["1"]));

    act(() => result.current.setTypes(["gr"]));

    expect(result.current.filenumbers).toEqual(["1"]);
    expect(ids(result.current.visible)).toEqual(["c"]);
  });

  it("drops a selected file number once the new type has none of it", () => {
    const { result } = renderHook(() => useFacets(plots));
    act(() => result.current.setFilenumbers(["2"]));

    act(() => result.current.setTypes(["gr"]));

    expect(result.current.filenumbers).toEqual([]);
    expect(ids(result.current.visible)).toEqual(["c"]);
  });

  it("drops only the selected values that are no longer offered", () => {
    const { result, rerender } = renderHook(({ list }) => useFacets(list), {
      initialProps: { list: plots },
    });
    act(() => result.current.setTypes(["gr", "pxrd"]));
    act(() => result.current.setFilenumbers(["1"]));

    rerender({ list: plots.filter((p) => p.data_type !== "gr") });
    expect(result.current.dataTypes).toEqual(["pxrd"]);
    expect(result.current.filenumbers).toEqual(["1"]);

    rerender({ list: [] });
    expect(result.current.dataTypes).toEqual([]);
    expect(result.current.filenumbers).toEqual([]);
  });

  it("leaves the selection alone while it is all still offered", () => {
    const { result, rerender } = renderHook(({ list }) => useFacets(list), {
      initialProps: { list: plots },
    });
    act(() => result.current.setTypes(["pxrd"]));

    rerender({ list: [...plots, summary("e", { data_type: "pxrd", filenumber: 2 })] });

    expect(result.current.dataTypes).toEqual(["pxrd"]);
  });

  it("restores a persisted selection", () => {
    localStorage.setItem("xrpddatavis.facetDataTypes", JSON.stringify(["gr"]));
    const { result } = renderHook(() => useFacets(plots));
    expect(result.current.dataTypes).toEqual(["gr"]);
    expect(ids(result.current.visible)).toEqual(["c"]);
  });

  it("resets both filters", () => {
    const { result } = renderHook(() => useFacets(plots));
    act(() => result.current.setTypes(["pxrd"]));
    act(() => result.current.setFilenumbers(["2"]));
    expect(result.current.isActive).toBe(true);

    act(() => result.current.reset());

    expect(result.current.dataTypes).toEqual([]);
    expect(result.current.filenumbers).toEqual([]);
    expect(result.current.isActive).toBe(false);
    expect(ids(result.current.visible)).toEqual(["a", "b", "c", "d"]);
  });
});
