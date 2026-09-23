import { prisma } from "../db.js";
import { encryptToken } from "../crypto/tokenCipher.js";
import { nextUtcMidnight } from "../util/dailyReset.js";
import { getPlatformLimit } from "../subscription/access.js";
import { getPlatformAdapter } from "./registry.js";
import type { LinkedPlatformAccount } from "./types.js";

export interface LinkAccountsResult {
  addedCount: number;
  skippedForLimit: number;
}

// Shared by both connect paths (OAuth callback and direct-credential
// connect): upserts each linked account, respecting the free/trial
// distinct-platform cap. Reconnecting/refreshing an already-connected
// account is always allowed since it doesn't grow that count.
export async function linkAccountsForUser(
  userId: string,
  linkedAccounts: LinkedPlatformAccount[],
): Promise<LinkAccountsResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const platformLimit = getPlatformLimit(user);
  let connectedCount = await prisma.connectedAccount.count({
    where: { userId, status: "connected" },
  });

  let addedCount = 0;
  let skippedForLimit = 0;

  for (const linked of linkedAccounts) {
    const existing = await prisma.connectedAccount.findUnique({
      where: {
        userId_platform_platformUserId: {
          userId,
          platform: linked.platform,
          platformUserId: linked.platformUserId,
        },
      },
    });

    if (!existing && connectedCount >= platformLimit) {
      skippedForLimit++;
      continue;
    }

    const linkedAdapter = getPlatformAdapter(linked.platform);
    await prisma.connectedAccount.upsert({
      where: {
        userId_platform_platformUserId: {
          userId,
          platform: linked.platform,
          platformUserId: linked.platformUserId,
        },
      },
      create: {
        userId,
        platform: linked.platform,
        platformUserId: linked.platformUserId,
        displayName: linked.displayName,
        avatarUrl: linked.avatarUrl,
        accessTokenEncrypted: encryptToken(linked.accessToken),
        refreshTokenEncrypted: linked.refreshToken ? encryptToken(linked.refreshToken) : null,
        tokenExpiresAt: linked.tokenExpiresAt,
        scopes: linked.scopes,
        status: "connected",
        dailyPostLimit: linkedAdapter?.defaultDailyPostLimit ?? 0,
        dailyPostCount: 0,
        dailyCountResetAt: nextUtcMidnight(),
      },
      update: {
        displayName: linked.displayName,
        avatarUrl: linked.avatarUrl,
        accessTokenEncrypted: encryptToken(linked.accessToken),
        refreshTokenEncrypted: linked.refreshToken ? encryptToken(linked.refreshToken) : null,
        tokenExpiresAt: linked.tokenExpiresAt,
        scopes: linked.scopes,
        status: "connected",
      },
    });

    if (!existing) {
      addedCount++;
      connectedCount++;
    }
  }

  return { addedCount, skippedForLimit };
}
