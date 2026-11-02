// ============================================================
// Which devices may pull the neural voice model down
// ------------------------------------------------------------
// Kokoro is an 82M-parameter ONNX model, about 86 MB on the wire and a good
// deal more once it is resident. On a laptop or a mid-range Android that is a
// download; on an iPhone it is a crash.
//
// Pure, and separate from kokoroTts.ts, so the rule can be tested against the
// user-agent strings of the handsets this hospital actually carries instead
// of being verified by trying it on someone's phone during a list.
// ============================================================

/**
 * True for iPhone and iPad, in ANY browser on them.
 *
 * Every browser on iOS and iPadOS is WebKit underneath — Chrome and Firefox
 * there are skins over the same engine — so this is about the engine, not the
 * brand in the user agent.
 *
 * WHY IT MATTERS. A WebKit tab has a hard memory ceiling, and a page that
 * crosses it is not slowed down, it is KILLED: the web process dies with no
 * error, no console entry, and nothing an error boundary can catch. Safari
 * replaces the page with "A problem repeatedly occurred".
 *
 * Reported from an iPhone on /dashboard/surgeries. The model is fetched two
 * seconds after EVERY page load — the theatre radio is mounted in
 * providers.tsx and is on by default — so the kill repeats on every attempt
 * and on every reload. That is what made it look like one page was broken
 * rather than like a memory limit: the heaviest page is simply the first to
 * cross the line.
 */
export function isMemoryCappedWebkit(
  userAgent: string | null | undefined,
  hasTouch: boolean,
): boolean {
  const ua = userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13 and later report a desktop Safari user agent by default. A
  // "Macintosh" that reports touch is an iPad; no Mac does.
  return /Macintosh/.test(ua) && hasTouch;
}

/**
 * Whether an automatic model download is reasonable on this device.
 *
 * NOTE WHAT AN ABSENT READING MEANS. navigator.deviceMemory and
 * navigator.connection are Chromium-only. On an iPhone both are undefined, so
 * a gate built only from them skips every test and waves the model through on
 * exactly the devices least able to hold it. An absent reading is not a
 * reassuring one, which is why the engine check comes first and does not
 * depend on either.
 *
 * @param forced the kiosk override — see KIOSK_OVERRIDE_KEY.
 */
export function mayAutoLoadVoiceModel(input: {
  userAgent?: string | null;
  hasTouch?: boolean;
  /** navigator.connection?.saveData */
  saveData?: boolean;
  /** navigator.connection?.effectiveType */
  effectiveType?: string | null;
  /** navigator.deviceMemory, in GB. Undefined on every non-Chromium browser. */
  deviceMemoryGb?: number | null;
  forced?: boolean;
}): boolean {
  if (isMemoryCappedWebkit(input.userAgent, !!input.hasTouch) && !input.forced) return false;
  // Data saver on, or a genuinely slow link: the download is not a kindness.
  if (input.saveData) return false;
  const et = input.effectiveType;
  if (typeof et === 'string' && /(^|[^3])2g/.test(et)) return false;
  const mem = input.deviceMemoryGb;
  if (typeof mem === 'number' && mem > 0 && mem < 2) return false;
  return true;
}

/**
 * The escape hatch, set per device:
 *
 *   localStorage.setItem('orm.neuralVoice', 'on')
 *
 * An iPad bolted to the corridor wall as an announcement display has one job
 * and can spend its memory on the voice. Refusing it with no way back would
 * be the same mistake in the other direction.
 *
 * Deliberately not a toggle in the settings screen: on a handset, switching
 * it on is a way to crash your own browser, and nobody should meet it while
 * looking for something else.
 */
export const KIOSK_OVERRIDE_KEY = 'orm.neuralVoice';
