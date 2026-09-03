/**
 * Getting a photographed consent form under the size limit without making it
 * unreadable.
 *
 * A signed consent is a legal record of what a patient agreed to. It is
 * uploaded as a photograph of the paper form, taken on a phone, and a modern
 * phone camera produces 4–12 MB per shot. The form accepted up to 8 MB and sent
 * it as base64 — which inflates by a third — so anything much over 3 MB never
 * reached the server at all: the request was refused by the platform before any
 * code ran, and the anaesthetist saw an upload that simply failed.
 *
 * So the image is shrunk in the browser first.
 *
 * THE FLOOR MATTERS MORE THAN THE CEILING. This is a document somebody may have
 * to read in a coroner's court: the patient's own handwriting, a thumbprint, a
 * witness signature. Compression that hits the size target by making those
 * illegible has destroyed the record while appearing to save it. So the ladder
 * below stops at a floor, and a file that cannot reach the target above that
 * floor is REFUSED with an explanation rather than quietly ruined.
 */

/**
 * The size a stored consent file must come in under.
 *
 * 2.8 MB rather than a round 3 MB deliberately. The file travels base64-encoded
 * inside a JSON body that also carries the form fields and the captured
 * signatures, and base64 costs a third on top. 2.8 MB of image becomes ~3.7 MB
 * of payload, which fits the platform's request limit with room for the rest;
 * a true 3 MB would be ~4 MB and leave almost none.
 */
export const CONSENT_TARGET_BYTES = 2.8 * 1024 * 1024;

/** What a person is told the limit is. */
export const CONSENT_TARGET_LABEL = '3 MB';

/** Nothing larger is even read from disk — see planUpload. */
export const CONSENT_ABSOLUTE_MAX_BYTES = 25 * 1024 * 1024;

export const IMAGE_TYPES = /^image\/(png|jpe?g|webp|heic|heif)$/i;
export const PDF_TYPE = /^application\/pdf$/i;

/** base64 is 4 bytes for every 3, plus padding. */
export const estimateBase64Bytes = (bytes: number): number => Math.ceil(bytes / 3) * 4;

export interface CompressionStep {
  /** Longest edge in pixels after scaling. */
  maxEdge: number;
  /** JPEG quality, 0–1. */
  quality: number;
}

/**
 * Tried in order, first one that fits wins.
 *
 * Quality is given up before resolution. A consent form is text and signatures:
 * halving the pixel count blurs a signature into a smudge, whereas JPEG at 0.6
 * on a full-size scan is still perfectly readable. The last rung — 1500 px on
 * the long edge — is about 180 dpi across an A4 sheet, which is the lowest
 * anyone should be asked to read handwriting from.
 */
export const COMPRESSION_LADDER: CompressionStep[] = [
  { maxEdge: 2600, quality: 0.85 },
  { maxEdge: 2600, quality: 0.7 },
  { maxEdge: 2200, quality: 0.7 },
  { maxEdge: 2200, quality: 0.6 },
  { maxEdge: 1800, quality: 0.6 },
  { maxEdge: 1500, quality: 0.55 },
];

/** The floor. Nothing is stored below this. */
export const LEGIBILITY_FLOOR = COMPRESSION_LADDER[COMPRESSION_LADDER.length - 1];

export type UploadPlan =
  /** Small enough already; store as it is. */
  | { action: 'PASS' }
  /** An image over the limit: shrink it. */
  | { action: 'COMPRESS' }
  /** Cannot be made to fit without ruining it, or is not a consent file. */
  | { action: 'REJECT'; reason: string };

/**
 * What to do with the file the anaesthetist just chose.
 *
 * A PDF is passed through or refused, never recompressed: re-encoding a PDF in
 * the browser rasterises it, which turns selectable text into a picture of
 * text and is a worse record than the one that came in.
 */
export function planUpload(size: number, mimeType: string): UploadPlan {
  if (size > CONSENT_ABSOLUTE_MAX_BYTES) {
    return {
      action: 'REJECT',
      reason: `That file is ${formatBytes(size)}. Even compressed it would be too large — photograph the form again in better light, or use your scanner's smallest setting.`,
    };
  }

  const isImage = IMAGE_TYPES.test(mimeType);
  const isPdf = PDF_TYPE.test(mimeType);

  if (!isImage && !isPdf) {
    return { action: 'REJECT', reason: 'Allowed formats: PDF, PNG, JPG, WEBP, HEIC.' };
  }

  if (size <= CONSENT_TARGET_BYTES) return { action: 'PASS' };

  if (isPdf) {
    return {
      action: 'REJECT',
      reason:
        `This PDF is ${formatBytes(size)} and the limit is ${CONSENT_TARGET_LABEL}. ` +
        'A PDF cannot be shrunk here without turning its text into a picture. ' +
        'Re-export or rescan it at a lower resolution, or photograph the signed form instead.',
    };
  }

  return { action: 'COMPRESS' };
}

/** Did the compression achieve what it needed to? */
export const withinTarget = (bytes: number): boolean => bytes <= CONSENT_TARGET_BYTES;

/** "4.2 MB", "812 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** What the anaesthetist is told after a successful shrink. */
export function compressionSummary(before: number, after: number): string {
  return `Compressed from ${formatBytes(before)} to ${formatBytes(after)} so it can be stored with the case.`;
}

/** The message when even the floor is not small enough. */
export const FLOOR_REACHED_MESSAGE =
  `This photograph will not fit under ${CONSENT_TARGET_LABEL} without being compressed so far that the ` +
  'handwriting and signatures would be hard to read, and a consent form nobody can read is not a consent ' +
  'form. Take the photograph again — closer to the page, and without shadow — or scan it.';
