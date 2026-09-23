import crypto from "node:crypto";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_BY_CONTENT_TYPE).map(([contentType, ext]) => [ext, contentType]),
);

export const ALLOWED_CONTENT_TYPES = new Set(Object.keys(EXTENSION_BY_CONTENT_TYPE));

export function extensionFromContentType(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? "bin";
}

export function generateMediaKey(contentType: string): string {
  return `${crypto.randomUUID()}.${extensionFromContentType(contentType)}`;
}
