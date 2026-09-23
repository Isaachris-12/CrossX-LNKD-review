import type { ConnectedAccountSummary } from "@crossx/shared";

export const PLATFORM_LABEL: Record<ConnectedAccountSummary["platform"], string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  FACEBOOK: "Facebook",
  LINKEDIN: "LinkedIn",
  YOUTUBE: "YouTube",
  REDDIT: "Reddit",
  BLUESKY: "Bluesky",
  PINTEREST: "Pinterest",
  MASTODON: "Mastodon",
};
