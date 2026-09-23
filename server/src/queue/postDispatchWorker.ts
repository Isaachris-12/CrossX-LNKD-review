import { Worker, type Job } from "bullmq";
import { redisConnection } from "./connection.js";
import { POST_DISPATCH_QUEUE, type PostDispatchJobData } from "./postDispatchQueue.js";
import { prisma } from "../db.js";
import { decryptToken } from "../crypto/tokenCipher.js";
import { getPlatformAdapter } from "../platforms/registry.js";
import type { PublishResult } from "../platforms/types.js";
import { isDailyCountStale, nextUtcMidnight } from "../util/dailyReset.js";

// Runs the actual publish call. Throws on failure so BullMQ's built-in retry
// (see defaultJobOptions on the queue) can re-attempt transient errors -
// DB bookkeeping happens in the worker's completed/failed event handlers
// below, which only fire once the job has truly finished (successfully, or
// after retries are exhausted).
async function processJob(job: Job<PostDispatchJobData>): Promise<PublishResult> {
  const { postTargetId, caption, mediaUrl, contentType } = job.data;

  const target = await prisma.postTarget.findUnique({
    where: { id: postTargetId },
    include: { connectedAccount: true },
  });
  if (!target) {
    throw new Error(`PostTarget ${postTargetId} no longer exists`);
  }

  await prisma.postTarget.update({ where: { id: target.id }, data: { status: "posting" } });

  const account = target.connectedAccount;
  if (account.status !== "connected") {
    throw new Error("Account is not connected");
  }

  const adapter = getPlatformAdapter(account.platform);
  if (!adapter) {
    throw new Error(`No adapter registered for platform ${account.platform}`);
  }

  const accessToken = decryptToken(account.accessTokenEncrypted);
  const publishAccount = { platformUserId: account.platformUserId, accessToken };
  const content = { caption, mediaUrl };

  if (contentType === "STORY") {
    // /posts already rejects a STORY submission targeting an
    // unsupported platform - this is a defensive backstop, not the
    // primary check.
    if (!adapter.publishStory) {
      throw new Error(`${adapter.displayName} does not support Stories`);
    }
    return adapter.publishStory(publishAccount, content);
  }

  return adapter.publish(publishAccount, content);
}

async function incrementDailyCount(connectedAccountId: string): Promise<void> {
  const account = await prisma.connectedAccount.findUnique({ where: { id: connectedAccountId } });
  if (!account) return;

  if (isDailyCountStale(account.dailyCountResetAt)) {
    await prisma.connectedAccount.update({
      where: { id: connectedAccountId },
      data: { dailyPostCount: 1, dailyCountResetAt: nextUtcMidnight() },
    });
  } else {
    await prisma.connectedAccount.update({
      where: { id: connectedAccountId },
      data: { dailyPostCount: { increment: 1 } },
    });
  }
}

async function finalizeDispatchIfDone(postDispatchId: string): Promise<void> {
  const targets = await prisma.postTarget.findMany({ where: { postDispatchId } });
  const stillPending = targets.some((t) => t.status === "queued" || t.status === "posting");
  if (stillPending) return;

  const allSucceeded = targets.every((t) => t.status === "success");
  const allFailed = targets.every((t) => t.status === "failed");
  const status = allSucceeded ? "complete" : allFailed ? "failed" : "partial";

  await prisma.postDispatch.update({ where: { id: postDispatchId }, data: { status } });
}

export const postDispatchWorker = new Worker<PostDispatchJobData, PublishResult>(
  POST_DISPATCH_QUEUE,
  processJob,
  { connection: redisConnection, concurrency: 5 },
);

postDispatchWorker.on("completed", async (job, result) => {
  const target = await prisma.postTarget.update({
    where: { id: job.data.postTargetId },
    data: { status: "success", platformPostId: result.platformPostId, postedAt: new Date() },
  });
  await incrementDailyCount(target.connectedAccountId);
  await finalizeDispatchIfDone(target.postDispatchId);
});

postDispatchWorker.on("failed", async (job, err) => {
  if (!job) return;

  // BullMQ emits "failed" on every failed attempt, not just the final one -
  // ignore attempts that will still be retried so the UI doesn't flash a
  // transient failure as final.
  const attemptsExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (!attemptsExhausted) return;

  const target = await prisma.postTarget.update({
    where: { id: job.data.postTargetId },
    data: { status: "failed", errorMessage: err.message.slice(0, 500) },
  });
  await finalizeDispatchIfDone(target.postDispatchId);
});
