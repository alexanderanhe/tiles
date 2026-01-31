import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.server";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export function getR2PublicUrl(key: string) {
  if (!env.R2_PUBLIC_BASE_URL) return "";
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

export async function signUploadUrl(key: string, contentType?: string) {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn: 60 * 10 });
}

export async function signDownloadUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
  });
  return getSignedUrl(r2, command, { expiresIn: 60 * 10 });
}

export async function headObject(key: string) {
  return r2.send(
    new HeadObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    })
  );
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  return r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getObject(key: string) {
  return r2.send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    })
  );
}
