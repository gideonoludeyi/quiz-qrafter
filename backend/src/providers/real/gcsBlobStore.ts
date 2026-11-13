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
    const { hostname: bucket, pathname } = new URL(url);
    const key = decodeURIComponent(pathname.slice(1));
    const [content] = await this.storage.bucket(bucket).file(key).download();
    return content;
  }
}
