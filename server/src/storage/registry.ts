import { env } from "../env.js";
import { localStorageAdapter } from "./localStorage.js";
import { s3StorageAdapter } from "./s3Storage.js";
import type { StorageAdapter } from "./types.js";

export function getStorageAdapter(): StorageAdapter {
  const s3Configured = Boolean(
    env.s3Bucket && env.s3Region && env.s3AccessKeyId && env.s3SecretAccessKey,
  );
  return s3Configured ? s3StorageAdapter : localStorageAdapter;
}
