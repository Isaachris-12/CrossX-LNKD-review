import type {
  AnalyticsMetrics,
  LinkedPlatformAccount,
  PlatformAdapter,
  PublishableAccount,
  PublishContent,
  PublishResult,
} from "./types.js";
import { isVideoUrl } from "./mediaType.js";

// v1 scope: only accounts hosted on Bluesky's own PDS (bsky.social) - the
// vast majority of accounts. Self-hosted PDS accounts would need resolving
// the user's DID document to find their actual PDS host first; not
// implemented yet.
const BSKY_SERVICE = "https://bsky.social";

interface CreateSessionResponse {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
}

// Bluesky JWTs don't come with a separate expires_in field - the expiry is
// the standard "exp" claim inside the JWT itself, read here without needing
// a JWT library since we only need one field, not signature verification
// (the token's validity is enforced by Bluesky's own API on every call).
function decodeJwtExpiry(jwt: string): Date | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

function unsupported(): never {
  throw new Error("Bluesky connects with a handle + app password, not OAuth.");
}

// Full atproto OAuth (the direction Bluesky is heading) needs a publicly
// hosted client-metadata JSON document plus DPoP proof-of-possession tokens
// - a much heavier lift than every other adapter here. App passwords are
// Bluesky's own officially-supported alternative for exactly this kind of
// app, so that's what's implemented for v1 - see PlatformAdapter.authMethod.
async function connectWithCredentials(credentials: Record<string, string>): Promise<LinkedPlatformAccount[]> {
  const handle = credentials.handle?.trim();
  const appPassword = credentials.appPassword?.trim();
  if (!handle || !appPassword) {
    throw new Error("Both a Bluesky handle and an app password are required.");
  }

  const res = await fetch(`${BSKY_SERVICE}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      res.status === 401
        ? "Incorrect handle or app password. Use an app password from Bluesky's Settings > App Passwords, not your main account password."
        : `Bluesky login failed (${res.status}): ${body}`,
    );
  }
  const session = (await res.json()) as CreateSessionResponse;

  return [
    {
      platform: "BLUESKY",
      platformUserId: session.did,
      displayName: `@${session.handle}`,
      avatarUrl: null,
      accessToken: session.accessJwt,
      refreshToken: session.refreshJwt,
      tokenExpiresAt: decodeJwtExpiry(session.accessJwt),
      scopes: [],
    },
  ];
}

async function uploadBlob(accessToken: string, mediaUrl: string) {
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) {
    throw new Error(`Failed to fetch media for Bluesky upload (${mediaRes.status})`);
  }
  const contentType = mediaRes.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await mediaRes.arrayBuffer());

  const res = await fetch(`${BSKY_SERVICE}/xrpc/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
    body: buffer,
  });
  if (!res.ok) {
    throw new Error(`Bluesky media upload failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { blob: unknown };
  return data.blob;
}

// Video posts need Bluesky's separate video-upload service (a different
// endpoint with its own processing/status-polling flow) - not implemented
// yet, same honest-gap pattern as Pinterest's video limitation.
async function publish(account: PublishableAccount, content: PublishContent): Promise<PublishResult> {
  if (isVideoUrl(content.mediaUrl)) {
    throw new Error("Bluesky video posts aren't supported yet - only images.");
  }

  const blob = await uploadBlob(account.accessToken, content.mediaUrl);

  const res = await fetch(`${BSKY_SERVICE}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: account.platformUserId,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text: content.caption.slice(0, 300),
        createdAt: new Date().toISOString(),
        embed: { $type: "app.bsky.embed.images", images: [{ image: blob, alt: "" }] },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Bluesky publish failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { uri?: string };
  if (!data.uri) {
    throw new Error("Bluesky publish response did not include a post uri");
  }
  return { platformPostId: data.uri };
}

interface BlueskyProfileResponse {
  followersCount?: number;
  postsCount?: number;
}

// Bluesky's profile endpoint only exposes follower/post counts, not
// engagement (likes/reposts/replies) totals - those would need fetching and
// summing the account's recent posts individually, not implemented yet.
async function fetchAnalytics(account: PublishableAccount): Promise<AnalyticsMetrics> {
  const url = new URL(`${BSKY_SERVICE}/xrpc/app.bsky.actor.getProfile`);
  url.searchParams.set("actor", account.platformUserId);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${account.accessToken}` } });
  if (!res.ok) {
    throw new Error(`Bluesky analytics request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as BlueskyProfileResponse;
  return { followers: data.followersCount ?? 0, views: 0, likes: 0, shares: 0, comments: 0 };
}

export const blueskyAdapter: PlatformAdapter = {
  platform: "BLUESKY",
  displayName: "Bluesky",
  defaultDailyPostLimit: 25,
  authMethod: "credentials",
  getAuthorizationUrl: unsupported,
  exchangeCodeForAccounts: unsupported,
  connectWithCredentials,
  publish,
  fetchAnalytics,
};
