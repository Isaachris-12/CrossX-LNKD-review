import type { AuthTokens } from "@crossx/shared";
import { API_BASE_URL } from "./config";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "../auth/tokenStore";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function rawRequest(path: string, options: RequestInit, accessToken?: string | null) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}

async function parseErrorOrThrow(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}) as { error?: string });
  throw new ApiError(res.status, body.error ?? `Request failed with status ${res.status}`);
}

async function readBody<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await rawRequest("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    await clearTokens();
    return null;
  }
  const tokens: AuthTokens = await res.json();
  await setTokens(tokens);
  return tokens.accessToken;
}

// For unauthenticated calls (signup/login).
export async function publicFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await rawRequest(path, options, null);
  if (!res.ok) return parseErrorOrThrow(res);
  return readBody<T>(res);
}

// For authenticated calls: attaches the current access token and, on a
// single 401, attempts one silent refresh-and-retry before giving up.
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res = await rawRequest(path, options, getAccessToken());

  if (res.status === 401) {
    const refreshedAccessToken = await tryRefresh();
    if (refreshedAccessToken) {
      res = await rawRequest(path, options, refreshedAccessToken);
    }
  }

  if (!res.ok) return parseErrorOrThrow(res);
  return readBody<T>(res);
}
