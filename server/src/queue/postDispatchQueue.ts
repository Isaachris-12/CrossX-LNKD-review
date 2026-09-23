import { Queue, type JobsOptions } from "bullmq";
import type { PostContentType } from "@crossx/shared";
import { redisConnection } from "./connection.js";

export const POST_DISPATCH_QUEUE = "post-dispatch";

// The caption/mediaUrl ride along in the job payload rather than being
// looked up from Postgres, because Postgres never stores them (see
// PostDispatch/PostTarget in schema.prisma) - Redis is the only place this
// content exists, and only for as long as the job takes to run.
export interface PostDispatchJobData {
  postTargetId: string;
  caption: string;
  mediaUrl: string;
  contentType: PostContentType;
}

export const postDispatchQueue = new Queue<PostDispatchJobData>(POST_DISPATCH_QUEUE, {
  connection: redisConnection,
});

// Passed explicitly on every add() rather than left to the Queue's
// defaultJobOptions, so job.opts.attempts is reliably populated for the
// worker's "did this job exhaust its retries" check.
const JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
};

export function enqueuePostDispatchJob(data: PostDispatchJobData) {
  return postDispatchQueue.add("publish", data, JOB_OPTIONS);
}
