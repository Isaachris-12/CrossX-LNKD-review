import Constants from "expo-constants";

const DEV_SERVER_PORT = 4000;

// Infers the dev machine's LAN IP from the Expo packager's own host URI so
// the app can reach the local backend from a simulator OR a physical device
// on the same network without hardcoding an IP. Falls back to localhost
// (works for iOS simulator / web).
function inferDevApiBaseUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.hostUri;
  const host = hostUri?.split(":")[0];
  if (host) {
    return `http://${host}:${DEV_SERVER_PORT}`;
  }
  return `http://localhost:${DEV_SERVER_PORT}`;
}

export const API_BASE_URL = inferDevApiBaseUrl();
