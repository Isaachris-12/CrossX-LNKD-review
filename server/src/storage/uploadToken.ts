import jwt from "jsonwebtoken";
import { env } from "../env.js";

const UPLOAD_TOKEN_TTL_SECONDS = 5 * 60;

interface UploadTokenPayload {
  key: string;
}

// Acts like a presigned URL's built-in authorization: a short-lived signed
// token scoped to one specific storage key, so the local-storage upload
// endpoint doesn't need a separate auth mechanism from S3's own presigned
// URLs.
export function signUploadToken(key: string): string {
  const payload: UploadTokenPayload = { key };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: UPLOAD_TOKEN_TTL_SECONDS });
}

export class InvalidUploadTokenError extends Error {}

export function verifyUploadToken(token: string, expectedKey: string): void {
  let payload: UploadTokenPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as UploadTokenPayload;
  } catch {
    throw new InvalidUploadTokenError("Upload link is invalid or expired");
  }
  if (payload.key !== expectedKey) {
    throw new InvalidUploadTokenError("Upload link does not match this file");
  }
}
