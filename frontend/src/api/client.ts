import type {
  AppInfo,
  LivePlots,
  PlotData,
  PlotRequest,
  PlotResponse,
  PlotUpdate,
  User,
} from "./types";

export class ApiError extends Error {}

/** oauth2-proxy's login route - it bounces through Keycloak and back to `rd`. */
export const LOGIN_PATH = "/oauth2/start";
// a 401 straight after logging in means the server rejects even a fresh token
// (e.g. a misconfigured audience) - don't bounce the user round in a loop
const LOGIN_ATTEMPT_KEY = "xrpddatavis.loginAttempt";
const LOGIN_RETRY_MS = 30_000;

/** The session has expired (or never existed): send the browser back through
 * login, returning to this page. Returns false if we only just tried. */
export function redirectToLogin(): boolean {
  try {
    const last = Number(sessionStorage.getItem(LOGIN_ATTEMPT_KEY) ?? 0);
    if (Date.now() - last < LOGIN_RETRY_MS) return false;
    sessionStorage.setItem(LOGIN_ATTEMPT_KEY, String(Date.now()));
  } catch {
    /* no sessionStorage - redirect anyway */
  }
  const here = window.location.pathname + window.location.search;
  window.location.assign(`${LOGIN_PATH}?rd=${encodeURIComponent(here)}`);
  return true;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    // Accept: application/json also tells oauth2-proxy to answer an expired
    // session with a 401 rather than a redirect fetch can't follow
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (response.status === 401 && redirectToLogin()) {
    throw new ApiError("Session expired - logging in again");
  }
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
  /** undefined when the server has auth turned off */
  user: () => request<User | undefined>("user"),
  plot: (id: string) => request<PlotData>(`plot/${id}`),
  post: (body: PlotRequest) => request<PlotResponse>("plot", { method: "POST", ...json(body) }),
  edit: (id: string, changes: PlotUpdate) =>
    request<void>(`edit/${id}`, { method: "PATCH", ...json(changes) }),
  remove: (id: string) => request<void>(`remove/${id}`, { method: "DELETE" }),
  clearAll: () => request<{ removed: number }>("plots", { method: "DELETE" }),
};
