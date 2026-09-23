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

// Facebook Login is the single OAuth dialog for both Facebook Pages and
// linked Instagram professional accounts, so both adapters below share the
// same authorization URL and code exchange - exchangeMetaCode() returns
// whichever of FACEBOOK/INSTAGRAM accounts it actually finds.
const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  // Needed specifically for Facebook's /photo_stories and /video_stories
  // endpoints (publishFacebookStory below) - not required for the plain
  // feed /photos and /videos endpoints, but Meta scopes this at app-review
  // time per permission, not per-endpoint, so it's requested up front.
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];

function requireMetaCredentials(): { appId: string; appSecret: string } {
  if (!env.metaAppId || !env.metaAppSecret) {
    throw new Error(
      "Meta OAuth is not configured. Set META_APP_ID and META_APP_SECRET in server/.env.",
    );
  }
  return { appId: env.metaAppId, appSecret: env.metaAppSecret };
}

function graphBaseUrl(): string {
  return `https://graph.facebook.com/${env.metaGraphVersion}`;
}

interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface MetaPageNode {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
    username: string;
    profile_picture_url?: string;
  };
}

interface MetaPagesResponse {
  data: MetaPageNode[];
}

async function metaGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${graphBaseUrl()}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta Graph API request failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

function getMetaAuthorizationUrl(state: string, redirectUri: string): string {
  const { appId } = requireMetaCredentials();
  const url = new URL(`https://www.facebook.com/${env.metaGraphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

async function exchangeMetaCode(code: string, redirectUri: string): Promise<LinkedPlatformAccount[]> {
  const { appId, appSecret } = requireMetaCredentials();

  // 1. Authorization code -> short-lived user access token.
  const shortLived = await metaGet<MetaTokenResponse>("/oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  // 2. Short-lived -> long-lived user access token (~60 days).
  const longLived = await metaGet<MetaTokenResponse>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLived.access_token,
  });

  // 3. List the Pages this user manages, each with its own (effectively
  //    non-expiring) Page access token and its linked Instagram account, if any.
  const pages = await metaGet<MetaPagesResponse>("/me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username,profile_picture_url}",
    access_token: longLived.access_token,
  });

  const tokenExpiresAt = longLived.expires_in
    ? new Date(Date.now() + longLived.expires_in * 1000)
    : null;

  const accounts: LinkedPlatformAccount[] = [];
  for (const page of pages.data) {
    accounts.push({
      platform: "FACEBOOK",
      platformUserId: page.id,
      displayName: page.name,
      avatarUrl: null,
      accessToken: page.access_token,
      refreshToken: null,
      tokenExpiresAt,
      scopes: META_SCOPES,
    });

    if (page.instagram_business_account) {
      accounts.push({
        platform: "INSTAGRAM",
        platformUserId: page.instagram_business_account.id,
        displayName: page.instagram_business_account.username,
        avatarUrl: page.instagram_business_account.profile_picture_url ?? null,
        // Instagram content publishing is authorized via the Page's access token.
        accessToken: page.access_token,
        refreshToken: null,
        tokenExpiresAt,
        scopes: META_SCOPES,
      });
    }
  }

  if (accounts.length === 0) {
    throw new Error(
      "No Facebook Pages were found for this account. CrossX-LNKD needs at least one Page " +
        "(with a linked Instagram professional account, if you also want to post to Instagram).",
    );
  }

  return accounts;
}

async function metaPost<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${graphBaseUrl()}${path}`, {
    method: "POST",
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    throw new Error(`Meta Graph API request failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function publishFacebook(
  account: PublishableAccount,
  content: PublishContent,
): Promise<PublishResult> {
  const isVideo = isVideoUrl(content.mediaUrl);
  const endpoint = isVideo ? `/${account.platformUserId}/videos` : `/${account.platformUserId}/photos`;
  const params: Record<string, string> = {
    access_token: account.accessToken,
    caption: content.caption,
  };
  if (isVideo) {
    params.file_url = content.mediaUrl;
  } else {
    params.url = content.mediaUrl;
  }

  const data = await metaPost<{ id?: string; post_id?: string }>(endpoint, params);
  const platformPostId = data.post_id ?? data.id;
  if (!platformPostId) {
    throw new Error("Facebook publish response did not include a post id");
  }
  return { platformPostId };
}

// Two-step: create a media container, then publish it. REELS covers video;
// stills use a plain image container.
async function publishInstagram(
  account: PublishableAccount,
  content: PublishContent,
): Promise<PublishResult> {
  const isVideo = isVideoUrl(content.mediaUrl);
  const createParams: Record<string, string> = {
    access_token: account.accessToken,
    caption: content.caption,
  };
  if (isVideo) {
    createParams.media_type = "REELS";
    createParams.video_url = content.mediaUrl;
  } else {
    createParams.image_url = content.mediaUrl;
  }

  const { id: creationId } = await metaPost<{ id: string }>(
    `/${account.platformUserId}/media`,
    createParams,
  );

  const { id: mediaId } = await metaPost<{ id: string }>(`/${account.platformUserId}/media_publish`, {
    access_token: account.accessToken,
    creation_id: creationId,
  });

  return { platformPostId: mediaId };
}

// Photo stories are a two-phase publish: upload the photo unpublished, then
// reference its id from /photo_stories. Video stories are the same shape but
// via /video_stories with upload_phase=finish - reusing the existing feed
// video upload (file_url, published=false) to get a video id first, the same
// simple one-shot-hosted-URL approach as publishFacebook's video path (not
// the full resumable upload protocol).
async function publishFacebookStory(
  account: PublishableAccount,
  content: PublishContent,
): Promise<PublishResult> {
  const isVideo = isVideoUrl(content.mediaUrl);

  if (isVideo) {
    const uploaded = await metaPost<{ id?: string }>(`/${account.platformUserId}/videos`, {
      access_token: account.accessToken,
      file_url: content.mediaUrl,
      published: "false",
    });
    if (!uploaded.id) {
      throw new Error("Facebook story video upload did not return a video id");
    }
    const story = await metaPost<{ post_id?: string; success?: boolean }>(
      `/${account.platformUserId}/video_stories`,
      { access_token: account.accessToken, video_id: uploaded.id, upload_phase: "finish" },
    );
    if (!story.post_id) {
      throw new Error("Facebook video story publish did not return a post id");
    }
    return { platformPostId: story.post_id };
  }

  const uploaded = await metaPost<{ id?: string }>(`/${account.platformUserId}/photos`, {
    access_token: account.accessToken,
    url: content.mediaUrl,
    published: "false",
  });
  if (!uploaded.id) {
    throw new Error("Facebook story photo upload did not return a photo id");
  }
  const story = await metaPost<{ post_id?: string; success?: boolean }>(
    `/${account.platformUserId}/photo_stories`,
    { access_token: account.accessToken, photo_id: uploaded.id },
  );
  if (!story.post_id) {
    throw new Error("Facebook photo story publish did not return a post id");
  }
  return { platformPostId: story.post_id };
}

// Same two-step container+publish flow as publishInstagram, just with
// media_type "STORIES" - Stories report back as IMAGE/VIDEO in most read
// endpoints (not a distinct type), but publishing them is this one extra
// parameter, no separate endpoint needed.
async function publishInstagramStory(
  account: PublishableAccount,
  content: PublishContent,
): Promise<PublishResult> {
  // No "caption" param here (unlike publishInstagram) - Stories media
  // containers don't accept one; visible text on a story comes from
  // stickers, not a caption, so content.caption is intentionally unused.
  const isVideo = isVideoUrl(content.mediaUrl);
  const createParams: Record<string, string> = {
    access_token: account.accessToken,
    media_type: "STORIES",
  };
  if (isVideo) {
    createParams.video_url = content.mediaUrl;
  } else {
    createParams.image_url = content.mediaUrl;
  }

  const { id: creationId } = await metaPost<{ id: string }>(
    `/${account.platformUserId}/media`,
    createParams,
  );

  const { id: mediaId } = await metaPost<{ id: string }>(`/${account.platformUserId}/media_publish`, {
    access_token: account.accessToken,
    creation_id: creationId,
  });

  return { platformPostId: mediaId };
}

// "views" here is yesterday's page_impressions (a daily reading, not a
// lifetime total); likes/comments/shares are summed across the 25 most
// recent posts, not lifetime totals either.
async function fetchFacebookAnalytics(account: PublishableAccount): Promise<AnalyticsMetrics> {
  const page = await metaGet<{ followers_count?: number; fan_count?: number }>(
    `/${account.platformUserId}`,
    { fields: "followers_count,fan_count", access_token: account.accessToken },
  );

  let views = 0;
  try {
    const insights = await metaGet<{ data: Array<{ values?: Array<{ value: number }> }> }>(
      `/${account.platformUserId}/insights`,
      { metric: "page_impressions", period: "day", access_token: account.accessToken },
    );
    const values = insights.data[0]?.values ?? [];
    views = values[values.length - 1]?.value ?? 0;
  } catch {
    views = 0; // insights can be unavailable depending on Page size/permissions
  }

  let likes = 0;
  let comments = 0;
  let shares = 0;
  try {
    const posts = await metaGet<{
      data: Array<{
        likes?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
        shares?: { count?: number };
      }>;
    }>(`/${account.platformUserId}/posts`, {
      fields: "likes.summary(true),comments.summary(true),shares",
      limit: "25",
      access_token: account.accessToken,
    });
    for (const post of posts.data) {
      likes += post.likes?.summary?.total_count ?? 0;
      comments += post.comments?.summary?.total_count ?? 0;
      shares += post.shares?.count ?? 0;
    }
  } catch {
    // no posts yet, or insufficient permissions - not fatal
  }

  return { followers: page.followers_count ?? page.fan_count ?? 0, views, likes, shares, comments };
}

// "views" here is today's reach (a daily reading, not a lifetime total);
// likes/comments are summed across the 25 most recent posts. Instagram's
// Graph API doesn't expose a comparable "shares" metric for organic posts.
async function fetchInstagramAnalytics(account: PublishableAccount): Promise<AnalyticsMetrics> {
  const profile = await metaGet<{ followers_count?: number }>(`/${account.platformUserId}`, {
    fields: "followers_count",
    access_token: account.accessToken,
  });

  let views = 0;
  try {
    const insights = await metaGet<{
      data: Array<{ total_value?: { value: number } }>;
    }>(`/${account.platformUserId}/insights`, {
      metric: "reach",
      period: "day",
      metric_type: "total_value",
      access_token: account.accessToken,
    });
    views = insights.data[0]?.total_value?.value ?? 0;
  } catch {
    views = 0;
  }

  let likes = 0;
  let comments = 0;
  try {
    const media = await metaGet<{ data: Array<{ like_count?: number; comments_count?: number }> }>(
      `/${account.platformUserId}/media`,
      { fields: "like_count,comments_count", limit: "25", access_token: account.accessToken },
    );
    for (const item of media.data) {
      likes += item.like_count ?? 0;
      comments += item.comments_count ?? 0;
    }
  } catch {
    // no posts yet - not fatal
  }

  return { followers: profile.followers_count ?? 0, views, likes, shares: 0, comments };
}

export const metaFacebookAdapter: PlatformAdapter = {
  platform: "FACEBOOK",
  displayName: "Facebook",
  defaultDailyPostLimit: 25,
  getAuthorizationUrl: getMetaAuthorizationUrl,
  exchangeCodeForAccounts: exchangeMetaCode,
  publish: publishFacebook,
  supportsStories: true,
  publishStory: publishFacebookStory,
  fetchAnalytics: fetchFacebookAnalytics,
};

export const metaInstagramAdapter: PlatformAdapter = {
  platform: "INSTAGRAM",
  displayName: "Instagram",
  defaultDailyPostLimit: 25,
  getAuthorizationUrl: getMetaAuthorizationUrl,
  exchangeCodeForAccounts: exchangeMetaCode,
  publish: publishInstagram,
  supportsStories: true,
  publishStory: publishInstagramStory,
  fetchAnalytics: fetchInstagramAnalytics,
};
