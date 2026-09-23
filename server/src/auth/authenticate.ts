import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "./tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

// preHandler hook for protected routes: reads "Authorization: Bearer <token>",
// verifies it, and attaches the user id to the request.
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return reply.status(401).send({ error: "Missing bearer token" });
  }

  try {
    const payload = verifyAccessToken(token);
    request.userId = payload.sub;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}
