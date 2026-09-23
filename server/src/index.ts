import Fastify from "fastify";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { oauthRoutes } from "./routes/oauth.js";
import { accountsRoutes } from "./routes/accounts.js";
import { postsRoutes } from "./routes/posts.js";
import { mediaRoutes } from "./routes/media.js";
import { revenueCatRoutes } from "./routes/revenuecat.js";

// 100MB cap accommodates the local-storage media upload route, which
// receives a whole image/video body in one request (see routes/media.ts).
const app = Fastify({ logger: true, bodyLimit: 100 * 1024 * 1024 });

// Any request body that isn't application/json (e.g. the raw file bytes
// PUT to /media/upload/:key) is handled as a raw buffer rather than
// rejected - Fastify only parses json/text out of the box.
app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
  done(null, body);
});

// Normalizes every error response (schema validation failures included) to
// the same { error: "..." } shape our route handlers already use, so the
// client never has to guess which field carries the useful message. Without
// this, a validation failure's real detail sits in `message` while `error`
// is just the generic HTTP reason phrase ("Bad Request") - the client would
// only ever see the unhelpful generic text.
function friendlyValidationMessage(field: string, keyword: string, rawMessage: string): string {
  if (field === "email" && keyword === "pattern") return "Enter a valid email address";
  if (field === "password" && keyword === "minLength") return "Password must be at least 8 characters";
  return `${field}: ${rawMessage}`;
}

app.setErrorHandler((error, request, reply) => {
  if (error.validation) {
    const first = error.validation[0];
    const field = first?.instancePath?.replace(/^\//, "") || "input";
    const message = friendlyValidationMessage(field, first?.keyword ?? "", first?.message ?? "validation failed");
    return reply.status(400).send({ error: message });
  }
  request.log.error(error);
  return reply.status(error.statusCode ?? 500).send({ error: error.message || "Internal server error" });
});

app.get("/health", async () => {
  return { status: "ok" };
});

app.register(authRoutes);
app.register(oauthRoutes);
app.register(accountsRoutes);
app.register(postsRoutes);
app.register(mediaRoutes);
app.register(revenueCatRoutes);

// Confirms the Postgres connection is alive without exposing any data.
app.get("/health/db", async (_req, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { database: "ok" };
  } catch (err) {
    app.log.error(err);
    return reply.status(503).send({ database: "unreachable" });
  }
});

async function main() {
  await app.listen({ port: env.port, host: "0.0.0.0" });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
