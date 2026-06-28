/**
 * Server-side face validation + normalization.
 *
 * Two-gate strategy (CLAUDE.md "Face validation"): the browser does the fast,
 * friendly check (face-api.js / MediaPipe) so staff get instant "no face / too
 * dark / multiple faces" feedback. This module is the SERVER re-check that runs
 * before a PushJob is ever queued — the E16C silently rejects unclear faces, so
 * this gate is what stops the door from failing enrollment after staff think
 * they're done.
 *
 * What's implemented here with `sharp` (always works, no native ML deps):
 *   - decode + reject non-images / absurd dimensions
 *   - auto-orient (strip EXIF rotation), center-crop toward square
 *   - re-encode to JPEG <= MAX_BYTES (the device wants a compact face image)
 *   - a cheap luminance check to catch obviously-too-dark frames
 *
 * Actual face DETECTION (exactly one frontal face) is a pluggable step —
 * `detectFaces` defaults to a no-op that trusts the client gate. Wire a real
 * detector (@vladmandic/face-api + tfjs-node, or a hosted vision call) by
 * assigning `setFaceDetector(...)` at app startup. Kept out of the default path
 * so the build doesn't pull a large native ML toolchain it can't run.
 */
import sharp from "sharp";

const MAX_BYTES = 2 * 1024 * 1024; // device-friendly cap (<= 2MB)
const MAX_EDGE = 1024; // downscale longest edge to this
const MIN_EDGE = 200; // smaller than this can't be a usable face crop
const DARK_THRESHOLD = 40; // mean luminance below this = "too dark"

export interface FaceValidation {
  ok: boolean;
  reason?: string;
  /** normalized JPEG bytes, present when ok */
  image?: Uint8Array;
  width?: number;
  height?: number;
  faces?: number;
}

export type FaceDetector = (
  jpeg: Uint8Array,
) => Promise<{ faces: number }>;

let _detect: FaceDetector | null = null;
/** Wire a real detector at startup; until then we trust the client-side gate. */
export function setFaceDetector(fn: FaceDetector) {
  _detect = fn;
}

export async function validateFace(input: Uint8Array): Promise<FaceValidation> {
  let img: sharp.Sharp;
  try {
    img = sharp(input, { failOn: "error" }).rotate(); // rotate() = auto-orient via EXIF
  } catch {
    return { ok: false, reason: "Not a readable image." };
  }

  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    return { ok: false, reason: "Image has no dimensions." };
  }
  if (Math.min(meta.width, meta.height) < MIN_EDGE) {
    return {
      ok: false,
      reason: `Image too small (${meta.width}x${meta.height}); need at least ${MIN_EDGE}px on the short edge.`,
    };
  }

  // Cheap brightness gate.
  const stats = await img.clone().greyscale().stats();
  const meanLuma = stats.channels[0]?.mean ?? 255;
  if (meanLuma < DARK_THRESHOLD) {
    return { ok: false, reason: "Image looks too dark — retake with more light." };
  }

  // Normalize: downscale longest edge, JPEG encode under the size cap.
  let quality = 85;
  let bytes: Buffer;
  const base = img
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  do {
    bytes = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    quality -= 10;
  } while (bytes.byteLength > MAX_BYTES && quality >= 35);

  if (bytes.byteLength > MAX_BYTES) {
    return { ok: false, reason: "Could not compress image under 2MB." };
  }

  // Optional real detection.
  let faces: number | undefined;
  if (_detect) {
    const det = await _detect(new Uint8Array(bytes));
    faces = det.faces;
    if (det.faces === 0) return { ok: false, reason: "No face detected.", faces };
    if (det.faces > 1)
      return { ok: false, reason: "More than one face detected.", faces };
  }

  const out = await sharp(bytes).metadata();
  return {
    ok: true,
    image: new Uint8Array(bytes),
    width: out.width,
    height: out.height,
    faces,
  };
}

export const FACE_MAX_BYTES = MAX_BYTES;
