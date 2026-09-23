import type {
  AnalyticsMetrics,
  LinkedPlatformAccount,
  PlatformAdapter,
  PublishableAccount,
  PublishContent,
  PublishResult,
} from "./types.js";

// Mastodon is multi-instance (decentralized) - there's no single "the
// Mastodon app" the way there's one Meta app or one TikTok app. Each
// instance needs its own OAuth app registered on it, so the connect flow
// has one extra step before the usual authorize/exchange: prepareAuthorization
// dynamically registers an app on whichever instance the user names, via
// Mastodon's proprietary (non-standard-DCR) POST /api/v1/apps endpoint.
const MASTODON_SCOPES = "read write";

function normalizeInstanceDomain(raw: string | undefined): string {
  if (!raw) throw new Error("A Mastodon server (e.g. mastodon.social) is required to connect.");
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

interface MastodonAppResponse {
  client_id: string;
  client_secret: string;
}

async function prepareAuthorization(
  input: Record<string, string>,
  redirectUri: string,
): Promise<{ extra: Record<string, string> }> {
  const instanceDomain = normalizeInstanceDomain(input.instanceDomain);

  const res = await fetch(`https://${instanceDomain}/api/v1/apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "CrossX-LNKD",
      redirect_uris: redirectUri,
      scopes: MASTODON_SCOPES,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Couldn't register CrossX-LNKD with ${instanceDomain} (${res.status}). Check the server name is correct.`,
    );
  }
  const app = (await res.json()) as MastodonAppResponse;

  return { extra: { instanceDomain, clientId: app.client_id, clientSecret: app.client_secret } };
}

function getAuthorizationUrl(state: string, redirectUri: string, extra?: Record<string, string>): string {
  if (!extra?.instanceDomain || !extra?.clientId) {
    throw new Error("Mastodon authorization requires prepareAuthorization to run first.");
  }
  const url = new URL(`https://${extra.instanceDomain}/oauth/authorize`);
  url.searchParams.set("client_id", extra.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", MASTODON_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

interface MastodonTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  // Mastodon access tokens don't expire until revoked, so there's no
  // expires_in/refresh_token in the response.
}

interface MastodonAccountResponse {
  id: string;
  username: string;
  display_name: string;
  avatar?: string;
}

async function exchangeCodeForAccounts(
  code: string,
  redirectUri: string,
  extra?: Record<string, string>,
): Promise<LinkedPlatformAccount[]> {
  if (!extra?.instanceDomain || !extra?.clientId || !extra?.clientSecret) {
    throw new Error("Mastodon token exchange is missing its per-instance app credentials.");
  }
  const { instanceDomain, clientId, clientSecret } = extra;

  const tokenRes = await fetch(`https://${instanceDomain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      scope: MASTODON_SCOPES,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Mastodon token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }
  const token = (await tokenRes.json()) as MastodonTokenResponse;

  const accountRes = await fetch(`https://${instanceDomain}/api/v1/accounts/verify_credentials`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!accountRes.ok) {
    throw new Error(`Mastodon account request failed (${accountRes.status}): ${await accountRes.text()}`);
  }
  const account = (await accountRes.json()) as MastodonAccountResponse;

  return [
    {
      platform: "MASTODON",
      // Mastodon account ids are only unique per-instance, so the instance
      // domain has to be part of the identity - encoded here (parsed back
      // out in publish/fetchAnalytics) rather than adding a schema column,
      // since PublishableAccount only carries platformUserId/accessToken.
      platformUserId: `${instanceDomain}|${account.id}`,
      displayName: `@${account.username}@${instanceDomain}`,
      avatarUrl: account.avatar ?? null,
      accessToken: token.access_token,
      refreshToken: null,
      tokenExpiresAt: null,
      scopes: token.scope.split(/[,\s]+/).filter(Boolean),
    },
  ];
}

function parseInstanceDomain(platformUserId: string): string {
  const [instanceDomain] = platformUserId.split("|");
  if (!instanceDomain) throw new Error("Malformed Mastodon account id - missing instance domain.");
  return instanceDomain;
}

interface MastodonMediaResponse {
  id: string;
}

// Mastodon needs the actual media bytes uploaded (no "post from this URL"
// option), so this fetches mediaUrl server-side and re-uploads it - same
// approach as the YouTube adapter. v2/media can return 202 (still
// processing, mainly for video) before the attachment is postable; this
// polls briefly rather than failing outright.
async function uploadMedia(instanceDomain: string, accessToken: string, mediaUrl: string): Promise<string> {
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) {
    throw new Error(`Failed to fetch media for Mastodon upload (${mediaRes.status})`);
  }
  const contentType = mediaRes.headers.get("content-type") ?? "application/octet-stream";
  const blob = new Blob([await mediaRes.arrayBuffer()], { type: contentType });
  const form = new FormData();
  form.append("file", blob, "upload");

  const uploadRes = await fetch(`https://${instanceDomain}/api/v2/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!uploadRes.ok && uploadRes.status !== 202) {
    throw new Error(`Mastodon media upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  }
  let media = (await uploadRes.json()) as MastodonMediaResponse;

  if (uploadRes.status === 202) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const statusRes = await fetch(`https://${instanceDomain}/api/v1/media/${media.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (statusRes.status === 200) break;
      if (statusRes.status !== 206) {
        throw new Error(`Mastodon media processing failed (${statusRes.status})`);
      }
    }
  }

  return media.id;
}

async function publish(account: PublishableAccount, content: PublishContent): Promise<PublishResult> {
  const instanceDomain = parseInstanceDomain(account.platformUserId);
  const mediaId = await uploadMedia(instanceDomain, account.accessToken, content.mediaUrl);

  const res = await fetch(`https://${instanceDomain}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: content.caption, media_ids: [mediaId] }),
  });
  if (!res.ok) {
    throw new Error(`Mastodon publish failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) {
    throw new Error("Mastodon publish response did not include a status id");
  }
  return { platformPostId: data.id };
}

interface MastodonAccountStatsResponse {
  followers_count?: number;
  statuses_count?: number;
}

// Mastodon's REST API has no engagement-analytics endpoint (no views/likes/
// shares aggregation) - followers_count is the one audience number
// verify_credentials/accounts exposes. likes/shares/comments would need
// fetching and summing the account's recent statuses' favourites_count/
// reblogs_count/replies_count individually - not implemented yet.
async function fetchAnalytics(account: PublishableAccount): Promise<AnalyticsMetrics> {
  const instanceDomain = parseInstanceDomain(account.platformUserId);
  const accountId = account.platformUserId.split("|")[1];
  const res = await fetch(`https://${instanceDomain}/api/v1/accounts/${accountId}`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Mastodon analytics request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as MastodonAccountStatsResponse;
  return { followers: data.followers_count ?? 0, views: 0, likes: 0, shares: 0, comments: 0 };
}

export const mastodonAdapter: PlatformAdapter = {
  platform: "MASTODON",
  displayName: "Mastodon",
  defaultDailyPostLimit: 20,
  prepareAuthorization,
  getAuthorizationUrl,
  exchangeCodeForAccounts,
  publish,
  fetchAnalytics,
};
