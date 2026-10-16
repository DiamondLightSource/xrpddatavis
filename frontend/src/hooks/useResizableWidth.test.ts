import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { useResizableWidth } from "./useResizableWidth";

const keyEvent = (key: string, shiftKey = false) =>
  ({ key, shiftKey, preventDefault: vi.fn() }) as unknown as React.KeyboardEvent<HTMLDivElement>;

describe("useResizableWidth", () => {
  it("resizes with the arrow keys, clamped to the limits", () => {
    const { result } = renderHook(() => useResizableWidth(400, 300, 500));

    act(() => result.current.onKeyDown(keyEvent("ArrowRight")));
    expect(result.current.width).toBe(420);

    act(() => result.current.onKeyDown(keyEvent("ArrowLeft", true)));
    expect(result.current.width).toBe(360);

    act(() => result.current.onKeyDown(keyEvent("ArrowLeft", true)));
    act(() => result.current.onKeyDown(keyEvent("ArrowLeft", true)));
    expect(result.current.width).toBe(300);

    act(() => result.current.onKeyDown(keyEvent("Enter")));
    expect(result.current.width).toBe(300);
  });

  it("follows the pointer only while dragging", () => {
    const { result } = renderHook(() => useResizableWidth(400, 300, 600));
    const container = document.createElement("div");
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({ left: 100 } as DOMRect);
    (result.current.containerRef as { current: HTMLDivElement | null }).current = container;

    const move = { clientX: 550 } as React.PointerEvent<HTMLDivElement>;
    act(() => result.current.onPointerMove(move));
    expect(result.current.width).toBe(400);

    const down = {
      pointerId: 1,
      currentTarget: { setPointerCapture: vi.fn() },
    } as unknown as React.PointerEvent<HTMLDivElement>;
    act(() => result.current.onPointerDown(down));
    expect(result.current.dragging).toBe(true);

    act(() => result.current.onPointerMove(move));
    expect(result.current.width).toBe(450);

    act(() => result.current.onPointerUp());
    expect(result.current.dragging).toBe(false);
  });

  it("shrinks to fit a narrower window", () => {
    const { result } = renderHook(() => useResizableWidth(600, 300, 700));
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(740);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.width).toBe(500);
  });
});
