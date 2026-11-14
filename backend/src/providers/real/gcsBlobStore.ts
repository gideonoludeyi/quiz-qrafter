import { Storage } from "@google-cloud/storage";
import type { BlobStore } from "../types";

// Stores files in a Google Cloud Storage bucket, addressed by gs:// URLs.
export class GcsBlobStore implements BlobStore {
  private readonly storage: Storage;

  constructor(
    private readonly bucketName: string,
    credentialsFile: string,
  ) {
    this.storage = new Storage({ keyFile: credentialsFile });
  }

  async put(key: string, data: Buffer | string): Promise<string> {
    const file = this.storage.bucket(this.bucketName).file(key);
    await file.save(data);
    return file.cloudStorageURI.href;
  }

  async get(url: string): Promise<Buffer> {
    const [content] = await this.fileAt(url).download();
    return content;
  }

  async delete(url: string): Promise<void> {
    await this.fileAt(url).delete({ ignoreNotFound: true });
  }

  private fileAt(url: string) {
    const { hostname: bucket, pathname } = new URL(url);
    return this.storage.bucket(bucket).file(decodeURIComponent(pathname.slice(1)));
  }
}
