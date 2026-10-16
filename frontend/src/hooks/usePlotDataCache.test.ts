import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { plotData, summary } from "../test/fixtures";
import { usePlotDataCache } from "./usePlotDataCache";

describe("usePlotDataCache", () => {
  it("fetches each plot once per version and drops stale entries", async () => {
    const plot = vi
      .spyOn(api, "plot")
      .mockImplementation(async (id) => plotData(id, undefined, { version: id === "a" ? 2 : 1 }));

    const { result, rerender } = renderHook(({ list }) => usePlotDataCache(list), {
      initialProps: { list: [summary("a"), summary("b")] },
    });
    await waitFor(() => expect(result.current.get("b")).toBeDefined());
    expect(plot).toHaveBeenCalledTimes(2);

    // same versions as cached: nothing new to fetch
    rerender({ list: [summary("a", { version: 2 }), summary("b")] });
    expect(plot).toHaveBeenCalledTimes(2);

    // b's version moved on and a is gone
    rerender({ list: [summary("b", { version: 5 })] });
    await waitFor(() => expect(plot).toHaveBeenCalledTimes(3));
    expect(result.current.get("a")).toBeUndefined();
  });

  it("reports a load error", async () => {
    vi.spyOn(api, "plot").mockRejectedValue(new Error("gone"));
    const { result } = renderHook(() => usePlotDataCache([summary("a", { name: "Scan 1" })]));
    await waitFor(() => expect(result.current.loadError).toBe('Could not load "Scan 1": gone'));
  });
});
