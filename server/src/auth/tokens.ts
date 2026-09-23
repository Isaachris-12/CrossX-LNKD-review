import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { generateRefreshToken, hashRefreshToken } from "./crypto.js";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AccessTokenPayload {
  sub: string;
}

export function signAccessToken(userId: string): string {
  const payload: AccessTokenPayload = { sub: userId };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
}

// Issues a brand new refresh token row for a user (e.g. at signup/login).
export async function issueRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return token;
}

export class InvalidRefreshTokenError extends Error {}

// Validates a presented refresh token, revokes it, and issues a replacement
// (rotation) so a stolen-but-unused token can only ever be redeemed once.
export async function rotateRefreshToken(
  presentedToken: string,
): Promise<{ userId: string; refreshToken: string }> {
  const tokenHash = hashRefreshToken(presentedToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new InvalidRefreshTokenError();
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  const refreshToken = await issueRefreshToken(record.userId);
  return { userId: record.userId, refreshToken };
}

export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(presentedToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
