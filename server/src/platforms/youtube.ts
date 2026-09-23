import crypto from "node:crypto";
import { env } from "../env.js";
import type {
  AnalyticsMetrics,
  LinkedPlatformAccount,
  PlatformAdapter,
  PublishableAccount,
  PublishContent,
  PublishResult,
} from "./types.js";

// YouTube publishing goes through Google's OAuth (YouTube Data API v3).
const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

function requireYouTubeCredentials(): { clientId: string; clientSecret: string } {
  if (!env.youtubeClientId || !env.youtubeClientSecret) {
    throw new Error(
      "YouTube OAuth is not configured. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in server/.env.",
    );
  }
  return { clientId: env.youtubeClientId, clientSecret: env.youtubeClientSecret };
}

function getAuthorizationUrl(state: string, redirectUri: string): string {
  const { clientId } = requireYouTubeCredentials();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  // offline + consent so Google actually issues a refresh_token, not just
  // on the very first authorization.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

interface YouTubeChannelsResponse {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      thumbnails?: { default?: { url: string } };
    };
  }>;
}

async function exchangeCodeForAccounts(
  code: string,
  redirectUri: string,
): Promise<LinkedPlatformAccount[]> {
  const { clientId, clientSecret } = requireYouTubeCredentials();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }
  const token = (await tokenRes.json()) as GoogleTokenResponse;

  const channelsRes = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  if (!channelsRes.ok) {
    throw new Error(`YouTube channels request failed (${channelsRes.status}): ${await channelsRes.text()}`);
  }
  const channels = (await channelsRes.json()) as YouTubeChannelsResponse;
  const channel = channels.items?.[0];
  if (!channel) {
    throw new Error("No YouTube channel was found for this Google account.");
  }

  return [
    {
      platform: "YOUTUBE",
      platformUserId: channel.id,
      displayName: channel.snippet.title,
      avatarUrl: channel.snippet.thumbnails?.default?.url ?? null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope.split(/[,\s]+/).filter(Boolean),
    },
  ];
}

// YouTube uploads need actual video bytes, not a URL, so this fetches
// mediaUrl server-side and re-uploads it via a single multipart request.
// Production should switch to the resumable upload protocol (chunked, with
// retry/resume) for reliability on larger files - this simple multipart
// approach holds the whole video in memory. privacyStatus is pinned to
// "private" so a scaffold run never accidentally publishes publicly.
async function publish(account: PublishableAccount, content: PublishContent): Promise<PublishResult> {
  const mediaRes = await fetch(content.mediaUrl);
  if (!mediaRes.ok) {
    throw new Error(`Failed to fetch media for YouTube upload (${mediaRes.status})`);
  }
  const mediaBuffer = Buffer.from(await mediaRes.arrayBuffer());
  const contentType = mediaRes.headers.get("content-type") ?? "video/mp4";

  const boundary = `crossxlnkd-${crypto.randomUUID()}`;
  const metadata = {
    snippet: {
      title: content.caption.slice(0, 100) || "CrossX-LNKD upload",
      description: content.caption,
    },
    status: { privacyStatus: "private" },
  };

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    ),
    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    mediaBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`YouTube upload failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) {
    throw new Error("YouTube upload response did not include a video id");
  }
  return { platformPostId: data.id };
}

interface YouTubeChannelStatsResponse {
  items?: Array<{
    statistics: {
      subscriberCount?: string;
      viewCount?: string;
    };
  }>;
}

// followers/views are lifetime channel totals (YouTube Data API's channel
// statistics), not a per-period reading. Per-video likes/comments would need
// aggregating the channel's uploaded videos individually - not implemented.
async function fetchAnalytics(account: PublishableAccount): Promise<AnalyticsMetrics> {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true", {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`YouTube analytics request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as YouTubeChannelStatsResponse;
  const stats = data.items?.[0]?.statistics;

  return {
    followers: Number(stats?.subscriberCount ?? 0),
    views: Number(stats?.viewCount ?? 0),
    likes: 0,
    shares: 0,
    comments: 0,
  };
}

export const youtubeAdapter: PlatformAdapter = {
  platform: "YOUTUBE",
  displayName: "YouTube",
  defaultDailyPostLimit: 6,
  getAuthorizationUrl,
  exchangeCodeForAccounts,
  publish,
  fetchAnalytics,
};
