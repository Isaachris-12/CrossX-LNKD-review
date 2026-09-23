# Deploying CrossX-LNKD

This covers taking the backend from local dev to a real production deployment
that can serve many users at once. The mobile app's own distribution (App
Store / Play Store) is a separate step, covered briefly at the end.

## What's already built for this

- **Stateless API** (JWT auth, no in-memory sessions) - safe to run as
  multiple instances behind a load balancer.
- **Horizontally-scalable workers** (`server/src/worker.ts`) - BullMQ workers
  are designed to run as multiple replicas pulling from the same queue; no
  code changes needed to add more.
- **S3-compatible storage driver** already implemented
  (`server/src/storage/s3Storage.ts`) - just needs real credentials.
- **[Dockerfile](Dockerfile)** - multi-stage build producing one image used
  for both the API and the worker (the start command differs, see
  `render.yaml`). Built and run-tested locally against this project's
  Postgres/Redis before being written up here.
- **[render.yaml](render.yaml)** - a Render Blueprint provisioning the API,
  worker, a managed Postgres database, and a managed Redis instance from one
  file. Unlike the Dockerfile, this hasn't been verified against a live
  Render deploy - double check it against
  [Render's Blueprint docs](https://render.com/docs/blueprint-spec) the
  first time you apply it.

Render is the suggested host because it natively supports "web service" +
"background worker" + managed Postgres + managed Redis in one Blueprint,
which matches this app's shape without extra infrastructure work. The
Dockerfile itself is portable, though - it would work unchanged on Fly.io,
Railway, ECS/Fargate, or Cloud Run if you'd rather use one of those.

## Critical: media storage MUST be S3-compatible in production

The local-disk storage driver (`server/src/storage/localStorage.ts`,
`server/media-storage/`) only works for local dev. A container host like
Render gives each deploy a **fresh, ephemeral filesystem** - anything written
to local disk is gone on the next deploy or restart. If `S3_BUCKET` etc.
aren't set in production, uploaded media will silently disappear.

Before going live, set up an S3-compatible bucket - Cloudflare R2 is a
reasonable default (S3-compatible API, no egress fees) but AWS S3 or any
other S3-compatible provider works too - and set `S3_BUCKET`, `S3_REGION`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (and `S3_ENDPOINT` for a non-AWS
provider) in the API and worker's environment variables. The storage layer
switches over automatically once those are set (`server/src/storage/registry.ts`).

## Step by step (Render)

1. **Push this repo to GitHub** (or GitLab/Bitbucket) - Render deploys from a
   git repo, not a local directory.

2. **Generate real secrets** - never reuse the `dev-only-change-me` values
   from `.env`:
   ```bash
   openssl rand -base64 48   # JWT_SECRET
   openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY
   ```

3. **In the Render dashboard**: "New +" -> "Blueprint", point it at the repo.
   Render reads `render.yaml` and provisions the database, Redis, API, and
   worker together.

4. **Fill in the secrets** Render prompts for (everything marked
   `sync: false` in `render.yaml`): the two generated above, each platform's
   OAuth app credentials (see `server/.env.example` for where to get each
   one), and the S3 credentials from the step above.

5. **Set `PUBLIC_BASE_URL`** to the API service's Render URL (something like
   `https://crossx-lnkd-api.onrender.com`) once Render assigns it - or your
   own custom domain if you attach one. Render provisions HTTPS for you
   automatically, so **this fully replaces the ngrok tunnel used in local
   dev** - no tunnel needed in production.

6. **Register OAuth redirect URIs** with each platform using that same base
   URL - `${PUBLIC_BASE_URL}/oauth/facebook/callback`,
   `/oauth/instagram/callback`, `/oauth/tiktok/callback`,
   `/oauth/linkedin/callback`, `/oauth/youtube/callback` - same as the local
   setup, just with the real domain instead of an ngrok URL.

7. **Database migrations** run automatically via `render.yaml`'s
   `preDeployCommand` (`prisma migrate deploy`, not `migrate dev` - it only
   applies existing migrations, never generates new ones) before each deploy
   of the API service.

8. **Point the mobile app at production** - update
   `apps/mobile/src/api/config.ts`'s fallback (or add an env-based override)
   to the production API URL instead of relying on the Metro dev-server
   host-detection trick, which only makes sense for local development.

## Scaling further

- Bump the API and worker's instance count/plan independently in Render as
  load grows - both already support running multiple replicas with no code
  changes.
- Bump `concurrency` in `server/src/queue/postDispatchWorker.ts` (currently
  5) if worker throughput becomes the bottleneck before instance count does.
- Each platform's API rate limits are tied to your app's `client_id`, not to
  CrossX-LNKD's own infrastructure - as usage grows, that's a conversation
  with each platform (Meta, TikTok, etc.) about raising your app's tier, not
  something solved by adding servers.

## Mobile app distribution (brief - not built out here)

Getting the app in front of real users also means an actual App Store /
Play Store release, which is a separate track from the backend work above:

- **EAS Build** (`npx expo install eas-cli`, then `eas build`) compiles real
  iOS/Android binaries in Expo's cloud (needed regardless of OS, since this
  machine is Windows and can't produce an iOS build locally).
- Requires an Apple Developer account ($99/year) for iOS and a Google Play
  Developer account (one-time $25) for Android.
- `app.json` will need real store metadata (icons, splash screen, privacy
  policy URL - required by both stores given this app requests photo/camera
  permissions) before either store will accept a submission.

Happy to build out the EAS configuration and store-submission checklist in
a follow-up once the backend is actually deployed and the platform OAuth
apps are approved - there's little point preparing a store release before
the app can do anything against real accounts.
