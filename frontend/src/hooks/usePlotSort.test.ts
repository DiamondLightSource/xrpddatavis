import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { summary } from "../test/fixtures";
import { DEFAULT_SORT, SORT_OPTIONS, sortPlots, usePlotSort, type SortOrder } from "./usePlotSort";

const plots = [
  summary("a", { name: "Scan 2", points: 100, filenumber: 2, created_at: "2026-01-01T00:00:02Z" }),
  summary("b", { name: "Scan 10", points: 50, filenumber: 10, created_at: "2026-01-01T00:00:01Z" }),
  summary("c", { name: "Scan 1", points: 75, filenumber: null, created_at: "2026-01-01T00:00:03Z" }),
  summary("d", { name: "Scan 3", points: 75, filenumber: 3, created_at: "2026-01-01T00:00:00Z" }),
];

const order = (by: SortOrder) => sortPlots(plots, by).map((p) => p.id);

describe("sortPlots", () => {
  it("sorts by age, newest or oldest first", () => {
    expect(order("newest")).toEqual(["c", "a", "b", "d"]);
    expect(order("oldest")).toEqual(["d", "b", "a", "c"]);
  });

  it("sorts names naturally", () => {
    expect(order("name-asc")).toEqual(["c", "a", "d", "b"]);
    expect(order("name-desc")).toEqual(["b", "d", "a", "c"]);
  });

  it("sorts by point count, breaking ties by id", () => {
    expect(order("points-desc")).toEqual(["a", "c", "d", "b"]);
    expect(order("points-asc")).toEqual(["b", "c", "d", "a"]);
  });

  it("sorts by file number with plots lacking one last either way", () => {
    expect(order("file-asc")).toEqual(["a", "d", "b", "c"]);
    expect(order("file-desc")).toEqual(["b", "d", "a", "c"]);
  });

  it("leaves the input untouched", () => {
    const before = plots.map((p) => p.id);
    sortPlots(plots, "name-asc");
    expect(plots.map((p) => p.id)).toEqual(before);
  });

  it("has a label for every order", () => {
    expect(SORT_OPTIONS.map((o) => o.value)).toContain(DEFAULT_SORT);
    expect(new Set(SORT_OPTIONS.map((o) => o.label)).size).toBe(SORT_OPTIONS.length);
  });
});

describe("usePlotSort", () => {
  it("starts newest first", () => {
    const { result } = renderHook(() => usePlotSort(plots));
    expect(result.current.order).toBe("newest");
    expect(result.current.sorted.map((p) => p.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("re-sorts and remembers the choice", () => {
    const { result } = renderHook(() => usePlotSort(plots));
    act(() => result.current.setOrder("points-asc"));
    expect(result.current.sorted.map((p) => p.id)).toEqual(["b", "c", "d", "a"]);
    expect(localStorage.getItem("xrpddatavis.sortOrder")).toBe('"points-asc"');
  });

  it("restores a stored order", () => {
    localStorage.setItem("xrpddatavis.sortOrder", JSON.stringify("name-desc"));
    const { result } = renderHook(() => usePlotSort(plots));
    expect(result.current.order).toBe("name-desc");
  });

  it("falls back to the default for a stored order it does not know", () => {
    localStorage.setItem("xrpddatavis.sortOrder", JSON.stringify("ttl"));
    const { result } = renderHook(() => usePlotSort(plots));
    expect(result.current.order).toBe("newest");
    expect(result.current.sorted.map((p) => p.id)).toEqual(["c", "a", "b", "d"]);
  });
});
