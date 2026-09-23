import type { FastifyInstance } from "fastify";
import type { AnalyticsPeriod, AnalyticsPoint, AnalyticsSeries, ConnectedAccountSummary } from "@crossx/shared";
import type { AnalyticsSnapshot } from "@prisma/client";
import { prisma } from "../db.js";
import { authenticate } from "../auth/authenticate.js";
import { isDailyCountStale, nextUtcMidnight } from "../util/dailyReset.js";
import { canDisconnectAccounts, getPlatformLimit } from "../subscription/access.js";
import { getPlatformAdapter } from "../platforms/registry.js";
import { linkAccountsForUser } from "../platforms/linkAccounts.js";

const MAX_DAILY_POINTS = 30;
const MAX_MONTHLY_POINTS = 12;

function toPoint(snapshot: AnalyticsSnapshot): AnalyticsPoint {
  return {
    capturedAt: snapshot.capturedAt.toISOString(),
    followers: snapshot.followers,
    views: snapshot.views,
    likes: snapshot.likes,
    shares: snapshot.shares,
    comments: snapshot.comments,
  };
}

// "Monthly" isn't a separate ingestion cadence - the same hourly snapshots
// are just downsampled to one point per calendar month (the latest snapshot
// in each month), so daily and monthly both read from the same history.
function toMonthlyPoints(snapshots: AnalyticsSnapshot[]): AnalyticsPoint[] {
  const latestByMonth = new Map<string, AnalyticsSnapshot>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.capturedAt.getUTCFullYear()}-${snapshot.capturedAt.getUTCMonth()}`;
    latestByMonth.set(key, snapshot); // snapshots are ordered ascending, so the last write per key wins
  }
  return Array.from(latestByMonth.values()).slice(-MAX_MONTHLY_POINTS).map(toPoint);
}

export async function accountsRoutes(app: FastifyInstance) {
  app.get("/accounts", { preHandler: authenticate }, async (request, reply) => {
    const accounts = await prisma.connectedAccount.findMany({
      where: { userId: request.userId! },
      orderBy: { createdAt: "asc" },
    });

    const summaries: ConnectedAccountSummary[] = [];
    for (const account of accounts) {
      let dailyPostCount = account.dailyPostCount;
      if (isDailyCountStale(account.dailyCountResetAt)) {
        dailyPostCount = 0;
        await prisma.connectedAccount.update({
          where: { id: account.id },
          data: { dailyPostCount: 0, dailyCountResetAt: nextUtcMidnight() },
        });
      }

      summaries.push({
        id: account.id,
        platform: account.platform,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        status: account.status,
        postsRemainingToday: Math.max(0, account.dailyPostLimit - dailyPostCount),
        dailyPostLimit: account.dailyPostLimit,
      });
    }

    return reply.send(summaries);
  });

  // For platforms with authMethod "credentials" (see PlatformAdapter) - the
  // mobile app collects fields directly (e.g. Bluesky's handle + app
  // password) instead of opening an OAuth browser session.
  app.post<{ Params: { platform: string }; Body: Record<string, string> }>(
    "/accounts/:platform/connect",
    { preHandler: authenticate },
    async (request, reply) => {
      const adapter = getPlatformAdapter(request.params.platform);
      if (!adapter || !adapter.connectWithCredentials) {
        return reply.status(404).send({ error: "Unsupported platform" });
      }

      const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId! } });
      const alreadyConnected = await prisma.connectedAccount.findFirst({
        where: { userId: request.userId!, platform: adapter.platform, status: "connected" },
      });
      if (!alreadyConnected) {
        const connectedCount = await prisma.connectedAccount.count({
          where: { userId: request.userId!, status: "connected" },
        });
        if (connectedCount >= getPlatformLimit(user)) {
          return reply.status(403).send({
            error: `Your plan allows ${getPlatformLimit(user)} connected platform(s). Upgrade to connect more.`,
          });
        }
      }

      try {
        const linkedAccounts = await adapter.connectWithCredentials(request.body ?? {});
        const { addedCount, skippedForLimit } = await linkAccountsForUser(request.userId!, linkedAccounts);
        if (addedCount === 0 && skippedForLimit > 0) {
          return reply.status(403).send({
            error: `Your plan allows ${getPlatformLimit(user)} connected platform(s). Upgrade to connect more.`,
          });
        }
        return reply.status(204).send();
      } catch (err) {
        request.log.error(err);
        return reply.status(400).send({ error: (err as Error).message });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/accounts/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const account = await prisma.connectedAccount.findUnique({
        where: { id: request.params.id },
      });

      if (!account || account.userId !== request.userId) {
        return reply.status(404).send({ error: "Account not found" });
      }

      const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId! } });
      if (!canDisconnectAccounts(user)) {
        return reply.status(403).send({
          error: "Disconnecting a platform requires an active subscription. Upgrade to change your connected platforms.",
        });
      }

      // Revoke rather than delete: keeps PostTarget dispatch history intact
      // while making the stored token unusable.
      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          status: "revoked",
          accessTokenEncrypted: "",
          refreshTokenEncrypted: null,
        },
      });

      return reply.status(204).send();
    },
  );

  app.get<{ Params: { id: string }; Querystring: { period?: string } }>(
    "/accounts/:id/analytics",
    { preHandler: authenticate },
    async (request, reply) => {
      const account = await prisma.connectedAccount.findUnique({
        where: { id: request.params.id },
      });
      if (!account || account.userId !== request.userId) {
        return reply.status(404).send({ error: "Account not found" });
      }

      const period: AnalyticsPeriod = request.query.period === "monthly" ? "monthly" : "daily";

      const snapshots = await prisma.analyticsSnapshot.findMany({
        where: { connectedAccountId: account.id },
        orderBy: { capturedAt: "asc" },
      });

      const points =
        period === "monthly" ? toMonthlyPoints(snapshots) : snapshots.slice(-MAX_DAILY_POINTS).map(toPoint);

      const series: AnalyticsSeries = {
        connectedAccountId: account.id,
        platform: account.platform,
        period,
        points,
      };
      return reply.send(series);
    },
  );
}
