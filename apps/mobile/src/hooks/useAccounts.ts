import { useCallback, useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import type { ConnectedAccountSummary, Platform } from "@crossx/shared";
import { apiFetch, ApiError } from "../api/client";

// Lets the OAuth browser session close itself and hand control back to this
// screen once the platform's dialog redirects to our custom scheme.
WebBrowser.maybeCompleteAuthSession();

const APP_SCHEME = "crossxlnkd";
const OAUTH_RETURN_URL = `${APP_SCHEME}://oauth-complete`;

export function useAccounts() {
  const [accounts, setAccounts] = useState<ConnectedAccountSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A 403 from /oauth/:platform/start or DELETE /accounts/:id means the
  // free/trial plan limit was hit - the screen can offer an "Upgrade" action
  // instead of just showing the error text.
  const [isUpgradeError, setIsUpgradeError] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<ConnectedAccountSummary[]>("/accounts");
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Note: testing this redirect end-to-end requires a dev client build
  // (expo run:android / expo run:ios / an EAS dev build) rather than Expo
  // Go, since Expo Go doesn't reliably hand off arbitrary custom-scheme
  // redirects to a third-party app's own deep link handler.
  //
  // `prepInput` carries the one extra field a handful of platforms need
  // before OAuth can even start (e.g. Mastodon's instance domain) - see
  // OAUTH_PREP_INPUT in packages/shared.
  const connect = useCallback(
    async (platform: Platform, prepInput?: Record<string, string>) => {
      setError(null);
      setIsUpgradeError(false);
      setConnectingPlatform(platform);
      try {
        const query = prepInput ? `?${new URLSearchParams(prepInput).toString()}` : "";
        const { authorizationUrl } = await apiFetch<{ authorizationUrl: string }>(
          `/oauth/${platform.toLowerCase()}/start${query}`,
        );
        const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, OAUTH_RETURN_URL);

        if (result.type === "success") {
          const { queryParams } = Linking.parse(result.url);
          if (queryParams?.status !== "success") {
            setError(typeof queryParams?.message === "string" ? queryParams.message : "Connection failed");
          }
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect");
        setIsUpgradeError(err instanceof ApiError && err.status === 403);
      } finally {
        setConnectingPlatform(null);
      }
    },
    [refresh],
  );

  // For platforms with authMethod "credentials" (currently just Bluesky) -
  // no browser session, just a direct POST of whatever fields the platform
  // needs (e.g. { handle, appPassword }).
  const connectWithCredentials = useCallback(
    async (platform: Platform, credentials: Record<string, string>) => {
      setError(null);
      setIsUpgradeError(false);
      setConnectingPlatform(platform);
      try {
        await apiFetch(`/accounts/${platform.toLowerCase()}/connect`, {
          method: "POST",
          body: JSON.stringify(credentials),
        });
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect");
        setIsUpgradeError(err instanceof ApiError && err.status === 403);
        return false;
      } finally {
        setConnectingPlatform(null);
      }
    },
    [refresh],
  );

  const disconnect = useCallback(
    async (accountId: string) => {
      setError(null);
      setIsUpgradeError(false);
      try {
        await apiFetch(`/accounts/${accountId}`, { method: "DELETE" });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to disconnect");
        setIsUpgradeError(err instanceof ApiError && err.status === 403);
      }
    },
    [refresh],
  );

  return {
    accounts,
    isLoading,
    error,
    isUpgradeError,
    connectingPlatform,
    connect,
    connectWithCredentials,
    disconnect,
    refresh,
  };
}
