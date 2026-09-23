import { prisma } from "../db.js";
import { decryptToken } from "../crypto/tokenCipher.js";
import { getPlatformAdapter } from "../platforms/registry.js";

export interface CollectResult {
  succeeded: number;
  failed: number;
}

// Runs one round of analytics collection across every connected account.
// One account's failure (e.g. LinkedIn's known scope gap, or an expired
// token) doesn't block the rest - each is caught and logged independently.
export async function collectAnalyticsForAllAccounts(): Promise<CollectResult> {
  const accounts = await prisma.connectedAccount.findMany({ where: { status: "connected" } });

  let succeeded = 0;
  let failed = 0;

  for (const account of accounts) {
    const adapter = getPlatformAdapter(account.platform);
    if (!adapter) {
      failed++;
      continue;
    }

    try {
      const accessToken = decryptToken(account.accessTokenEncrypted);
      const metrics = await adapter.fetchAnalytics({
        platformUserId: account.platformUserId,
        accessToken,
      });

      await prisma.analyticsSnapshot.create({
        data: {
          connectedAccountId: account.id,
          followers: metrics.followers,
          views: metrics.views,
          likes: metrics.likes,
          shares: metrics.shares,
          comments: metrics.comments,
        },
      });
      succeeded++;
    } catch (err) {
      console.error(
        `Analytics collection failed for account ${account.id} (${account.platform}):`,
        err instanceof Error ? err.message : err,
      );
      failed++;
    }
  }

  return { succeeded, failed };
}
