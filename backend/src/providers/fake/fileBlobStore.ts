import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BlobStore } from "../types";

const SCHEME = "fake://blobs/";

// Offline blob store: keeps files in a local directory, addressed by fake:// URLs.
export class FileBlobStore implements BlobStore {
  constructor(private readonly directory: string) {}

  async put(key: string, data: Buffer | string): Promise<string> {
    const filePath = this.pathFor(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return SCHEME + encodeURIComponent(key);
  }

  async get(url: string): Promise<Buffer> {
    return readFile(this.pathForURL(url));
  }

  async delete(url: string): Promise<void> {
    await rm(this.pathForURL(url), { force: true });
  }

  private pathForURL(url: string): string {
    if (!url.startsWith(SCHEME)) throw new Error(`Not a fake blob URL: ${url}`);
    return this.pathFor(decodeURIComponent(url.slice(SCHEME.length)));
  }

  private pathFor(key: string): string {
    const filePath = path.resolve(this.directory, key);
    if (!filePath.startsWith(path.resolve(this.directory) + path.sep)) {
      throw new Error(`Blob key escapes the data directory: ${key}`);
    }
    return filePath;
  }
}
