import { Worker } from "bullmq";
import { redisConnection } from "./connection.js";
import { ANALYTICS_QUEUE } from "./analyticsQueue.js";
import { collectAnalyticsForAllAccounts } from "../analytics/collect.js";

export const analyticsWorker = new Worker(
  ANALYTICS_QUEUE,
  async () => {
    const result = await collectAnalyticsForAllAccounts();
    console.log(`Analytics ingestion: ${result.succeeded} succeeded, ${result.failed} failed`);
    return result;
  },
  { connection: redisConnection, concurrency: 1 },
);
