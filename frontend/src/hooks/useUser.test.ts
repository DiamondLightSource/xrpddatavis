import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { useUser } from "./useUser";

const ADA = { fedid: "abc12345", name: "Ada Lovelace", email: null };

describe("useUser", () => {
  it("loads the logged-in user", async () => {
    vi.spyOn(api, "user").mockResolvedValue(ADA);
    const { result } = renderHook(() => useUser());
    await waitFor(() => expect(result.current.user).toEqual(ADA));
  });

  it("stays null when auth is turned off", async () => {
    const user = vi.spyOn(api, "user").mockResolvedValue(undefined);
    const { result } = renderHook(() => useUser());
    await waitFor(() => expect(user).toHaveBeenCalled());
    expect(result.current.user).toBeNull();
  });

  it("stays null if the request fails", async () => {
    const user = vi.spyOn(api, "user").mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useUser());
    await waitFor(() => expect(user).toHaveBeenCalled());
    expect(result.current.user).toBeNull();
  });
});
