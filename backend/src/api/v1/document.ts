import { MAX_UPLOAD_BYTES } from "@quizqrafter/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { listDocuments, uploadDocument } from "../../core/documents";
import type { Deps } from "../../core/types";
import type { AppEnv } from "./env";
import { fileTooLarge, restrict, userIdOf } from "./http";

// Room for the multipart framing around a file that is exactly at the size limit.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export default function documentRouter(deps: Deps) {
  const router = new Hono<AppEnv>();

  router.post(
    "/upload",
    restrict,
    bodyLimit({ maxSize: MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES, onError: fileTooLarge }),
    async (c) => {
      const { file } = await c.req.parseBody();
      if (!(file instanceof File)) return c.json({ error: "No file uploaded" }, 400);
      if (file.size > MAX_UPLOAD_BYTES) return fileTooLarge(c);

      const result = await uploadDocument(deps, userIdOf(c), {
        filename: file.name,
        content: Buffer.from(await file.arrayBuffer()),
        size: file.size,
        mimeType: file.type,
      });
      return c.json(result, 202);
    },
  );

  router.get("/", restrict, async (c) => {
    const documents = await listDocuments(deps, userIdOf(c));
    return c.json({ documents }, 200);
  });

  return router;
}
