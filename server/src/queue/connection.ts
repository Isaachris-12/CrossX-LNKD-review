import { Redis } from "ioredis";
import { env } from "../env.js";

// BullMQ requires maxRetriesPerRequest: null on connections it manages.
export const redisConnection = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
