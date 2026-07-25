/** Compress / normalize menu photos before upload (phone HEIC/large JPEG). */

const MAX_EDGE = 1600;
const MAX_BYTES_BEFORE_COMPRESS = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.82;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image. Try JPEG or PNG."));
    img.src = src;
  });
}

/**
 * Returns a JPEG/PNG/WebP File suitable for the menu API (≤ ~2MB typical).
 * Falls back to the original file if compression is unnecessary or unsupported.
 */
export async function prepareMenuImage(file: File): Promise<File> {
  const type = (file.type || "").toLowerCase();
  const allowed = type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "image/gif";

  // Already small + allowed — skip work
  if (allowed && file.size <= MAX_BYTES_BEFORE_COMPRESS) {
    return file;
  }

  // HEIC / unknown: try canvas; browsers that can't decode will throw a clear error
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "menu-photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
