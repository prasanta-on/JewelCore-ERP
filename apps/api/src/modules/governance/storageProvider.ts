import crypto from "node:crypto";
import { NotFoundError } from "@jewelcore/shared";

export interface ObjectStorageProvider {
  putObject(
    bucket: string,
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<void>;
  getObject(bucket: string, key: string): Promise<Buffer>;
  getPresignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds?: number,
  ): Promise<string>;
  deleteObject(bucket: string, key: string): Promise<void>;
  hasObject(bucket: string, key: string): Promise<boolean>;
}

/**
 * High-performance In-Memory Object Storage Provider for local, dev, and CI integration.
 * Conforms to S3-compatible key-value semantics with HMAC-signed presigned URLs.
 */
export class InMemoryObjectStorageProvider implements ObjectStorageProvider {
  private readonly store = new Map<
    string,
    { data: Buffer; contentType: string }
  >();
  private readonly signingSecret =
    process.env.STORAGE_SIGNING_SECRET || "jewelcore-object-storage-secret";

  private getCompositeKey(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }

  async putObject(
    bucket: string,
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<void> {
    this.store.set(this.getCompositeKey(bucket, key), {
      data: Buffer.from(data),
      contentType,
    });
  }

  async getObject(bucket: string, key: string): Promise<Buffer> {
    const item = this.store.get(this.getCompositeKey(bucket, key));
    if (!item) {
      throw new NotFoundError(
        `Object '${key}' in bucket '${bucket}' not found in storage`,
        "ERR_OBJECT_NOT_FOUND",
      );
    }
    return Buffer.from(item.data);
  }

  async getPresignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const stringToSign = `${bucket}/${key}:${expiresAt}`;
    const signature = crypto
      .createHmac("sha256", this.signingSecret)
      .update(stringToSign)
      .digest("hex");

    const baseUrl =
      process.env.STORAGE_ENDPOINT_URL || "https://storage.jewelcore.local";
    return `${baseUrl}/${encodeURIComponent(bucket)}/${encodeURI(key)}?expires=${expiresAt}&signature=${signature}`;
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    this.store.delete(this.getCompositeKey(bucket, key));
  }

  async hasObject(bucket: string, key: string): Promise<boolean> {
    return this.store.has(this.getCompositeKey(bucket, key));
  }

  clear(): void {
    this.store.clear();
  }
}

let activeProvider: ObjectStorageProvider = new InMemoryObjectStorageProvider();

export function getStorageProvider(): ObjectStorageProvider {
  return activeProvider;
}

export function setStorageProvider(provider: ObjectStorageProvider): void {
  activeProvider = provider;
}
