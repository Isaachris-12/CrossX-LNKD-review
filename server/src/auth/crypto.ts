import bcrypt from "bcrypt";
import crypto from "node:crypto";

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Refresh tokens are opaque random strings handed to the client; only their
// SHA-256 digest is ever persisted, so the DB never holds a usable token.
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
