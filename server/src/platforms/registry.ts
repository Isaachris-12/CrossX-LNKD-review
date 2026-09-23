import type { Platform } from "@crossx/shared";
import type { PlatformAdapter } from "./types.js";
import { metaFacebookAdapter, metaInstagramAdapter } from "./meta.js";
import { tiktokAdapter } from "./tiktok.js";
import { linkedinAdapter } from "./linkedin.js";
import { youtubeAdapter } from "./youtube.js";
import { redditAdapter } from "./reddit.js";
import { blueskyAdapter } from "./bluesky.js";
import { pinterestAdapter } from "./pinterest.js";
import { mastodonAdapter } from "./mastodon.js";

const registry: Record<Platform, PlatformAdapter> = {
  FACEBOOK: metaFacebookAdapter,
  INSTAGRAM: metaInstagramAdapter,
  TIKTOK: tiktokAdapter,
  LINKEDIN: linkedinAdapter,
  YOUTUBE: youtubeAdapter,
  REDDIT: redditAdapter,
  BLUESKY: blueskyAdapter,
  PINTEREST: pinterestAdapter,
  MASTODON: mastodonAdapter,
};

export function getPlatformAdapter(platform: string): PlatformAdapter | undefined {
  return registry[platform.toUpperCase() as Platform];
}

export function listPlatformAdapters(): PlatformAdapter[] {
  return Object.values(registry);
}
