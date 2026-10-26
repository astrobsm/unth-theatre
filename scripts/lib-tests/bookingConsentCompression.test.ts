import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { planUpload, CONSENT_TARGET_BYTES } from '../../src/lib/consentCompression';

// The booking form read the chosen file WHOLE and posted it base64. It
// accepted up to 10 MB, which arrives as ~13 MB of JSON over theatre wifi
// that has been measured in hundreds of bytes per second — so the upload
// did not finish and the booking was abandoned halfway. That is how a case
// reaches the morning with no consent attached.
//
// The compression policy already existed and was used by the structured
// consent page. These tests exist to keep the BOOKING form using the same
// one, rather than growing a second.

const page = readFileSync(
  join(__dirname, '..', '..', 'src', 'app', 'dashboard', 'surgeries', 'new', 'page.tsx'),
  'utf8',
);

const MB = 1024 * 1024;

describe('the booking form compresses before uploading', () => {
  it('uses the shared policy, not one of its own', () => {
    expect(page).toContain("from '@/lib/consentCompression'");
    expect(page).toContain("from '@/lib/consentCompressionBrowser'");
    expect(page).toContain('planUpload(');
  });

  it('compresses rather than reading the raw file', () => {
    expect(page).toContain('compressConsentImage(file)');
    // The old path read the original straight into base64.
    expect(page).not.toMatch(/reader\.readAsDataURL\(file\)/);
  });

  it('passes an already-small file through untouched', () => {
    expect(page).toContain('readFileUnchanged(file)');
  });

  it('shows that something is happening while it re-encodes', () => {
    // A control that does nothing for two seconds gets pressed again,
    // which on a file input means picking the photograph twice.
    expect(page).toContain('consentCompressing');
    expect(page).toMatch(/Shrinking the photograph/);
  });

  it('reports what it saved', () => {
    expect(page).toContain('compressionSummary(');
  });

  it('keeps the message written for the person holding the phone', () => {
    // compressConsentImage throws advice — take it again, closer, without
    // shadow — which is more use than "upload failed".
    expect(page).toMatch(/err instanceof Error \? err\.message/);
  });
});

describe('the policy still behaves as the booking form needs', () => {
  it('leaves a PDF alone', () => {
    expect(planUpload(9 * MB, 'application/pdf').action).not.toBe('COMPRESS');
  });

  it('compresses a typical phone photograph', () => {
    expect(planUpload(6 * MB, 'image/jpeg').action).toBe('COMPRESS');
  });

  it('handles HEIC, which is what an iPhone actually produces', () => {
    expect(planUpload(5 * MB, 'image/heic').action).toBe('COMPRESS');
  });

  it('aims below the payload size that was failing', () => {
    // Base64 costs a third on top, so the target has to leave room.
    expect(Math.ceil(CONSENT_TARGET_BYTES / 3) * 4).toBeLessThan(4 * MB);
  });
});

describe('either route satisfies the consent requirement', () => {
  // A BUG I INTRODUCED AND THIS CATCHES. Making consent mandatory, I
  // checked only for the photograph — so a ward that signed on screen
  // could not book a case at all, even though the app treats an
  // electronically signed consent as consent everywhere else: the holding
  // area, the pre-operative assessment, the case record.
  it('accepts a consent signed on screen, not only a photograph', () => {
    expect(page).toMatch(/!consentFile && !isConsentSigned\(consentForm\)/);
  });

  it('says so in the blocking dialog', () => {
    const at = page.indexOf("name: 'consentUpload'");
    expect(at).toBeGreaterThan(-1);
    expect(page.slice(at, at + 400)).toMatch(/sign it on screen/i);
  });

  it('offers the on-screen route beside the upload, not three sections below', () => {
    // It was always possible; the only sign of it was a card further down
    // that nobody scrolled to with a camera already in their hand.
    expect(page).toMatch(/Sign the consent on screen/);
    expect(page).toContain('consent-form-section');
  });

  it('stops asking once it has been signed', () => {
    expect(page).toMatch(/Consent signed on screen\. No photograph is needed\./);
  });
});
