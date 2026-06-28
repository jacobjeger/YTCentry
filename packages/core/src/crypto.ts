/**
 * Small AES-256-GCM helper for encrypting device web passwords at rest in the
 * DB. Key is derived (scrypt) from DEVICE_SECRET (or SESSION_SECRET as a
 * fallback). Format: base64(salt).base64(iv).base64(tag+ciphertext).
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

function secret(): string {
  const s = process.env.DEVICE_SECRET || process.env.SESSION_SECRET;
  if (!s) throw new Error("DEVICE_SECRET or SESSION_SECRET must be set for device encryption");
  return s;
}

export function encryptSecret(plain: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(secret(), salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    salt.toString("base64"),
    iv.toString("base64"),
    Buffer.concat([tag, enc]).toString("base64"),
  ].join(".");
}

export function decryptSecret(blob: string): string {
  const [saltB64, ivB64, payloadB64] = blob.split(".");
  if (!saltB64 || !ivB64 || !payloadB64) throw new Error("Malformed encrypted secret");
  const key = scryptSync(secret(), Buffer.from(saltB64, "base64"), 32);
  const iv = Buffer.from(ivB64, "base64");
  const payload = Buffer.from(payloadB64, "base64");
  const tag = payload.subarray(0, 16);
  const enc = payload.subarray(16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
