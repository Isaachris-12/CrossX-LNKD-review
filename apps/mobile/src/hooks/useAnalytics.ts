import { useCallback, useEffect, useState } from "react";
import type { AnalyticsPeriod, AnalyticsSeries } from "@crossx/shared";
import { apiFetch } from "../api/client";

export function useAnalytics(accountId: string, period: AnalyticsPeriod) {
  const [series, setSeries] = useState<AnalyticsSeries | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AnalyticsSeries>(`/accounts/${accountId}/analytics?period=${period}`);
      setSeries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setIsLoading(false);
    }
  }, [accountId, period]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { series, isLoading, error, refresh };
}
