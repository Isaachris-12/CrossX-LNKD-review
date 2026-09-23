// "trial" and "expired" both mean unsubscribed - see AccessSummary for what
// that actually restricts. "active" is the only status with full access.
export type SubscriptionStatus = "trial" | "active" | "expired";

export interface AccessSummary {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string;
  platformLimit: number;
  canPost: boolean;
  canDisconnect: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
  access: AccessSummary;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SignupRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export type Platform =
  | "INSTAGRAM"
  | "TIKTOK"
  | "FACEBOOK"
  | "LINKEDIN"
  | "YOUTUBE"
  | "REDDIT"
  | "BLUESKY"
  | "PINTEREST"
  | "MASTODON";

export const ALL_PLATFORMS: Platform[] = [
  "INSTAGRAM",
  "TIKTOK",
  "FACEBOOK",
  "LINKEDIN",
  "YOUTUBE",
  "REDDIT",
  "BLUESKY",
  "PINTEREST",
  "MASTODON",
];

// Platforms that don't authenticate via the standard OAuth browser redirect.
// The mobile Hub screen uses this to show a credential-entry form (handle +
// app password, etc.) instead of opening an OAuth browser session.
export const CREDENTIAL_AUTH_PLATFORMS: Platform[] = ["BLUESKY"];

// Platforms that need one extra piece of user input (collected in-app)
// before an OAuth flow can start, because the OAuth app itself is registered
// dynamically per input rather than being one fixed app (Mastodon is
// multi-instance - there's no single "the Mastodon app").
export const OAUTH_PREP_INPUT: Partial<Record<Platform, { key: string; label: string; placeholder: string }>> = {
  MASTODON: { key: "instanceDomain", label: "Mastodon server", placeholder: "mastodon.social" },
};

export interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  secure?: boolean;
}

// Field definitions for CREDENTIAL_AUTH_PLATFORMS' connect form.
export const CREDENTIAL_FIELDS: Partial<Record<Platform, CredentialField[]>> = {
  BLUESKY: [
    { key: "handle", label: "Bluesky handle", placeholder: "yourname.bsky.social" },
    { key: "appPassword", label: "App password", placeholder: "xxxx-xxxx-xxxx-xxxx", secure: true },
  ],
};

export type ConnectedAccountStatus = "connected" | "expired" | "revoked";

export interface ConnectedAccountSummary {
  id: string;
  platform: Platform;
  displayName: string;
  avatarUrl: string | null;
  status: ConnectedAccountStatus;
  postsRemainingToday: number;
  dailyPostLimit: number;
}

export type PostDispatchStatus = "pending" | "partial" | "complete" | "failed";
export type PostTargetStatus = "queued" | "posting" | "success" | "failed";

export type PostContentType = "FEED" | "STORY";

// Platforms whose adapter can actually publish a Story (see
// PlatformAdapter.supportsStories in server/src/platforms/types.ts - this is
// the mobile-side mirror of that same fact, used to filter the Post+
// platform picker when "Story" is selected). Most platforms here never had a
// Stories feature, and several that once did (LinkedIn, YouTube, Pinterest)
// have since discontinued it.
export const STORY_CAPABLE_PLATFORMS: Platform[] = ["INSTAGRAM", "FACEBOOK"];

export interface PostTargetSummary {
  connectedAccountId: string;
  platform: Platform;
  status: PostTargetStatus;
  platformPostId: string | null;
  errorMessage: string | null;
}

export interface PostDispatchSummary {
  id: string;
  status: PostDispatchStatus;
  contentType: PostContentType;
  createdAt: string;
  targets: PostTargetSummary[];
}

export interface CreatePostRequest {
  caption: string;
  mediaUrl: string;
  targetAccountIds: string[];
  contentType: PostContentType;
}

export type AnalyticsPeriod = "daily" | "monthly";

export interface AnalyticsPoint {
  capturedAt: string;
  followers: number;
  views: number;
  likes: number;
  shares: number;
  comments: number;
}

export interface AnalyticsSeries {
  connectedAccountId: string;
  platform: Platform;
  period: AnalyticsPeriod;
  points: AnalyticsPoint[];
}
