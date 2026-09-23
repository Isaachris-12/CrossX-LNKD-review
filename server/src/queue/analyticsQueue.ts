import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";

export const ANALYTICS_QUEUE = "analytics-ingestion";

export const analyticsQueue = new Queue(ANALYTICS_QUEUE, { connection: redisConnection });

const REPEAT_JOB_ID = "analytics-ingestion-hourly";
const ONE_HOUR_MS = 60 * 60 * 1000;

// Idempotent: BullMQ keys a repeatable job by its jobId, so calling this
// again on worker restart doesn't create a duplicate schedule.
export async function scheduleAnalyticsIngestion(): Promise<void> {
  await analyticsQueue.add(
    "collect",
    {},
    { repeat: { every: ONE_HOUR_MS }, jobId: REPEAT_JOB_ID },
  );
}
