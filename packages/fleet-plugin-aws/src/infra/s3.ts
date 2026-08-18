import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectVersionsCommand,
  type ListObjectVersionsCommandOutput,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  PutBucketCorsCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface DualBucketProvisionOptions {
  readonly region: string;
  readonly tempBucketName: string;
  readonly prodBucketName: string;
  readonly autoPruneTempDays?: number;
  readonly enableCors?: boolean;
}

export interface DualBucketProvisionResult {
  readonly tempBucketName: string;
  readonly prodBucketName: string;
  readonly tempBucketCreated: boolean;
  readonly prodBucketCreated: boolean;
  readonly lifecycleConfigured: boolean;
  readonly corsConfigured: boolean;
}

/**
 * Empties all objects and versions from an S3 bucket.
 */
async function emptyBucket(s3: S3Client, bucketName: string): Promise<number> {
  let totalDeleted = 0;

  // 1. Delete objects
  let continuationToken: string | undefined = undefined;
  while (true) {
    const listRes: ListObjectsV2CommandOutput = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      }),
    );

    const objects = listRes.Contents ?? [];
    if (objects.length > 0) {
      const keys = objects
        .map((o) => o.Key)
        .filter((k): k is string => typeof k === "string")
        .map((Key) => ({ Key }));

      if (keys.length > 0) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: keys,
              Quiet: true,
            },
          }),
        );
        totalDeleted += keys.length;
      }
    }

    if (!listRes.IsTruncated || !listRes.NextContinuationToken) {
      break;
    }
    continuationToken = listRes.NextContinuationToken;
  }

  // 2. Delete versioned objects and delete markers
  try {
    const versionsRes: ListObjectVersionsCommandOutput = await s3.send(
      new ListObjectVersionsCommand({ Bucket: bucketName }),
    );
    const versions = [
      ...(versionsRes.Versions ?? [])
        .filter((v) => typeof v.Key === "string")
        .map((v) => ({ Key: v.Key!, VersionId: v.VersionId })),
      ...(versionsRes.DeleteMarkers ?? [])
        .filter((m) => typeof m.Key === "string")
        .map((m) => ({ Key: m.Key!, VersionId: m.VersionId })),
    ];
    if (versions.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: versions, Quiet: true },
        }),
      );
      totalDeleted += versions.length;
    }
  } catch {
    // Non-versioned bucket
  }

  return totalDeleted;
}

/**
 * Automates creation and configuration of Dual S3 Buckets:
 * 1. Temporary Scratch Bucket (with 24h auto-prune lifecycle)
 * 2. Production CDN Bucket (with HLS video streaming CORS configuration)
 */
export async function provisionDualS3Buckets(
  options: DualBucketProvisionOptions,
): Promise<DualBucketProvisionResult> {
  const {
    region,
    tempBucketName,
    prodBucketName,
    autoPruneTempDays = 1,
    enableCors = true,
  } = options;

  const s3 = new S3Client({ region });

  async function ensureBucket(bucket: string): Promise<boolean> {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      return false; // Already exists
    } catch {
      try {
        await s3.send(
          new CreateBucketCommand({
            Bucket: bucket,
            CreateBucketConfiguration:
              region === "us-east-1"
                ? undefined
                : { LocationConstraint: region as never },
          }),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("BucketAlreadyOwnedByYou")) {
          throw err;
        }
      }

      // Default SSE-S3 encryption
      try {
        await s3.send(
          new PutBucketEncryptionCommand({
            Bucket: bucket,
            ServerSideEncryptionConfiguration: {
              Rules: [
                {
                  ApplyServerSideEncryptionByDefault: {
                    SSEAlgorithm: "AES256",
                  },
                },
              ],
            },
          }),
        );
      } catch {
        // Ignore if already encrypted
      }

      return true;
    }
  }

  const tempBucketCreated = await ensureBucket(tempBucketName);
  const prodBucketCreated = await ensureBucket(prodBucketName);

  // Configure auto-prune lifecycle on Temporary Scratch Bucket
  let lifecycleConfigured = false;
  try {
    await s3.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: tempBucketName,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: "veolms-auto-prune-temp-cuts",
              Status: "Enabled",
              Filter: { Prefix: "" },
              Expiration: {
                Days: autoPruneTempDays,
              },
            },
          ],
        },
      }),
    );
    lifecycleConfigured = true;
  } catch {
    lifecycleConfigured = false;
  }

  // Configure CORS on Production CDN Bucket for web players (HLS.js / Safari)
  let corsConfigured = false;
  if (enableCors) {
    try {
      await s3.send(
        new PutBucketCorsCommand({
          Bucket: prodBucketName,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ["*"],
                AllowedMethods: ["GET", "HEAD"],
                AllowedOrigins: ["*"],
                ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
      corsConfigured = true;
    } catch {
      corsConfigured = false;
    }
  }

  return {
    tempBucketName,
    prodBucketName,
    tempBucketCreated,
    prodBucketCreated,
    lifecycleConfigured,
    corsConfigured,
  };
}

/**
 * Destroys and deletes both Temporary Scratch and Production S3 Buckets.
 */
export async function destroyDualS3Buckets(options: {
  region: string;
  tempBucketName: string;
  prodBucketName: string;
}): Promise<{ tempDeleted: boolean; prodDeleted: boolean }> {
  const { region, tempBucketName, prodBucketName } = options;
  const s3 = new S3Client({ region });

  async function deleteBucket(bucketName: string): Promise<boolean> {
    try {
      await emptyBucket(s3, bucketName);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
      return true;
    } catch {
      return false;
    }
  }

  const tempDeleted = await deleteBucket(tempBucketName);
  const prodDeleted = await deleteBucket(prodBucketName);

  return { tempDeleted, prodDeleted };
}

/**
 * Verifies existence and access to Dual S3 Buckets.
 */
export async function checkDualS3Buckets(options: {
  region: string;
  tempBucketName: string;
  prodBucketName: string;
}): Promise<{ tempExists: boolean; prodExists: boolean }> {
  const { region, tempBucketName, prodBucketName } = options;
  const s3 = new S3Client({ region });

  async function exists(bucketName: string): Promise<boolean> {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
      return true;
    } catch {
      return false;
    }
  }

  const tempExists = await exists(tempBucketName);
  const prodExists = await exists(prodBucketName);

  return { tempExists, prodExists };
}
