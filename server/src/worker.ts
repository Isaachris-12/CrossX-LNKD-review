import "dotenv/config";
import { postDispatchWorker } from "./queue/postDispatchWorker.js";
import { analyticsWorker } from "./queue/analyticsWorker.js";
import { scheduleAnalyticsIngestion } from "./queue/analyticsQueue.js";

console.log("Post dispatch worker started");
console.log("Analytics ingestion worker started");

scheduleAnalyticsIngestion().catch((err) => {
  console.error("Failed to schedule analytics ingestion:", err);
});

async function shutdown() {
  await Promise.all([postDispatchWorker.close(), analyticsWorker.close()]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
