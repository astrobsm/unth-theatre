/**
 * The browser half of consent compression. The rules live in
 * ./consentCompression; this is the part that touches a canvas.
 *
 * Kept separate so the rules can be tested without a DOM, and so nothing here
 * is imported on the server.
 */

import {
  COMPRESSION_LADDER,
  FLOOR_REACHED_MESSAGE,
  withinTarget,
  type CompressionStep,
} from './consentCompression';

export interface CompressedFile {
  name: string;
  mimeType: string;
  /** Raw base64, no data: prefix. */
  base64: string;
  /** Bytes of the encoded image, not of the base64 string. */
  size: number;
  /** Null when the original was already small enough. */
  compressedFrom: number | null;
}

/** Decode a File into something canvas can draw. */
async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      // HEIC is the common failure: Safari decodes it, most others do not.
      // The caller turns this into advice rather than a stack trace.
      img.onerror = () => reject(new Error('This image could not be opened in the browser.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draw at the given step and return the encoded JPEG. */
async function renderAt(img: HTMLImageElement, step: CompressionStep): Promise<Blob> {
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > step.maxEdge ? step.maxEdge / longest : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not process the image.');

  // A consent form is dark ink on white paper. Filling white first means any
  // transparency in a PNG becomes page rather than black, which would otherwise
  // render the whole form as white-on-black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('This browser could not process the image.'))),
      'image/jpeg',
      step.quality,
    );
  });
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      resolve(s.includes(',') ? s.split(',').pop() || '' : s);
    };
    reader.onerror = () => reject(new Error('Failed to read the compressed image.'));
    reader.readAsDataURL(blob);
  });

/**
 * Shrink a photographed consent form until it fits.
 *
 * Walks the ladder and stops at the FIRST rung that fits, so a file barely over
 * the limit keeps almost all its quality and only a very large one is reduced
 * hard. If even the last rung is too big, it throws rather than storing an
 * illegible consent — see the note at the top of consentCompression.
 */
export async function compressConsentImage(file: File): Promise<CompressedFile> {
  const img = await loadImage(file);

  let last: Blob | null = null;
  for (const step of COMPRESSION_LADDER) {
    const blob = await renderAt(img, step);
    last = blob;
    if (withinTarget(blob.size)) {
      return {
        // The stored file is a JPEG whatever went in, so the name must say so
        // or it downloads as a .heic that nothing will open.
        name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
        mimeType: 'image/jpeg',
        base64: await blobToBase64(blob),
        size: blob.size,
        compressedFrom: file.size,
      };
    }
  }

  throw new Error(
    `${FLOOR_REACHED_MESSAGE}${last ? ` (smallest achieved: ${Math.round(last.size / 1024)} KB)` : ''}`,
  );
}

/** Read a file that is already small enough, unchanged. */
export async function readFileUnchanged(file: File): Promise<CompressedFile> {
  return {
    name: file.name,
    mimeType: file.type,
    base64: await blobToBase64(file),
    size: file.size,
    compressedFrom: null,
  };
}
