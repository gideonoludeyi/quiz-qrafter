import { Router } from "express";
import multer from "multer";
import { listDocuments, uploadDocument } from "../../core/documents";
import type { Deps } from "../../core/types";
import { restrict, userIdOf, wrap } from "./http";

const multerMiddleware = multer({ storage: multer.memoryStorage() });

export default function documentRouter(deps: Deps) {
  const router = Router();

  router.post(
    "/upload",
    restrict,
    multerMiddleware.single("file"),
    wrap(async (req, res) => {
      if (!req.file) return res.status(400 /* Bad Request */).json({ error: "No file uploaded" });

      const { originalname, buffer, size, mimetype } = req.file;
      const document = await uploadDocument(deps, userIdOf(req), {
        filename: originalname,
        content: buffer,
        size,
        mimeType: mimetype,
      });
      return res.status(200).json({ document });
    }),
  );

  router.get(
    "/",
    restrict,
    wrap(async (req, res) => {
      const documents = await listDocuments(deps, userIdOf(req));
      return res.status(200).json({ documents });
    }),
  );

  return router;
}
