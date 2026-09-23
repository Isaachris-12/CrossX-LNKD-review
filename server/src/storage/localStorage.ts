import path from "node:path";
import fs from "node:fs/promises";
import { env } from "../env.js";
import { generateMediaKey } from "./key.js";
import { signUploadToken } from "./uploadToken.js";
import type { StorageAdapter, UploadTarget } from "./types.js";

const STORAGE_DIR = path.resolve(process.cwd(), "media-storage");

export async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

export function localStoragePath(key: string): string {
  return path.join(STORAGE_DIR, key);
}

function baseUrl(): string {
  // Falls back to localhost, which is fine for requests this server makes
  // itself (e.g. fetching mediaUrl for a YouTube upload) but NOT reachable
  // by Instagram/Facebook/TikTok's own servers when they fetch a mediaUrl to
  // publish it - set PUBLIC_BASE_URL (the same tunnel already used for OAuth
  // callbacks) for those platforms to actually be able to fetch the file.
  return env.publicBaseUrl ?? `http://localhost:${env.port}`;
}

export const localStorageAdapter: StorageAdapter = {
  name: "local",
  async createUploadTarget(contentType: string): Promise<UploadTarget> {
    const key = generateMediaKey(contentType);
    const token = signUploadToken(key);
    return {
      uploadUrl: `${baseUrl()}/media/upload/${key}?token=${token}`,
      uploadMethod: "PUT",
      uploadHeaders: { "Content-Type": contentType },
      publicUrl: `${baseUrl()}/media/${key}`,
      key,
    };
  },
};
