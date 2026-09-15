import type { AppInfo, LivePlots, PlotData, PlotRequest, PlotResponse, PlotUpdate } from "./types";

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { Accept: "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function json(body: unknown): RequestInit {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const api = {
  liveplots: () => request<LivePlots>("liveplots"),
  info: () => request<AppInfo>("info"),
  plot: (id: string) => request<PlotData>(`plot/${id}`),
  post: (body: PlotRequest) => request<PlotResponse>("plot", { method: "POST", ...json(body) }),
  edit: (id: string, changes: PlotUpdate) =>
    request<void>(`edit/${id}`, { method: "PATCH", ...json(changes) }),
  remove: (id: string) => request<void>(`remove/${id}`, { method: "DELETE" }),
  clearAll: () => request<{ removed: number }>("plots", { method: "DELETE" }),
};
