/**
 * Shrink a picked image to a small square JPEG data URL so it can live in the
 * database. ~320px is plenty for a leaf portrait and lands around 15–25 KB.
 */
export async function shrinkPhoto(file: File, size = 320): Promise<string> {
  const source = await loadImage(file);
  const w = source.width;
  const h = source.height;
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  if ('close' in source) source.close();

  let quality = 0.82;
  let url = canvas.toDataURL('image/jpeg', quality);
  // Stay well under the API's limit even for noisy photos.
  while (url.length > 120_000 && quality > 0.4) {
    quality -= 0.1;
    url = canvas.toDataURL('image/jpeg', quality);
  }
  return url;
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // Honours EXIF rotation from phone cameras.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not read image'));
    };
    img.src = url;
  });
}
