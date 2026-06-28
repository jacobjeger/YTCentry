/**
 * Object storage for face photos — MinIO (S3-compatible) running as its own
 * Railway service. The dashboard writes uploads here; the ingest worker writes
 * emailed images here; the Review Queue reads them back via signed URLs. The
 * on-site agent never touches storage — it receives image bytes via the PushJob
 * payload reference, fetched server-side and handed to it.
 *
 * Backed by Railway's native S3-compatible Buckets (region "auto", virtual-host
 * URL style). Set S3_FORCE_PATH_STYLE=true if pointing at a path-style store
 * (e.g. self-hosted MinIO) instead.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const BUCKET = process.env.S3_BUCKET ?? "ytc-faces";

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    endpoint: env("S3_ENDPOINT"), // e.g. https://t3.storageapi.dev (Railway)
    region: process.env.S3_REGION ?? "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: env("S3_ACCESS_KEY"),
      secretAccessKey: env("S3_SECRET_KEY"),
    },
  });
  return _client;
}

/** Store image bytes; returns the object key to persist on the row. */
export async function putPhoto(
  key: string,
  bytes: Uint8Array,
  contentType = "image/jpeg",
): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
  return key;
}

/** Fetch the raw bytes (server-side, e.g. to hand a face to the agent push). */
export async function getPhotoBytes(key: string): Promise<Uint8Array> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  const arr = await res.Body!.transformToByteArray();
  return arr;
}

/** Short-lived signed URL for showing a photo in the dashboard UI. */
export async function signedPhotoUrl(
  key: string,
  expiresInSeconds = 300,
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export async function deletePhoto(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export const PHOTO_BUCKET = BUCKET;
