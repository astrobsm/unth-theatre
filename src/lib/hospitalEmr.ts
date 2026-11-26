// ============================================================
// The hospital EMR, reached from ORM
// ------------------------------------------------------------
// WHY THIS EXISTS. ORM holds what the theatre does with a patient; the
// hospital's EMR holds the rest of that patient's record. Staff were moving
// between the two by typing the address from memory or hunting a bookmark on
// whichever machine they happened to be at, and a mistyped address is exactly
// where a sign-in page that is not the hospital's gets its passwords.
//
// SO THE ADDRESS LIVES HERE, ONCE, and the dashboard shows it. ORM does not
// sign anybody in to the EMR, does not ask for an EMR password and does not
// store one. The button opens the EMR's own sign-in page in a new tab and the
// user signs in there, with the same details they use in clinic.
//
// IT IS CONFIGURABLE BUT NOT BLINDLY. NEXT_PUBLIC_HOSPITAL_EMR_URL overrides
// the default so the address can change without a code release, but the value
// must be a well-formed https URL or it is ignored. An http address would put
// a hospital password on the wire in plain text, and a typo in a deployment
// variable must not be able to point staff at one.
// ============================================================

/** The UNTH EMR, as given by Hospital Management. */
export const DEFAULT_HOSPITAL_EMR_URL = 'https://unth.fastcare.ng/HmisWeb';

export const HOSPITAL_EMR_LABEL = 'Hospital EMR';

/**
 * The address to open, from configuration where it is sound.
 *
 * Anything that is not parseable, or not https, falls back to the default —
 * silently, because a dashboard is not the place to argue with an environment
 * variable, and the default is always a working address.
 */
export function resolveEmrUrl(configured?: string | null): string {
  const raw = String(configured ?? '').trim();
  if (!raw) return DEFAULT_HOSPITAL_EMR_URL;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return DEFAULT_HOSPITAL_EMR_URL;
    if (!u.hostname) return DEFAULT_HOSPITAL_EMR_URL;
    return u.toString().replace(/\/$/, '') || DEFAULT_HOSPITAL_EMR_URL;
  } catch {
    return DEFAULT_HOSPITAL_EMR_URL;
  }
}

/**
 * The host, for showing beside the button.
 *
 * Somebody about to type a hospital password should be able to see where the
 * link goes before they click it, without reading a query string.
 */
export function emrHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** What to do once the EMR opens. Three steps, in the order they happen. */
export const EMR_STEPS: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: 'Sign in with your clinic details',
    detail: 'The same username and password you use for the EMR in clinic. ORM does not see them.',
  },
  {
    title: 'Set your location',
    detail: 'Pick the ward, clinic or theatre you are working from — the EMR shows patients by location.',
  },
  {
    title: 'Open your patients',
    detail: 'Records for that location are then listed, and you can search by name or folder number.',
  },
];

/** Where this device last opened the EMR. A convenience, nothing more. */
export const EMR_LAST_OPENED_KEY = 'orm.hospitalEmr.lastOpenedAt';
