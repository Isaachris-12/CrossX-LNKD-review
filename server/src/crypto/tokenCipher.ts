import crypto from "node:crypto";
import { env } from "../env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(): Buffer {
  // TOKEN_ENCRYPTION_KEY is a human-typed secret; hash it down to exactly
  // 32 bytes so any reasonable secret value works as an AES-256 key.
  return crypto.createHash("sha256").update(env.tokenEncryptionKey).digest();
}

// Encrypts an OAuth access/refresh token for storage. Format: iv.authTag.ciphertext (base64url, dot-separated).
export function encryptToken(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64url")).join(".");
}

export function decryptToken(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted token");
  }

  const key = deriveKey();
  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(authTagB64, "base64url");
  const ciphertext = Buffer.from(ciphertextB64, "base64url");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
