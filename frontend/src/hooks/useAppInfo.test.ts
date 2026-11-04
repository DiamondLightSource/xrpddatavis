import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { useAppInfo } from "./useAppInfo";

describe("useAppInfo", () => {
  it("loads the beamline", async () => {
    vi.spyOn(api, "info").mockResolvedValue({ beamline: "i11", logout_url: "" });
    const { result } = renderHook(() => useAppInfo());
    await waitFor(() => expect(result.current.beamline).toBe("i11"));
  });

  it("leaves the beamline blank if the request fails", async () => {
    const info = vi.spyOn(api, "info").mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useAppInfo());
    await waitFor(() => expect(info).toHaveBeenCalled());
    expect(result.current.beamline).toBe("");
  });

  it("ignores a response that arrives after unmount", async () => {
    let resolve!: (value: { beamline: string; logout_url: string }) => void;
    vi.spyOn(api, "info").mockReturnValue(new Promise((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useAppInfo());
    unmount();
    resolve({ beamline: "i11", logout_url: "" });
    await Promise.resolve();
    expect(result.current.beamline).toBe("");
  });
});

describe("useAppInfo logout", () => {
  it("loads the logout URL", async () => {
    vi.spyOn(api, "info").mockResolvedValue({ beamline: "i11", logout_url: "/oauth2/sign_out" });
    const { result } = renderHook(() => useAppInfo());
    await waitFor(() => expect(result.current.logoutUrl).toBe("/oauth2/sign_out"));
  });
});
