import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import { authenticate } from "../auth/authenticate.js";
import { getStorageAdapter } from "../storage/registry.js";
import { ensureStorageDir, localStoragePath } from "../storage/localStorage.js";
import { InvalidUploadTokenError, verifyUploadToken } from "../storage/uploadToken.js";
import { ALLOWED_CONTENT_TYPES, CONTENT_TYPE_BY_EXTENSION } from "../storage/key.js";

const uploadTargetSchema = {
  type: "object",
  required: ["contentType"],
  additionalProperties: false,
  properties: { contentType: { type: "string" } },
} as const;

export async function mediaRoutes(app: FastifyInstance) {
  await ensureStorageDir();

  // Step 1: ask for somewhere to upload. Works the same regardless of which
  // storage driver is active (local disk or S3-compatible) - see
  // src/storage/registry.ts.
  app.post<{ Body: { contentType: string } }>(
    "/media/upload-target",
    { schema: { body: uploadTargetSchema }, preHandler: authenticate },
    async (request, reply) => {
      const { contentType } = request.body;
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        return reply.status(400).send({ error: `Unsupported content type: ${contentType}` });
      }
      const target = await getStorageAdapter().createUploadTarget(contentType);
      return reply.send(target);
    },
  );

  // Step 2 for the LOCAL storage driver only: receives the actual file
  // bytes. When S3 storage is configured, the client instead PUTs directly
  // to the presigned S3 URL and this route is never hit. Authorization is
  // the signed `token` query param (same model as a presigned URL), not a
  // Bearer header, since the client just performs a plain PUT here.
  app.put<{ Params: { key: string }; Querystring: { token?: string } }>(
    "/media/upload/:key",
    async (request, reply) => {
      const { key } = request.params;
      const { token } = request.query;
      if (!token) {
        return reply.status(401).send({ error: "Missing upload token" });
      }
      try {
        verifyUploadToken(token, key);
      } catch (err) {
        if (err instanceof InvalidUploadTokenError) {
          return reply.status(401).send({ error: err.message });
        }
        throw err;
      }

      if (!Buffer.isBuffer(request.body)) {
        return reply.status(400).send({ error: "Expected raw file bytes" });
      }

      await fs.writeFile(localStoragePath(key), request.body);
      return reply.status(204).send();
    },
  );

  // Serves files uploaded to the local storage driver.
  app.get<{ Params: { key: string } }>("/media/:key", async (request, reply) => {
    const { key } = request.params;
    try {
      const data = await fs.readFile(localStoragePath(key));
      const extension = key.split(".").pop() ?? "";
      reply.type(CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream");
      return reply.send(data);
    } catch {
      return reply.status(404).send({ error: "Not found" });
    }
  });
}
