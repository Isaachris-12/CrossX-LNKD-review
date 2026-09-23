import { env } from "../env.js";
import type {
  AnalyticsMetrics,
  LinkedPlatformAccount,
  PlatformAdapter,
  PublishableAccount,
  PublishContent,
  PublishResult,
} from "./types.js";

const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.upload"];

function requireTikTokCredentials(): { clientKey: string; clientSecret: string } {
  if (!env.tiktokClientKey || !env.tiktokClientSecret) {
    throw new Error(
      "TikTok OAuth is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in server/.env.",
    );
  }
  return { clientKey: env.tiktokClientKey, clientSecret: env.tiktokClientSecret };
}

function getAuthorizationUrl(state: string, redirectUri: string): string {
  const { clientKey } = requireTikTokCredentials();
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  // TikTok's OAuth app identifier is called "client_key", not "client_id".
  url.searchParams.set("client_key", clientKey);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

interface TikTokTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}

interface TikTokUserInfoResponse {
  data: {
    user: {
      open_id: string;
      display_name: string;
      avatar_url: string;
    };
  };
}

async function exchangeCodeForAccounts(
  code: string,
  redirectUri: string,
): Promise<LinkedPlatformAccount[]> {
  const { clientKey, clientSecret } = requireTikTokCredentials();

  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`TikTok token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }
  const token = (await tokenRes.json()) as TikTokTokenResponse;

  const userRes = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  if (!userRes.ok) {
    throw new Error(`TikTok user info request failed (${userRes.status}): ${await userRes.text()}`);
  }
  const userInfo = (await userRes.json()) as TikTokUserInfoResponse;

  return [
    {
      platform: "TIKTOK",
      platformUserId: userInfo.data.user.open_id,
      displayName: userInfo.data.user.display_name,
      avatarUrl: userInfo.data.user.avatar_url ?? null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope.split(/[,\s]+/).filter(Boolean),
    },
  ];
}

interface TikTokPublishInitResponse {
  data?: { publish_id: string };
  error?: { code: string; message: string };
}

// TikTok's Content Posting API is async: this kicks off a PULL_FROM_URL job
// (TikTok fetches the video from mediaUrl itself) and returns a publish_id
// immediately. The final video id requires polling
// /v2/post/publish/status/fetch/ separately - not implemented here, so the
// "platformPostId" we store is the tracking id, not the final video id.
//
// privacy_level is pinned to SELF_ONLY: TikTok requires an app audit before
// an app may post with any public privacy level, so this is the only value
// that works for an unaudited app.
async function publish(account: PublishableAccount, content: PublishContent): Promise<PublishResult> {
  const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      post_info: {
        title: content.caption,
        privacy_level: "SELF_ONLY",
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: content.mediaUrl,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`TikTok publish failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as TikTokPublishInitResponse;
  if (data.error && data.error.code !== "ok") {
    throw new Error(`TikTok publish failed: ${data.error.code} ${data.error.message}`);
  }
  if (!data.data?.publish_id) {
    throw new Error("TikTok publish response did not include a publish id");
  }

  return { platformPostId: data.data.publish_id };
}

interface TikTokUserInfoFullResponse {
  data: {
    user: {
      follower_count?: number;
      likes_count?: number;
    };
  };
}

// followers and likes are lifetime cumulative totals (TikTok's basic user
// info endpoint doesn't expose a per-period reading). views/shares/comments
// would need per-video aggregation via the Video List API - not implemented.
async function fetchAnalytics(account: PublishableAccount): Promise<AnalyticsMetrics> {
  const res = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count",
    { headers: { Authorization: `Bearer ${account.accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`TikTok analytics request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as TikTokUserInfoFullResponse;

  return {
    followers: data.data.user.follower_count ?? 0,
    views: 0,
    likes: data.data.user.likes_count ?? 0,
    shares: 0,
    comments: 0,
  };
}

export const tiktokAdapter: PlatformAdapter = {
  platform: "TIKTOK",
  displayName: "TikTok",
  defaultDailyPostLimit: 15,
  getAuthorizationUrl,
  exchangeCodeForAccounts,
  publish,
  fetchAnalytics,
};
