import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { authenticate } from "../auth/authenticate.js";
import { InvalidOAuthStateError, signOAuthState, verifyOAuthState } from "../auth/oauthState.js";
import { getPlatformAdapter } from "../platforms/registry.js";
import { linkAccountsForUser } from "../platforms/linkAccounts.js";
import { getPlatformLimit } from "../subscription/access.js";

// Takes the raw lowercase URL segment (e.g. "facebook"), not the adapter's
// uppercase Platform enum value, so the URL registered in each platform's
// developer dashboard stays a clean, predictable lowercase path.
function buildRedirectUri(platformUrlSegment: string): string {
  if (!env.publicBaseUrl) {
    throw new Error(
      "PUBLIC_BASE_URL is not set. OAuth needs a public HTTPS URL for this server (e.g. an ngrok tunnel) to receive callbacks.",
    );
  }
  return `${env.publicBaseUrl}/oauth/${platformUrlSegment.toLowerCase()}/callback`;
}

function appRedirect(status: "success" | "error", platform: string, message?: string): string {
  const url = new URL(`${env.appScheme}://oauth-complete`);
  url.searchParams.set("status", status);
  url.searchParams.set("platform", platform);
  if (message) url.searchParams.set("message", message);
  return url.toString();
}

export async function oauthRoutes(app: FastifyInstance) {
  // Called by the mobile app (authenticated) to get the URL to open in an
  // in-app browser session.
  app.get<{ Params: { platform: string }; Querystring: Record<string, string> }>(
    "/oauth/:platform/start",
    { preHandler: authenticate },
    async (request, reply) => {
      const adapter = getPlatformAdapter(request.params.platform);
      if (!adapter) {
        return reply.status(404).send({ error: "Unsupported platform" });
      }
      if (adapter.authMethod === "credentials") {
        return reply.status(400).send({
          error: `${adapter.displayName} connects with credentials, not OAuth - use /accounts/${request.params.platform.toLowerCase()}/connect instead.`,
        });
      }

      const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId! } });
      const alreadyConnected = await prisma.connectedAccount.findFirst({
        where: { userId: request.userId!, platform: adapter.platform, status: "connected" },
      });
      if (!alreadyConnected) {
        const connectedCount = await prisma.connectedAccount.count({
          where: { userId: request.userId!, status: "connected" },
        });
        if (connectedCount >= getPlatformLimit(user)) {
          return reply.status(403).send({
            error: `Your plan allows ${getPlatformLimit(user)} connected platform(s). Upgrade to connect more.`,
          });
        }
      }

      let redirectUri: string;
      let authorizationUrl: string;
      try {
        redirectUri = buildRedirectUri(request.params.platform);
        let extra: Record<string, string> | undefined;
        if (adapter.prepareAuthorization) {
          const prepared = await adapter.prepareAuthorization(request.query, redirectUri);
          extra = prepared.extra;
        }
        const state = signOAuthState(request.userId!, adapter.platform, extra);
        authorizationUrl = await adapter.getAuthorizationUrl(state, redirectUri, extra);
      } catch (err) {
        request.log.error(err);
        return reply.status(503).send({ error: (err as Error).message });
      }

      return reply.send({ authorizationUrl });
    },
  );

  // Called directly by the platform's OAuth server (not the mobile app), so
  // this route is unauthenticated - the signed state param is what proves
  // which CrossX-LNKD user this belongs to.
  app.get<{ Params: { platform: string }; Querystring: { code?: string; state?: string; error?: string } }>(
    "/oauth/:platform/callback",
    async (request, reply) => {
      const platformParam = request.params.platform;
      const adapter = getPlatformAdapter(platformParam);
      if (!adapter) {
        return reply.status(404).send({ error: "Unsupported platform" });
      }

      const { code, state, error } = request.query;
      if (error || !code || !state) {
        return reply.redirect(appRedirect("error", platformParam, error ?? "missing_code"));
      }

      let userId: string;
      let extra: Record<string, string> | undefined;
      try {
        const verified = verifyOAuthState(state, adapter.platform);
        userId = verified.userId;
        extra = verified.extra;
      } catch (err) {
        if (err instanceof InvalidOAuthStateError) {
          return reply.redirect(appRedirect("error", platformParam, "invalid_state"));
        }
        throw err;
      }

      try {
        const redirectUri = buildRedirectUri(platformParam);
        const linkedAccounts = await adapter.exchangeCodeForAccounts(code, redirectUri, extra);
        const { addedCount, skippedForLimit } = await linkAccountsForUser(userId, linkedAccounts);

        if (addedCount === 0 && skippedForLimit > 0) {
          return reply.redirect(appRedirect("error", platformParam, "platform_limit_reached"));
        }

        const url = new URL(appRedirect("success", platformParam));
        if (skippedForLimit > 0) url.searchParams.set("limitReached", "true");
        return reply.redirect(url.toString());
      } catch (err) {
        request.log.error(err);
        return reply.redirect(appRedirect("error", platformParam, "exchange_failed"));
      }
    },
  );
}
