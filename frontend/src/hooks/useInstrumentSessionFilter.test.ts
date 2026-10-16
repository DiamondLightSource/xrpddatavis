import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { summary } from "../test/fixtures";
import { ALL_SESSIONS, useInstrumentSessionFilter } from "./useInstrumentSessionFilter";

const plots = [
  summary("a", { instrument_session: "cm1-2" }),
  summary("b", { instrument_session: "cm1-1" }),
  summary("c", { instrument_session: "cm1-2" }),
  summary("d"),
];

describe("useInstrumentSessionFilter", () => {
  it("has no options when no plot has a session", () => {
    const { result } = renderHook(() => useInstrumentSessionFilter([summary("x")]));
    expect(result.current.options).toEqual([]);
    expect(result.current.filtered).toHaveLength(1);
  });

  it("lists sessions with counts and filters to one", () => {
    const { result } = renderHook(() => useInstrumentSessionFilter(plots));
    expect(result.current.options).toEqual([
      { value: ALL_SESSIONS, label: "All sessions", count: 4 },
      { value: "cm1-1", label: "cm1-1", count: 1 },
      { value: "cm1-2", label: "cm1-2", count: 2 },
    ]);

    act(() => result.current.setSession("cm1-2"));
    expect(result.current.filtered.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("resets when the chosen session stops being live", () => {
    const { result, rerender } = renderHook(({ list }) => useInstrumentSessionFilter(list), {
      initialProps: { list: plots },
    });
    act(() => result.current.setSession("cm1-1"));

    rerender({ list: plots.filter((p) => p.instrument_session !== "cm1-1") });
    expect(result.current.session).toBe(ALL_SESSIONS);

    act(() => result.current.setSession("cm1-2"));
    rerender({ list: [summary("d")] });
    expect(result.current.session).toBe(ALL_SESSIONS);
  });
});
