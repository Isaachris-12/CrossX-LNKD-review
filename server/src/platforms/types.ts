import type { Platform } from "@crossx/shared";

export interface LinkedPlatformAccount {
  platform: Platform;
  platformUserId: string;
  displayName: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
}

export interface PublishableAccount {
  platformUserId: string;
  accessToken: string;
}

export interface PublishContent {
  caption: string;
  // A publicly-reachable URL to the already-hosted image/video. CrossX-LNKD
  // doesn't run its own media storage yet, so the client supplies a URL
  // rather than uploading a file directly - see Post+ screen notes.
  mediaUrl: string;
}

export interface PublishResult {
  platformPostId: string;
}

// What each field actually measures varies by platform and is documented in
// that adapter's fetchAnalytics - some are lifetime cumulative totals (e.g.
// YouTube channel views), others are a single period's activity (e.g.
// Instagram's daily reach). Each is still meaningful as its own trend line;
// they're not meant to be compared 1:1 across platforms.
export interface AnalyticsMetrics {
  followers: number;
  views: number;
  likes: number;
  shares: number;
  comments: number;
}

// One adapter per platform.
export interface PlatformAdapter {
  platform: Platform;
  displayName: string;
  defaultDailyPostLimit: number;

  // "oauth" (default, if omitted) opens a browser OAuth session. "credentials"
  // means the mobile app collects fields directly (see connectWithCredentials)
  // and never opens a browser - e.g. Bluesky's app-password login, since
  // full atproto OAuth needs a hosted client-metadata document and DPoP
  // proof-of-possession tokens, a much heavier lift than every other adapter
  // here for a protocol still mid-migration off password auth.
  authMethod?: "oauth" | "credentials";

  // Most platforms have one fixed OAuth app (client id/secret from env) and
  // need no setup before building the authorization URL. A platform that
  // isn't a single fixed app - Mastodon is multi-instance, so "the app" has
  // to be dynamically registered on whichever instance the user names -
  // implements this to do that setup and return whatever the resulting
  // getAuthorizationUrl/exchangeCodeForAccounts calls need (e.g. the
  // instance's freshly-issued client id/secret). Its return value is signed
  // into the OAuth state JWT so the later, unauthenticated callback can read
  // it back without any server-side session storage.
  prepareAuthorization?(
    input: Record<string, string>,
    redirectUri: string,
  ): Promise<{ extra: Record<string, string> }>;

  getAuthorizationUrl(
    state: string,
    redirectUri: string,
    extra?: Record<string, string>,
  ): string | Promise<string>;

  // Exchanges an OAuth "code" for one or more linked accounts. Most platforms
  // return exactly one; Meta can return an Instagram account alongside the
  // Facebook Page it's linked to from a single OAuth grant. `extra` is
  // whatever prepareAuthorization returned, round-tripped via the state JWT.
  exchangeCodeForAccounts(
    code: string,
    redirectUri: string,
    extra?: Record<string, string>,
  ): Promise<LinkedPlatformAccount[]>;

  // Only present when authMethod === "credentials". Field names are
  // platform-specific (e.g. { handle, appPassword } for Bluesky).
  connectWithCredentials?(credentials: Record<string, string>): Promise<LinkedPlatformAccount[]>;

  publish(account: PublishableAccount, content: PublishContent): Promise<PublishResult>;

  // True only for platforms with a real Stories-publishing API (currently
  // Instagram and Facebook - most platforms never had Stories, and several
  // that once did have since discontinued it). The /posts route rejects a
  // STORY submission targeting any account whose adapter lacks this.
  supportsStories?: boolean;
  publishStory?(account: PublishableAccount, content: PublishContent): Promise<PublishResult>;

  fetchAnalytics(account: PublishableAccount): Promise<AnalyticsMetrics>;
}
