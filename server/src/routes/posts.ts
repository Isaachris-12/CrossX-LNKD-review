import type { FastifyInstance } from "fastify";
import type { PostDispatch, PostTarget } from "@prisma/client";
import type { CreatePostRequest, PostDispatchSummary } from "@crossx/shared";
import { prisma } from "../db.js";
import { authenticate } from "../auth/authenticate.js";
import { isDailyCountStale, nextUtcMidnight } from "../util/dailyReset.js";
import { enqueuePostDispatchJob } from "../queue/postDispatchQueue.js";
import { canPost } from "../subscription/access.js";
import { getPlatformAdapter } from "../platforms/registry.js";

const createPostSchema = {
  type: "object",
  required: ["caption", "mediaUrl", "targetAccountIds"],
  additionalProperties: false,
  properties: {
    caption: { type: "string", maxLength: 2200 },
    mediaUrl: { type: "string", minLength: 1, maxLength: 2000 },
    targetAccountIds: {
      type: "array",
      items: { type: "string", minLength: 1 },
      minItems: 1,
      maxItems: 10,
    },
    contentType: { type: "string", enum: ["FEED", "STORY"], default: "FEED" },
  },
} as const;

function toSummary(dispatch: PostDispatch & { targets: PostTarget[] }): PostDispatchSummary {
  return {
    id: dispatch.id,
    status: dispatch.status,
    contentType: dispatch.contentType,
    createdAt: dispatch.createdAt.toISOString(),
    targets: dispatch.targets.map((t) => ({
      connectedAccountId: t.connectedAccountId,
      platform: t.platform,
      status: t.status,
      platformPostId: t.platformPostId,
      errorMessage: t.errorMessage,
    })),
  };
}

export async function postsRoutes(app: FastifyInstance) {
  app.post<{ Body: CreatePostRequest }>(
    "/posts",
    { schema: { body: createPostSchema }, preHandler: authenticate },
    async (request, reply) => {
      const { caption, mediaUrl, targetAccountIds, contentType = "FEED" } = request.body;
      const userId = request.userId!;

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!canPost(user)) {
        return reply
          .status(403)
          .send({ error: "Your free trial has ended. Subscribe to keep posting." });
      }

      const uniqueIds = Array.from(new Set(targetAccountIds));
      const accounts = await prisma.connectedAccount.findMany({
        where: { id: { in: uniqueIds }, userId },
      });

      if (accounts.length !== uniqueIds.length) {
        return reply.status(400).send({ error: "One or more accounts were not found" });
      }
      if (accounts.some((a) => a.status !== "connected")) {
        return reply.status(400).send({ error: "One or more accounts are not connected" });
      }

      if (contentType === "STORY") {
        const unsupported = accounts.filter((a) => !getPlatformAdapter(a.platform)?.supportsStories);
        if (unsupported.length > 0) {
          const names = Array.from(new Set(unsupported.map((a) => a.platform))).join(", ");
          return reply.status(400).send({ error: `Stories aren't supported on: ${names}` });
        }
      }

      const dispatch = await prisma.postDispatch.create({
        data: { userId, status: "pending", contentType },
      });

      let anyQueued = false;
      for (const account of accounts) {
        const resetNeeded = isDailyCountStale(account.dailyCountResetAt);
        const currentCount = resetNeeded ? 0 : account.dailyPostCount;
        const remaining = account.dailyPostLimit - currentCount;

        if (resetNeeded) {
          await prisma.connectedAccount.update({
            where: { id: account.id },
            data: { dailyPostCount: 0, dailyCountResetAt: nextUtcMidnight() },
          });
        }

        if (remaining <= 0) {
          await prisma.postTarget.create({
            data: {
              postDispatchId: dispatch.id,
              connectedAccountId: account.id,
              platform: account.platform,
              status: "failed",
              errorMessage: "Daily post limit reached for this account",
            },
          });
          continue;
        }

        const target = await prisma.postTarget.create({
          data: {
            postDispatchId: dispatch.id,
            connectedAccountId: account.id,
            platform: account.platform,
            status: "queued",
          },
        });
        anyQueued = true;

        await enqueuePostDispatchJob({
          postTargetId: target.id,
          caption,
          mediaUrl,
          contentType,
        });
      }

      const updatedDispatch = await prisma.postDispatch.update({
        where: { id: dispatch.id },
        data: { status: anyQueued ? "pending" : "failed" },
        include: { targets: true },
      });

      return reply.status(201).send(toSummary(updatedDispatch));
    },
  );

  app.get<{ Params: { id: string } }>(
    "/posts/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const dispatch = await prisma.postDispatch.findUnique({
        where: { id: request.params.id },
        include: { targets: true },
      });
      if (!dispatch || dispatch.userId !== request.userId) {
        return reply.status(404).send({ error: "Post not found" });
      }
      return reply.send(toSummary(dispatch));
    },
  );
}
