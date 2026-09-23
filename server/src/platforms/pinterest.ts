import { env } from "../env.js";
import type {
  AnalyticsMetrics,
  LinkedPlatformAccount,
  PlatformAdapter,
  PublishableAccount,
  PublishContent,
  PublishResult,
} from "./types.js";
import { isVideoUrl } from "./mediaType.js";

const PINTEREST_SCOPES = ["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"];

function requirePinterestCredentials(): { clientId: string; clientSecret: string } {
  if (!env.pinterestClientId || !env.pinterestClientSecret) {
    throw new Error(
      "Pinterest OAuth is not configured. Set PINTEREST_CLIENT_ID and PINTEREST_CLIENT_SECRET in server/.env.",
    );
  }
  return { clientId: env.pinterestClientId, clientSecret: env.pinterestClientSecret };
}

function getAuthorizationUrl(state: string, redirectUri: string): string {
  const { clientId } = requirePinterestCredentials();
  const url = new URL("https://www.pinterest.com/oauth/");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", PINTEREST_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

interface PinterestTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface PinterestUserAccountResponse {
  username: string;
  profile_image?: string;
  follower_count?: number;
}

async function pinterestAuthedFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`https://api.pinterest.com/v5${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  return res;
}

async function exchangeCodeForAccounts(
  code: string,
  redirectUri: string,
): Promise<LinkedPlatformAccount[]> {
  const { clientId, clientSecret } = requirePinterestCredentials();

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Pinterest token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }
  const token = (await tokenRes.json()) as PinterestTokenResponse;

  const userRes = await pinterestAuthedFetch("/user_account", token.access_token);
  if (!userRes.ok) {
    throw new Error(`Pinterest user account request failed (${userRes.status}): ${await userRes.text()}`);
  }
  const user = (await userRes.json()) as PinterestUserAccountResponse;

  return [
    {
      platform: "PINTEREST",
      // Pinterest usernames are unique and stable - v5's user_account
      // response doesn't include a separate numeric user id field.
      platformUserId: user.username,
      displayName: user.username,
      avatarUrl: user.profile_image ?? null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope.split(/[,\s]+/).filter(Boolean),
    },
  ];
}

interface PinterestBoard {
  id: string;
  name: string;
}
interface PinterestBoardsResponse {
  items: PinterestBoard[];
}

// Every Pinterest pin belongs to a board, but CrossX-LNKD's Post+ composer
// has no per-post board picker (same "keep it simple" scoping as Reddit's
// profile-only posting) - this finds or creates a single default board to
// post everything into, at publish time rather than storing a board id
// (there's nowhere to store platform-specific extra state on
// ConnectedAccount without a schema change).
const DEFAULT_BOARD_NAME = "CrossX-LNKD";

async function getOrCreateDefaultBoard(accessToken: string): Promise<string> {
  const listRes = await pinterestAuthedFetch("/boards?page_size=25", accessToken);
  if (!listRes.ok) {
    throw new Error(`Pinterest boards request failed (${listRes.status}): ${await listRes.text()}`);
  }
  const boards = (await listRes.json()) as PinterestBoardsResponse;
  const existing = boards.items?.find((b) => b.name === DEFAULT_BOARD_NAME) ?? boards.items?.[0];
  if (existing) return existing.id;

  const createRes = await pinterestAuthedFetch("/boards", accessToken, {
    method: "POST",
    body: JSON.stringify({ name: DEFAULT_BOARD_NAME, description: "Posted from CrossX-LNKD" }),
  });
  if (!createRes.ok) {
    throw new Error(`Pinterest board creation failed (${createRes.status}): ${await createRes.text()}`);
  }
  const created = (await createRes.json()) as PinterestBoard;
  return created.id;
}

// Video pins need Pinterest's separate media-upload registration flow
// (register upload -> PUT the file -> reference the returned media id) -
// not implemented yet, so video is an honest gap for now, same pattern as
// LinkedIn's image/video gap.
async function publish(account: PublishableAccount, content: PublishContent): Promise<PublishResult> {
  if (isVideoUrl(content.mediaUrl)) {
    throw new Error("Pinterest video pins aren't supported yet - only image pins.");
  }

  const boardId = await getOrCreateDefaultBoard(account.accessToken);
  const res = await pinterestAuthedFetch("/pins", account.accessToken, {
    method: "POST",
    body: JSON.stringify({
      board_id: boardId,
      description: content.caption,
      media_source: { source_type: "image_url", url: content.mediaUrl },
    }),
  });
  if (!res.ok) {
    throw new Error(`Pinterest publish failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) {
    throw new Error("Pinterest publish response did not include a pin id");
  }
  return { platformPostId: data.id };
}

// follower_count on /v5/user_account is the only readily-available audience
// number under Trial (sandbox) access - full pin-level analytics
// (impressions/saves/clicks) need Pinterest's Standard access approval and
// a date-ranged analytics endpoint, not implemented yet.
async function fetchAnalytics(account: PublishableAccount): Promise<AnalyticsMetrics> {
  const res = await pinterestAuthedFetch("/user_account", account.accessToken);
  if (!res.ok) {
    throw new Error(`Pinterest analytics request failed (${res.status}): ${await res.text()}`);
  }
  const user = (await res.json()) as PinterestUserAccountResponse;
  return { followers: user.follower_count ?? 0, views: 0, likes: 0, shares: 0, comments: 0 };
}

export const pinterestAdapter: PlatformAdapter = {
  platform: "PINTEREST",
  displayName: "Pinterest",
  defaultDailyPostLimit: 20,
  getAuthorizationUrl,
  exchangeCodeForAccounts,
  publish,
  fetchAnalytics,
};
