import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string; // e.g., "https://cdn.example.com" or "https://bucket.s3.region.amazonaws.com"
  forcePathStyle?: boolean; // For MinIO and S3-compatible services
}

export class S3StorageService {
  private s3Client: S3Client;
  private config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
    this.s3Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? false,
    });
  }

  /**
   * Generate a presigned URL for uploading a file
   * @param contentType - MIME type of the file (e.g., "image/png")
   * @param maxSizeBytes - Maximum file size in bytes (default: 5MB)
   * @returns Object with uploadUrl (presigned PUT URL) and objectKey (to save in DB)
   */
  async getPresignedUploadUrl(
    contentType: string = "image/jpeg",
    maxSizeBytes: number = 5 * 1024 * 1024
  ): Promise<{ uploadUrl: string; objectKey: string; publicUrl: string }> {
    const objectKey = `uploads/${randomUUID()}`;

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      ContentType: contentType,
      // Optional: Add metadata or ACL here
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900, // 15 minutes
    });

    // Construct public URL
    let publicUrl: string;
    if (this.config.publicBaseUrl) {
      publicUrl = `${this.config.publicBaseUrl}/${objectKey}`;
    } else if (this.config.endpoint.includes("amazonaws.com")) {
      // AWS S3 public URL format
      publicUrl = `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${objectKey}`;
    } else {
      // Generic S3-compatible (MinIO, etc.)
      publicUrl = `${this.config.endpoint}/${this.config.bucket}/${objectKey}`;
    }

    return {
      uploadUrl,
      objectKey,
      publicUrl,
    };
  }

  /**
   * Check if an object exists
   */
  async objectExists(objectKey: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      });
      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get a presigned URL for downloading a file (if bucket is private)
   */
  async getPresignedDownloadUrl(objectKey: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Get public URL for an object (if bucket is public)
   */
  getPublicUrl(objectKey: string): string {
    if (this.config.publicBaseUrl) {
      return `${this.config.publicBaseUrl}/${objectKey}`;
    } else if (this.config.endpoint.includes("amazonaws.com")) {
      return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${objectKey}`;
    } else {
      return `${this.config.endpoint}/${this.config.bucket}/${objectKey}`;
    }
  }
}

