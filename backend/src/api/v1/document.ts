import { MAX_UPLOAD_BYTES } from "@quizqrafter/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  deleteDocument,
  getDocumentFile,
  getDocumentText,
  listDocuments,
  uploadDocument,
} from "../../core/documents";
import type { Deps } from "../../core/types";
import { annotate } from "../../observability/events";
import type { AppEnv } from "./env";
import { fileTooLarge, parseId, restrict, sendError, userIdOf } from "./http";

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
      if (!(file instanceof File)) return sendError(c, 400, "errors.upload.noFile");
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

  // The original file, for the document viewer. Only allowed upload types are ever stored,
  // and nosniff stops the browser from treating one as anything else.
  router.get("/:id/file", restrict, async (c) => {
    const file = await getDocumentFile(deps, userIdOf(c), parseId(c.req.param("id")));
    return c.body(new Uint8Array(file.content), 200, {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    });
  });

  // A Word document's text, which the viewer shows in place of the .docx file.
  router.get("/:id/text", restrict, async (c) => {
    const text = await getDocumentText(deps, userIdOf(c), parseId(c.req.param("id")));
    return c.text(text, 200);
  });

  // Deletes the document with its quiz, jobs and stored files.
  router.delete("/:id", restrict, async (c) => {
    const id = parseId(c.req.param("id"));
    annotate({ "app.document.id": id });
    await deleteDocument(deps, userIdOf(c), id);
    return c.body(null, 204);
  });

  return router;
}
