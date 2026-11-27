/**
 * Makes an upload smaller in the browser before it is stored, without visible loss:
 *   * photos and screenshots: at most 2560px on the long side, saved again at high quality
 *     (JPEG 0.9 for photos, WebP 0.92 for PNG / WebP, which keeps transparency);
 *   * everything else (PDF, Word, Excel, text): gzip, which is lossless — the exact original
 *     comes back when the file is opened.
 * The smaller version is kept only when it really is smaller; otherwise the original is stored.
 */

export interface Shrunk {
  blob: Blob;
  /** the type the stored bytes have */
  storedMime: string;
  /** the type of the file as the person sees it (after opening) */
  mime: string;
  name: string;
  encoding: "gzip" | null;
  originalSize: number;
}

export const MAX_IMAGE_SIDE = 2560;
const SKIP_BELOW = 200 * 1024; // small files are stored as they are
const IMAGE_KEEP = 0.9; // keep the re-saved image only if it is at most 90% of the original
const GZIP_KEEP = 0.95; // keep gzip only if it saves at least 5%

/** The size an image is scaled to so its long side is at most `max` (never scaled up). */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= max) return { w, h };
  const k = max / long;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** "photo.png" + "image/webp" → "photo.webp". */
export function renameFor(name: string, mime: string): string {
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : null;
  if (!ext) return name;
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`;
}

async function shrinkImage(file: File, mime: string): Promise<Shrunk | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return null;
  }
  const { w, h } = fitWithin(bmp.width, bmp.height, MAX_IMAGE_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    return null;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const outMime = mime === "image/jpeg" ? "image/jpeg" : "image/webp";
  const quality = outMime === "image/jpeg" ? 0.9 : 0.92;
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, outMime, quality));
  // some browsers can't write WebP and quietly give PNG: then keep the original
  if (!blob || blob.type !== outMime) return null;
  return {
    blob,
    storedMime: outMime,
    mime: outMime,
    name: renameFor(file.name, outMime),
    encoding: null,
    originalSize: file.size,
  };
}

async function gzip(file: File): Promise<Blob | null> {
  if (typeof CompressionStream !== "function") return null;
  try {
    const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
    // The type must be set: storage uploads a Blob with its own type, and an empty one is sent
    // as application/octet-stream, which the bucket refuses.
    const raw = await new Response(stream).blob();
    return new Blob([raw], { type: "application/gzip" });
  } catch {
    return null;
  }
}

export async function shrinkForUpload(file: File, mime: string): Promise<Shrunk> {
  const original: Shrunk = {
    blob: file,
    storedMime: mime,
    mime,
    name: file.name,
    encoding: null,
    originalSize: file.size,
  };
  if (file.size < SKIP_BELOW) return original;

  if (mime.startsWith("image/")) {
    const img = await shrinkImage(file, mime);
    return img && img.blob.size <= file.size * IMAGE_KEEP ? img : original;
  }

  const gz = await gzip(file);
  if (gz && gz.size <= file.size * GZIP_KEEP) {
    return {
      blob: gz,
      storedMime: "application/gzip",
      mime,
      name: file.name,
      encoding: "gzip",
      originalSize: file.size,
    };
  }
  return original;
}

/** The original bytes of a stored file. */
export async function unshrink(stored: Blob, encoding: string | null, mime: string): Promise<Blob> {
  if (encoding !== "gzip")
    return stored.type === mime ? stored : new Blob([stored], { type: mime });
  const stream = stored.stream().pipeThrough(new DecompressionStream("gzip"));
  const bytes = await new Response(stream).arrayBuffer();
  return new Blob([bytes], { type: mime });
}

export function prettySize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
