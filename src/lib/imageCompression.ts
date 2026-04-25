/**
 * Client-side image compression using the Canvas API.
 * No external dependency — runs entirely in the browser.
 */

interface CompressOptions {
  maxWidthOrHeight?: number;
  quality?: number;         // 0.0–1.0, default 0.82
  outputType?: "image/jpeg" | "image/webp";
}

/**
 * Compress an image File before upload.
 * Resizes to maxWidthOrHeight (preserving aspect ratio) and re-encodes at `quality`.
 * Returns the original file untouched if it cannot be compressed (SVG, tiny file).
 */
export async function compressImage(
  file: File,
  { maxWidthOrHeight = 1024, quality = 0.82, outputType = "image/jpeg" }: CompressOptions = {}
): Promise<File> {
  // Skip non-raster images (SVG can't be drawn on canvas)
  if (file.type === "image/svg+xml") return file;
  // Skip tiny files — compression overhead not worth it
  if (file.size < 50 * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { width, height } = img;
      const scale = Math.min(1, maxWidthOrHeight / Math.max(width, height));
      const targetW = Math.round(width * scale);
      const targetH = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, targetW, targetH);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            // Compression made it larger — keep original
            resolve(file);
            return;
          }
          const ext = outputType === "image/webp" ? "webp" : "jpg";
          const compressedName = file.name.replace(/\.[^.]+$/, `.${ext}`);
          resolve(new File([blob], compressedName, { type: outputType }));
        },
        outputType,
        quality
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
