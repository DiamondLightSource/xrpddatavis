import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./client";

function respond(status: number, body?: unknown, statusText = "") {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, statusText });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("api", () => {
  it("GETs JSON without caching", async () => {
    fetchMock.mockResolvedValue(respond(200, { beamline: "i11" }));

    await expect(api.info()).resolves.toEqual({ beamline: "i11" });

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("info");
    expect(init?.cache).toBe("no-store");
  });

  it("hits the right path for each read", async () => {
    fetchMock.mockImplementation(async () => respond(200, {}));
    await api.liveplots();
    await api.plot("abc");
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(["liveplots", "plot/abc"]);
  });

  it("POSTs a plot as JSON", async () => {
    fetchMock.mockResolvedValue(respond(200, { id: "new" }));

    await api.post({ title: "t", x: [1], y: [2] });

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("plot");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ title: "t", x: [1], y: [2] });
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("PATCHes edits and returns nothing for a 204", async () => {
    fetchMock.mockResolvedValue(respond(204));

    await expect(api.edit("abc", { pinned: true })).resolves.toBeUndefined();

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("edit/abc");
    expect(init?.method).toBe("PATCH");
  });

  it("DELETEs one plot or all of them", async () => {
    fetchMock.mockResolvedValueOnce(respond(204)).mockResolvedValueOnce(respond(200, { removed: 3 }));

    await api.remove("abc");
    await expect(api.clearAll()).resolves.toEqual({ removed: 3 });

    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([
      ["remove/abc", "DELETE"],
      ["plots", "DELETE"],
    ]);
  });

  it("raises the server's detail message on an error", async () => {
    fetchMock.mockResolvedValue(respond(404, { detail: "no such plot" }));
    await expect(api.plot("x")).rejects.toThrow(new ApiError("no such plot"));
  });

  it("falls back to the status line for a non-JSON error body", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500, statusText: "Server Error" }));
    await expect(api.plot("x")).rejects.toThrow("500 Server Error");
  });
});
