import type { Platform } from "@crossx/shared";

// Generic platform links for the "open ↗" action. Deep-linking to the exact
// connected profile would need each adapter to also capture a stable
// handle/URL at connect time (e.g. TikTok's unique_id, not just its display
// name) - not stored yet, so this opens the platform itself.
export const PLATFORM_URL: Record<Platform, string> = {
  INSTAGRAM: "https://instagram.com",
  FACEBOOK: "https://facebook.com",
  TIKTOK: "https://www.tiktok.com",
  LINKEDIN: "https://www.linkedin.com",
  YOUTUBE: "https://www.youtube.com",
  REDDIT: "https://www.reddit.com",
  BLUESKY: "https://bsky.app",
  PINTEREST: "https://www.pinterest.com",
  MASTODON: "https://joinmastodon.org",
};
