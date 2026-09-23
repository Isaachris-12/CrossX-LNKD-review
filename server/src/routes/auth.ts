import type { FastifyInstance } from "fastify";
import { Prisma, type User } from "@prisma/client";
import type { AuthResponse, AuthUser } from "@crossx/shared";
import { prisma } from "../db.js";
import { authenticate } from "../auth/authenticate.js";
import { hashPassword, verifyPassword } from "../auth/crypto.js";
import {
  InvalidRefreshTokenError,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "../auth/tokens.js";
import { summarizeAccess, trialEndsAtFromNow } from "../subscription/access.js";

const credentialsSchema = {
  type: "object",
  required: ["email", "password"],
  additionalProperties: false,
  properties: {
    email: { type: "string", pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", maxLength: 254 },
    password: { type: "string", minLength: 8, maxLength: 200 },
  },
} as const;

const refreshSchema = {
  type: "object",
  required: ["refreshToken"],
  additionalProperties: false,
  properties: {
    refreshToken: { type: "string", minLength: 1 },
  },
} as const;

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    access: summarizeAccess(user),
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string; password: string } }>(
    "/auth/signup",
    { schema: { body: credentialsSchema } },
    async (request, reply) => {
      const { email, password } = request.body;
      const passwordHash = await hashPassword(password);

      let user;
      try {
        user = await prisma.user.create({
          data: { email: email.toLowerCase(), passwordHash, trialEndsAt: trialEndsAtFromNow() },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.status(409).send({ error: "An account with that email already exists" });
        }
        throw err;
      }

      const accessToken = signAccessToken(user.id);
      const refreshToken = await issueRefreshToken(user.id);

      const body: AuthResponse = {
        user: toAuthUser(user),
        tokens: { accessToken, refreshToken },
      };
      return reply.status(201).send(body);
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    "/auth/login",
    { schema: { body: credentialsSchema } },
    async (request, reply) => {
      const { email, password } = request.body;
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

      const valid = user ? await verifyPassword(password, user.passwordHash) : false;
      if (!user || !valid) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      const accessToken = signAccessToken(user.id);
      const refreshToken = await issueRefreshToken(user.id);

      const body: AuthResponse = {
        user: toAuthUser(user),
        tokens: { accessToken, refreshToken },
      };
      return reply.send(body);
    },
  );

  app.post<{ Body: { refreshToken: string } }>(
    "/auth/refresh",
    { schema: { body: refreshSchema } },
    async (request, reply) => {
      try {
        const { userId, refreshToken } = await rotateRefreshToken(request.body.refreshToken);
        const accessToken = signAccessToken(userId);
        return reply.send({ accessToken, refreshToken });
      } catch (err) {
        if (err instanceof InvalidRefreshTokenError) {
          return reply.status(401).send({ error: "Invalid or expired refresh token" });
        }
        throw err;
      }
    },
  );

  app.post<{ Body: { refreshToken: string } }>(
    "/auth/logout",
    { schema: { body: refreshSchema } },
    async (request, reply) => {
      await revokeRefreshToken(request.body.refreshToken);
      return reply.status(204).send();
    },
  );

  app.get("/auth/me", { preHandler: authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }
    return reply.send(toAuthUser(user));
  });
}
