import { env } from "../env.js";
import type {
  AnalyticsMetrics,
  LinkedPlatformAccount,
  PlatformAdapter,
  PublishableAccount,
  PublishContent,
  PublishResult,
} from "./types.js";

const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"];

function requireLinkedInCredentials(): { clientId: string; clientSecret: string } {
  if (!env.linkedinClientId || !env.linkedinClientSecret) {
    throw new Error(
      "LinkedIn OAuth is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in server/.env.",
    );
  }
  return { clientId: env.linkedinClientId, clientSecret: env.linkedinClientSecret };
}

function getAuthorizationUrl(state: string, redirectUri: string): string {
  const { clientId } = requireLinkedInCredentials();
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  return url.toString();
}

interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

// OpenID Connect userinfo endpoint (requires the "openid profile" scopes).
interface LinkedInUserInfoResponse {
  sub: string;
  name: string;
  picture?: string;
}

async function exchangeCodeForAccounts(
  code: string,
  redirectUri: string,
): Promise<LinkedPlatformAccount[]> {
  const { clientId, clientSecret } = requireLinkedInCredentials();

  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`LinkedIn token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }
  const token = (await tokenRes.json()) as LinkedInTokenResponse;

  const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userRes.ok) {
    throw new Error(`LinkedIn user info request failed (${userRes.status}): ${await userRes.text()}`);
  }
  const userInfo = (await userRes.json()) as LinkedInUserInfoResponse;

  return [
    {
      platform: "LINKEDIN",
      platformUserId: userInfo.sub,
      displayName: userInfo.name,
      avatarUrl: userInfo.picture ?? null,
      accessToken: token.access_token,
      refreshToken: null,
      tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope.split(/[,\s]+/).filter(Boolean),
    },
  ];
}

const LINKEDIN_API_VERSION = "202401";

// Publishes a text-only "commentary" post via LinkedIn's newer Posts API.
// Native image/video posts require LinkedIn's separate asset-upload flow
// (registerUpload -> PUT the binary -> reference the returned asset urn in
// the post body) which isn't implemented yet - mediaUrl is currently ignored
// here. LinkedIn returns the created post's URN in a response header, not
// the JSON body.
async function publish(account: PublishableAccount, content: PublishContent): Promise<PublishResult> {
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: `urn:li:person:${account.platformUserId}`,
      commentary: content.caption,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`LinkedIn publish failed (${res.status}): ${await res.text()}`);
  }

  const platformPostId = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
  if (!platformPostId) {
    throw new Error("LinkedIn publish response did not include a post id header");
  }
  return { platformPostId };
}

// Honest gap, not a fake reading: member-level follower/engagement analytics
// require LinkedIn's partner-restricted Member Data/Analytics APIs, which
// aren't available under the "openid profile w_member_social" scopes this
// app requests. Throwing (rather than returning zeros) keeps the ingestion
// job from writing a misleading all-zero snapshot; the account simply has no
// analytics history until this is resolved.
async function fetchAnalytics(_account: PublishableAccount): Promise<AnalyticsMetrics> {
  throw new Error(
    "LinkedIn analytics require partner-restricted API access not included in this app's OAuth scopes.",
  );
}

export const linkedinAdapter: PlatformAdapter = {
  platform: "LINKEDIN",
  displayName: "LinkedIn",
  defaultDailyPostLimit: 10,
  getAuthorizationUrl,
  exchangeCodeForAccounts,
  publish,
  fetchAnalytics,
};
