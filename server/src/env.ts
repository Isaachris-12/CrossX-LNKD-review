import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// .env files commonly ship optional vars as `KEY=""` rather than omitting
// them, which is an empty string, not undefined - normalize that here so
// every optional/defaulted field below behaves the same whether a var is
// left out entirely or set to "".
function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  port: Number(optional("PORT") ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),
  jwtSecret: required("JWT_SECRET"),
  tokenEncryptionKey: required("TOKEN_ENCRYPTION_KEY"),

  // The app's custom URL scheme (see apps/mobile/app.json "scheme") that the
  // OAuth callback bounces back to once account linking is done.
  appScheme: optional("APP_SCHEME") ?? "crossxlnkd",

  // This server's own publicly-reachable HTTPS origin, used to build each
  // platform's OAuth redirect_uri as `${publicBaseUrl}/oauth/<platform>/callback`.
  // Platforms reject non-HTTPS redirect URIs, so local dev needs a tunnel
  // (e.g. `ngrok http 4000`) - set this to the tunnel's https URL and
  // register the resulting callback URL(s) in each platform's developer app.
  publicBaseUrl: optional("PUBLIC_BASE_URL"),

  // Each platform's OAuth app credentials. All optional at boot so the rest
  // of the server works before they're set up; the corresponding routes
  // fail with a clear error if they're missing.
  metaAppId: optional("META_APP_ID"),
  metaAppSecret: optional("META_APP_SECRET"),
  metaGraphVersion: optional("META_GRAPH_VERSION") ?? "v21.0",

  tiktokClientKey: optional("TIKTOK_CLIENT_KEY"),
  tiktokClientSecret: optional("TIKTOK_CLIENT_SECRET"),

  linkedinClientId: optional("LINKEDIN_CLIENT_ID"),
  linkedinClientSecret: optional("LINKEDIN_CLIENT_SECRET"),

  youtubeClientId: optional("YOUTUBE_CLIENT_ID"),
  youtubeClientSecret: optional("YOUTUBE_CLIENT_SECRET"),

  redditClientId: optional("REDDIT_CLIENT_ID"),
  redditClientSecret: optional("REDDIT_CLIENT_SECRET"),
  // Reddit requires a descriptive User-Agent on every API call, ideally
  // naming a real contact - see server/src/platforms/reddit.ts.
  redditUserAgent: optional("REDDIT_USER_AGENT") ?? "web:crossxlnkd:v1.0 (by /u/crossxlnkd)",

  pinterestClientId: optional("PINTEREST_CLIENT_ID"),
  pinterestClientSecret: optional("PINTEREST_CLIENT_SECRET"),

  // Mastodon and Bluesky need no fixed app credentials here: Mastodon
  // dynamically registers an OAuth app per instance at connect time, and
  // Bluesky authenticates with a user-supplied handle + app password rather
  // than a CrossX-LNKD-owned OAuth app - see their adapters.

  // Media storage: S3-compatible (AWS S3, Cloudflare R2, MinIO, etc.) is used
  // automatically once all four are set; otherwise storage falls back to the
  // local filesystem (server/media-storage/), which works out of the box for
  // dev but isn't suitable for production (single server, no CDN, lost on
  // redeploy).
  s3Bucket: optional("S3_BUCKET"),
  s3Region: optional("S3_REGION"),
  s3AccessKeyId: optional("S3_ACCESS_KEY_ID"),
  s3SecretAccessKey: optional("S3_SECRET_ACCESS_KEY"),
  // Optional: set for R2/MinIO/any non-AWS S3-compatible endpoint.
  s3Endpoint: optional("S3_ENDPOINT"),
  // Optional: override the public URL base (e.g. a CDN domain in front of
  // the bucket) instead of the bucket's default S3 URL.
  s3PublicUrlBase: optional("S3_PUBLIC_URL_BASE"),

  // Shared secret configured in the RevenueCat dashboard's webhook settings
  // (sent as the Authorization header) - lets us verify a webhook request
  // genuinely came from RevenueCat. Optional at boot like the OAuth
  // credentials; the webhook route itself rejects requests until it's set.
  revenueCatWebhookSecret: optional("REVENUECAT_WEBHOOK_SECRET"),
};
