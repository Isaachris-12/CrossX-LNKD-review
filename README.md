# CrossX-LNKD

A mobile hub for content creators and brands: connect Instagram, TikTok, Facebook,
LinkedIn, YouTube, Reddit, Bluesky, Pinterest, and Mastodon accounts in one place,
publish a single **Post+** to every connected platform at once (reformatted per
platform), track how many posts you have left today per platform, and view
unified analytics (views/likes/shares, daily & monthly growth) — with a
one-tap link into each platform.

CrossX-LNKD never stores the content of a post beyond the moment it's being
dispatched, and no user can ever see another user's accounts or data.

## Status

Built so far: auth (signup/login/refresh), OAuth account linking for nine
platforms (Instagram, Facebook, TikTok, LinkedIn, YouTube, Reddit, Bluesky,
Pinterest, Mastodon), the Post+ dispatch pipeline (pick a real photo/video
from the device, which uploads to storage before fanning out to every
selected platform via a background job queue, with daily per-platform post
limits enforced), and the analytics hub (an hourly ingestion job pulls each
platform's stats into daily/monthly growth charts, with a one-tap link out
to each platform).

Not every platform connects the same way - see "Connection methods" below.

## Structure

```
apps/mobile/     Expo (React Native + TypeScript) app - iOS & Android
server/          Fastify + TypeScript API, Prisma/PostgreSQL, BullMQ/Redis jobs
packages/shared/ TypeScript types shared between server and mobile
docker-compose.yml   Local Postgres + Redis for development
Dockerfile       Production image for the API/worker (see DEPLOYMENT.md)
render.yaml      Render Blueprint: API + worker + Postgres + Redis
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for taking this to production.

## Prerequisites

- Node.js 20+
- Docker Desktop (for local Postgres + Redis)
- Expo Go app on your phone, or an iOS/Android simulator, to run the mobile app

## Setup

```bash
npm install
docker compose up -d
cp server/.env.example server/.env
```

Then apply the database schema:

```bash
npm run prisma:migrate
```

## Running

Backend API (http://localhost:4000, health check at `/health`):

```bash
npm run dev:server
```

Worker process (must run alongside the API - it consumes the Post+ dispatch
queue AND runs the hourly analytics ingestion job):

```bash
npm run dev:worker
```

Mobile app (scan the QR code with Expo Go, or press `i`/`a` for a simulator):

```bash
npm run dev:mobile
```

## Architecture notes

- **Privacy by design**: the caption/media for a post only exists in the
  in-flight dispatch job (Redis) and is discarded once the job completes.
  Postgres only ever stores dispatch *status*, never post content.
- **Platform tokens** are AES-256-GCM encrypted at rest and are never returned
  to any client.
- **Connection methods**: most platforms use the standard OAuth browser-redirect
  flow (`server/src/platforms/types.ts`'s `PlatformAdapter`). Two don't:
  - **Mastodon** is multi-instance (decentralized) - there's no single "the
    Mastodon app". The app is registered dynamically on whichever server the
    user names (via `prepareAuthorization`, a proprietary per-instance
    `POST /api/v1/apps` endpoint Mastodon supports instead of standard OAuth
    Dynamic Client Registration), then the usual OAuth dance proceeds against
    that instance.
  - **Bluesky** connects with a handle + app password
    (`authMethod: "credentials"`) rather than OAuth - full atproto OAuth needs
    a hosted client-metadata document and DPoP proof-of-possession tokens, a
    much heavier lift than every other adapter here for a protocol still
    mid-migration off password auth. App passwords are Bluesky's own
    officially-supported alternative. Only accounts hosted on Bluesky's own
    PDS (`bsky.social`) are supported - not self-hosted PDS accounts.
- **External approvals required**: before any platform integration can go live,
  the team needs Meta app review (Instagram + Facebook), TikTok Content Posting
  API approval, LinkedIn Marketing API access, Google OAuth consent screen
  verification (YouTube), a Reddit app (approval can be slow and "fails
  silently" per Reddit's own docs), and Pinterest "Standard" API access
  (new apps start in sandbox-only "Trial" access). Mastodon and Bluesky need
  no centralized approval - Mastodon apps register instantly per-instance,
  and Bluesky app passwords work immediately. These are account/business
  approvals with each platform, not something that can be done from this
  codebase.
- **Media storage**: Post+ lets you pick a real photo/video from the device,
  which uploads directly to storage before dispatch. The storage backend is
  pluggable (`server/src/storage/`) - local disk works out of the box for
  dev (`server/media-storage/`, gitignored), and switches automatically to
  S3-compatible storage (AWS S3, Cloudflare R2, MinIO, ...) once `S3_BUCKET`,
  `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` are set in
  `server/.env`. Either way, the client always follows the same two-step
  upload flow (ask for an upload target, then PUT the bytes there), so
  switching backends never touches mobile code. Note: for Instagram/Facebook/
  TikTok to actually be able to fetch locally-stored media when publishing
  (their servers reach out to the URL themselves), `PUBLIC_BASE_URL` must be
  set - the same tunnel already used for OAuth callbacks.
- **Known per-platform publish gaps**: LinkedIn posts are text-only for now
  (image/video needs LinkedIn's separate asset-upload flow); TikTok posts
  default to `SELF_ONLY` visibility (public posting needs TikTok's app audit);
  YouTube uploads default to `private` and use a simple multipart upload
  rather than the resumable protocol (fine for small files, not for large
  ones); Reddit posts go to your own profile (`u/<username>`, since Reddit has
  no generic "profile timeline" the way IG/FB/LinkedIn do) as a link post, not
  a native image/video submission; Pinterest and Bluesky only support image
  pins/posts, not video yet (both need a separate video-upload flow their
  APIs don't share with images). All documented inline in
  `server/src/platforms/`.
- **Known analytics gaps**: each platform exposes different metrics through
  different APIs, so "views" means something different per platform (e.g.
  Instagram's daily reach vs. YouTube's lifetime channel views) - see the
  comments in each adapter's `fetchAnalytics`, and the note shown under each
  chart in the app. LinkedIn analytics aren't available at all yet - member-
  level stats need LinkedIn's partner-restricted API access, which this app's
  OAuth scopes don't include. Reddit, Bluesky, Pinterest, and Mastodon only
  report follower-style totals for now (karma/subscribers, followers,
  followers, followers respectively) - none of their APIs expose a
  general-purpose engagement (views/likes/shares) endpoint the way Meta's
  Graph API insights do.
- **Platform icons are placeholders**: `PlatformIcon` (`apps/mobile/src/components/PlatformIcon.tsx`)
  renders whatever image sits in `apps/mobile/assets/platforms/` - right now
  that's solid-color swatches, not real logos, since those need to be sourced
  from each platform's official brand kit (trademarked assets, not something
  to grab from anywhere). See `apps/mobile/assets/platforms/README.md` for
  where to get them - dropping in the real files needs no code changes.
