import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";
import { generateMediaKey } from "./key.js";
import type { StorageAdapter, UploadTarget } from "./types.js";

const UPLOAD_URL_TTL_SECONDS = 5 * 60;

interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function requireS3Config(): S3Config {
  if (!env.s3Bucket || !env.s3Region || !env.s3AccessKeyId || !env.s3SecretAccessKey) {
    throw new Error(
      "S3 storage is not configured. Set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY in server/.env.",
    );
  }
  return {
    bucket: env.s3Bucket,
    region: env.s3Region,
    accessKeyId: env.s3AccessKeyId,
    secretAccessKey: env.s3SecretAccessKey,
  };
}

function client(config: S3Config): S3Client {
  return new S3Client({
    region: config.region,
    // Setting endpoint targets an S3-compatible provider (Cloudflare R2,
    // MinIO, Backblaze B2, ...) instead of real AWS S3.
    endpoint: env.s3Endpoint,
    forcePathStyle: Boolean(env.s3Endpoint),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

export const s3StorageAdapter: StorageAdapter = {
  name: "s3",
  async createUploadTarget(contentType: string): Promise<UploadTarget> {
    const config = requireS3Config();
    const key = `uploads/${generateMediaKey(contentType)}`;

    const command = new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType });
    const uploadUrl = await getSignedUrl(client(config), command, { expiresIn: UPLOAD_URL_TTL_SECONDS });

    const publicUrl = env.s3PublicUrlBase
      ? `${env.s3PublicUrlBase}/${key}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;

    return {
      uploadUrl,
      uploadMethod: "PUT",
      uploadHeaders: { "Content-Type": contentType },
      publicUrl,
      key,
    };
  },
};
