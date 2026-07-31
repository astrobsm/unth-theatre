'use client';

// ============================================================
// Receipt capture
// ------------------------------------------------------------
// Photographing a receipt is done standing at the vendor, on a phone, often
// with no signal. Two consequences shape this component:
//
//   • Images are downscaled IN THE BROWSER before they are held or sent. A
//     modern phone camera produces 4-6 MB per shot; a retirement with fifteen
//     receipts would be ~75 MB queued in IndexedDB on a device that may already
//     be short of space. Downscaling to 1600px costs nothing legible on a
//     receipt and cuts that by roughly 90%.
//   • Files are carried as data URLs, so a receipt captured offline queues with
//     the expenditure and uploads when the network returns.
// ============================================================

import { useRef, useState } from 'react';
import { Camera, X, FileText, Loader2 } from 'lucide-react';

export interface CapturedReceipt {
  /** Local key for list rendering — not the server id. */
  key: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  byteSize: number;
  width?: number;
  height?: number;
}

/** Longest edge, in pixels, after downscaling. Legible for a receipt. */
const MAX_EDGE = 1600;
/** JPEG quality used when re-encoding a downscaled photo. */
const QUALITY = 0.82;
/** Matches the server limit, checked here so the officer is told immediately. */
const MAX_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale a photograph. PDFs and already-small images are returned untouched —
 * re-encoding a PDF would corrupt it, and re-encoding a small image only loses
 * quality.
 */
async function downscale(
  file: File
): Promise<{ dataUrl: string; mimeType: string; byteSize: number; width?: number; height?: number }> {
  const original = await readAsDataUrl(file);

  if (file.type === 'application/pdf' || !file.type.startsWith('image/')) {
    return { dataUrl: original, mimeType: file.type, byteSize: file.size };
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('not an image'));
      el.src = original;
    });

    if (img.width <= MAX_EDGE && img.height <= MAX_EDGE && file.size < 1_500_000) {
      return { dataUrl: original, mimeType: file.type, byteSize: file.size, width: img.width, height: img.height };
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl: original, mimeType: file.type, byteSize: file.size };
    ctx.drawImage(img, 0, 0, width, height);

    const out = canvas.toDataURL('image/jpeg', QUALITY);
    // Base64 carries ~4 bytes per 3 bytes of payload.
    const byteSize = Math.round((out.length - out.indexOf(',') - 1) * 0.75);
    return { dataUrl: out, mimeType: 'image/jpeg', byteSize, width, height };
  } catch {
    // HEIC and similar may not decode in this browser; send the original and
    // let the server decide.
    return { dataUrl: original, mimeType: file.type, byteSize: file.size };
  }
}

export default function ReceiptCapture({
  receipts,
  onChange,
  disabled,
}: {
  receipts: CapturedReceipt[];
  onChange: (next: CapturedReceipt[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const next = [...receipts];

    for (const file of Array.from(files)) {
      try {
        const processed = await downscale(file);
        if (processed.byteSize > MAX_BYTES) {
          setError(
            `${file.name} is ${(processed.byteSize / 1048576).toFixed(1)} MB even after resizing. Retake it at a lower resolution.`
          );
          continue;
        }
        next.push({
          key: `${file.name}-${file.lastModified}-${next.length}`,
          fileName: file.name,
          mimeType: processed.mimeType,
          dataUrl: processed.dataUrl,
          byteSize: processed.byteSize,
          width: processed.width,
          height: processed.height,
        });
      } catch {
        setError(`${file.name} could not be read.`);
      }
    }

    onChange(next);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = (key: string) => onChange(receipts.filter((r) => r.key !== key));

  const total = receipts.reduce((sum, r) => sum + r.byteSize, 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {busy ? 'Processing…' : 'Add receipt'}
        </button>
        {receipts.length > 0 && (
          <span className="text-xs text-gray-500">
            {receipts.length} attached · {(total / 1024).toFixed(0)} KB
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        // On a phone this opens the camera directly, which is where a receipt
        // is actually captured.
        capture="environment"
        multiple
        hidden
        onChange={(e) => add(e.target.files)}
      />

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}

      {receipts.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {receipts.map((r) => (
            <li key={r.key} className="relative">
              {r.mimeType === 'application/pdf' ? (
                <div className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                  <FileText className="h-6 w-6 text-gray-400" />
                  <span className="mt-1 px-1 text-[9px] text-gray-500 line-clamp-1">PDF</span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.dataUrl}
                  alt={r.fileName}
                  className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => remove(r.key)}
                disabled={disabled}
                aria-label={`Remove ${r.fileName}`}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white shadow hover:bg-red-700"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-500">
        Photos are resized on this device before being saved. A receipt captured with no
        network is kept here and uploads with the expenditure when you are back online.
      </p>
    </div>
  );
}
