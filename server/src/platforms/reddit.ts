import { env } from "../env.js";
import type {
  AnalyticsMetrics,
  LinkedPlatformAccount,
  PlatformAdapter,
  PublishableAccount,
  PublishContent,
  PublishResult,
} from "./types.js";

// "identity" to read the account, "submit" to post, "read" for the profile
// stats used in fetchAnalytics. duration=permanent (requested below) is what
// makes Reddit issue a refresh_token instead of a token that just expires.
const REDDIT_SCOPES = ["identity", "submit", "read"];

function requireRedditCredentials(): { clientId: string; clientSecret: string } {
  if (!env.redditClientId || !env.redditClientSecret) {
    throw new Error(
      "Reddit OAuth is not configured. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in server/.env.",
    );
  }
  return { clientId: env.redditClientId, clientSecret: env.redditClientSecret };
}

// Reddit requires every API request (not just auth) to carry a descriptive
// User-Agent identifying the app - generic/default user agents get
// aggressively rate-limited or blocked.
function redditHeaders(accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": env.redditUserAgent };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

function getAuthorizationUrl(state: string, redirectUri: string): string {
  const { clientId } = requireRedditCredentials();
  const url = new URL("https://www.reddit.com/api/v1/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("duration", "permanent");
  url.searchParams.set("scope", REDDIT_SCOPES.join(" "));
  return url.toString();
}

interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface RedditMeResponse {
  id: string;
  name: string; // username, without the "u/" prefix
  icon_img?: string;
}

async function exchangeCodeForAccounts(
  code: string,
  redirectUri: string,
): Promise<LinkedPlatformAccount[]> {
  const { clientId, clientSecret } = requireRedditCredentials();

  // Reddit wants the app credentials as HTTP Basic auth, not as body params.
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...redditHeaders(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Reddit token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }
  const token = (await tokenRes.json()) as RedditTokenResponse;

  const meRes = await fetch("https://oauth.reddit.com/api/v1/me", {
    headers: redditHeaders(token.access_token),
  });
  if (!meRes.ok) {
    throw new Error(`Reddit identity request failed (${meRes.status}): ${await meRes.text()}`);
  }
  const me = (await meRes.json()) as RedditMeResponse;

  return [
    {
      platform: "REDDIT",
      platformUserId: me.id,
      displayName: me.name,
      avatarUrl: me.icon_img ? me.icon_img.split("?")[0] : null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope.split(/[,\s]+/).filter(Boolean),
    },
  ];
}

// Reddit has no generic "profile timeline" the way Instagram/Facebook/
// LinkedIn do - every submission goes to a subreddit. Posting to your own
// profile (the subreddit named "u_<username>", which every account has) is
// the closest equivalent, so that's what Post+ targets here rather than
// asking the user to pick a subreddit per post.
//
// kind=link (pointing at the already-hosted mediaUrl) rather than kind=image:
// a native image/video submission needs Reddit's separate asset-lease upload
// flow (POST /api/media/asset.json, then upload, then reference the asset),
// which isn't implemented yet.
async function publish(account: PublishableAccount, content: PublishContent): Promise<PublishResult> {
  const meRes = await fetch("https://oauth.reddit.com/api/v1/me", {
    headers: redditHeaders(account.accessToken),
  });
  if (!meRes.ok) {
    throw new Error(`Reddit identity request failed (${meRes.status}): ${await meRes.text()}`);
  }
  const me = (await meRes.json()) as RedditMeResponse;

  const title = content.caption.trim().slice(0, 300) || "New post";
  const res = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      ...redditHeaders(account.accessToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      api_type: "json",
      sr: `u_${me.name}`,
      kind: "link",
      title,
      url: content.mediaUrl,
      resubmit: "true",
    }),
  });
  if (!res.ok) {
    throw new Error(`Reddit publish failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    json: { errors: [string, string][]; data?: { id?: string; name?: string } };
  };
  if (data.json.errors?.length) {
    throw new Error(`Reddit publish failed: ${data.json.errors.map((e) => e.join(" ")).join("; ")}`);
  }
  const platformPostId = data.json.data?.name ?? data.json.data?.id;
  if (!platformPostId) {
    throw new Error("Reddit publish response did not include a post id");
  }
  return { platformPostId };
}

interface RedditAboutResponse {
  data: {
    total_karma?: number;
    comment_karma?: number;
    subreddit?: { subscribers?: number };
  };
}

// Reddit doesn't have a per-post "views" metric available to a normal OAuth
// app. "followers" is the user-profile subreddit's subscriber count (Reddit
// profiles gained a follow feature in 2023); "likes" here is total karma as
// the closest available trend line, not a like count in the usual sense.
async function fetchAnalytics(account: PublishableAccount): Promise<AnalyticsMetrics> {
  const meRes = await fetch("https://oauth.reddit.com/api/v1/me", {
    headers: redditHeaders(account.accessToken),
  });
  if (!meRes.ok) {
    throw new Error(`Reddit identity request failed (${meRes.status}): ${await meRes.text()}`);
  }
  const me = (await meRes.json()) as RedditMeResponse;

  const aboutRes = await fetch(`https://oauth.reddit.com/user/${me.name}/about.json`, {
    headers: redditHeaders(account.accessToken),
  });
  if (!aboutRes.ok) {
    throw new Error(`Reddit profile request failed (${aboutRes.status}): ${await aboutRes.text()}`);
  }
  const about = (await aboutRes.json()) as RedditAboutResponse;

  return {
    followers: about.data.subreddit?.subscribers ?? 0,
    views: 0,
    likes: about.data.total_karma ?? 0,
    shares: 0,
    comments: about.data.comment_karma ?? 0,
  };
}

export const redditAdapter: PlatformAdapter = {
  platform: "REDDIT",
  displayName: "Reddit",
  defaultDailyPostLimit: 10,
  getAuthorizationUrl,
  exchangeCodeForAccounts,
  publish,
  fetchAnalytics,
};
