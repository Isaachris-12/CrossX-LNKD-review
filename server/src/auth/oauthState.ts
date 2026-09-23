import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../env.js";
import type { Platform } from "@crossx/shared";

const STATE_TTL_SECONDS = 10 * 60; // 10 minutes: plenty for a user to complete the OAuth dialog

interface OAuthStatePayload {
  sub: string; // userId
  platform: Platform;
  nonce: string;
  // Round-trips whatever PlatformAdapter.prepareAuthorization returned (e.g.
  // Mastodon's per-instance client id/secret) to the later, unauthenticated
  // callback - see PlatformAdapter in server/src/platforms/types.ts.
  extra?: Record<string, string>;
}

// The state param is a signed, short-lived JWT rather than a DB row: it proves
// the callback belongs to a CrossX-LNKD session we issued, without needing
// server-side session storage for an OAuth flow that's over in a few minutes.
export function signOAuthState(userId: string, platform: Platform, extra?: Record<string, string>): string {
  const payload: OAuthStatePayload = { sub: userId, platform, nonce: crypto.randomUUID(), extra };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: STATE_TTL_SECONDS });
}

export class InvalidOAuthStateError extends Error {}

export function verifyOAuthState(
  state: string,
  expectedPlatform: Platform,
): { userId: string; extra?: Record<string, string> } {
  let payload: OAuthStatePayload;
  try {
    payload = jwt.verify(state, env.jwtSecret) as OAuthStatePayload;
  } catch {
    throw new InvalidOAuthStateError("State token is invalid or expired");
  }

  if (payload.platform !== expectedPlatform) {
    throw new InvalidOAuthStateError("State token does not match this platform");
  }

  return { userId: payload.sub, extra: payload.extra };
}
