import * as SecureStore from "expo-secure-store";
import type { AuthTokens } from "@crossx/shared";

const ACCESS_TOKEN_KEY = "crossx_access_token";
const REFRESH_TOKEN_KEY = "crossx_refresh_token";

let accessToken: string | null = null;
let refreshToken: string | null = null;

export async function loadPersistedTokens(): Promise<AuthTokens | { accessToken: null; refreshToken: null }> {
  const [a, r] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  accessToken = a;
  refreshToken = r;
  return { accessToken, refreshToken } as AuthTokens;
}

export async function setTokens(tokens: AuthTokens): Promise<void> {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}
