import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { api } from "../api/client";
import type { LivePlots } from "../api/types";
import { summary } from "../test/fixtures";
import { useLivePlots } from "./useLivePlots";

class FakeEventSource {
  static last: FakeEventSource | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
}

const payload = (revision: number): LivePlots => ({
  plots: [summary("a")],
  max_plots: 10,
  ttl_seconds: 60,
  revision,
});

let liveplots: MockInstance<typeof api.liveplots>;

beforeEach(() => {
  FakeEventSource.last = null;
  liveplots = vi.spyOn(api, "liveplots").mockResolvedValue(payload(1));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useLivePlots with server-sent events", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  it("loads the plot list and goes live when the stream opens", async () => {
    const { result } = renderHook(() => useLivePlots());

    await waitFor(() => expect(result.current.plots).toHaveLength(1));
    expect(result.current.limits).toEqual({ max_plots: 10, ttl_seconds: 60 });
    expect(result.current.revision).toBe(1);
    expect(result.current.updatedAt).toBeInstanceOf(Date);
    expect(result.current.connection).toBe("polling");

    act(() => FakeEventSource.last!.onopen!());
    expect(result.current.connection).toBe("live");
  });

  it("refreshes only for a new revision or an unreadable message", async () => {
    const { result } = renderHook(() => useLivePlots());
    await waitFor(() => expect(result.current.revision).toBe(1));
    const source = FakeEventSource.last!;

    act(() => source.onmessage!({ data: JSON.stringify({ revision: 1 }) }));
    expect(liveplots).toHaveBeenCalledTimes(1);

    liveplots.mockResolvedValue(payload(2));
    act(() => source.onmessage!({ data: JSON.stringify({ revision: 2 }) }));
    await waitFor(() => expect(result.current.revision).toBe(2));

    act(() => source.onmessage!({ data: "keep-alive" }));
    await waitFor(() => expect(liveplots).toHaveBeenCalledTimes(3));
  });

  it("shares one in-flight refresh between callers", async () => {
    const { result } = renderHook(() => useLivePlots());
    await waitFor(() => expect(liveplots).toHaveBeenCalledTimes(1));
    liveplots.mockClear();

    await act(() => Promise.all([result.current.refresh(), result.current.refresh()]));
    expect(liveplots).toHaveBeenCalledTimes(1);
  });

  it("reports the server as down when a refresh fails", async () => {
    liveplots.mockRejectedValue(new Error("unreachable"));
    const { result } = renderHook(() => useLivePlots());
    await waitFor(() => expect(result.current.connection).toBe("down"));
    expect(result.current.error).toBe("unreachable");
  });

  it("falls back to polling when the stream errors, and closes it on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, unmount } = renderHook(() => useLivePlots());
    await waitFor(() => expect(liveplots).toHaveBeenCalledTimes(1));
    const source = FakeEventSource.last!;

    act(() => source.onerror!());
    expect(result.current.connection).toBe("polling");

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(liveplots).toHaveBeenCalledTimes(2);

    act(() => source.onopen!());
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(liveplots).toHaveBeenCalledTimes(2);

    unmount();
    expect(source.close).toHaveBeenCalled();
  });
});

describe("useLivePlots without EventSource", () => {
  it("polls", async () => {
    vi.stubGlobal("EventSource", undefined);
    // "EventSource" in window is what the hook checks
    delete (window as { EventSource?: unknown }).EventSource;
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useLivePlots());
    await waitFor(() => expect(result.current.connection).toBe("polling"));

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(liveplots).toHaveBeenCalledTimes(2);
  });
});
