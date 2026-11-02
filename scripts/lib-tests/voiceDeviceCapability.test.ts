import { describe, it, expect } from 'vitest';
import {
  isMemoryCappedWebkit,
  mayAutoLoadVoiceModel,
  KIOSK_OVERRIDE_KEY,
} from '../../src/lib/voice/deviceCapability';

// Real user-agent strings. The whole point of this gate is which device is in
// somebody's hand, so testing it against invented strings would prove nothing.
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneInApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS]',
  ipadOS:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  mac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  android:
    'Mozilla/5.0 (Linux; Android 12; TECNO KG5j) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

describe('which devices are memory-capped WebKit', () => {
  it('knows an iPhone, whatever browser badge it wears', () => {
    expect(isMemoryCappedWebkit(UA.iphoneSafari, true)).toBe(true);
    // Chrome on iOS is WebKit with a different logo. The engine is the limit.
    expect(isMemoryCappedWebkit(UA.iphoneChrome, true)).toBe(true);
    // An in-app browser gets LESS memory, not more. This is the one in the
    // report — note the "Done" button, not a tab.
    expect(isMemoryCappedWebkit(UA.iphoneInApp, true)).toBe(true);
  });

  it('sees through the desktop user agent iPadOS sends', () => {
    // iPadOS 13+ claims to be a Mac. Touch is what gives it away.
    expect(isMemoryCappedWebkit(UA.ipadOS, true)).toBe(true);
  });

  it('does not mistake a real Mac for an iPad', () => {
    expect(isMemoryCappedWebkit(UA.mac, false)).toBe(false);
  });

  it('leaves Android and Windows alone', () => {
    expect(isMemoryCappedWebkit(UA.android, true)).toBe(false);
    expect(isMemoryCappedWebkit(UA.windows, false)).toBe(false);
  });

  it('treats a missing user agent as not-an-iPhone rather than guessing', () => {
    expect(isMemoryCappedWebkit(null, false)).toBe(false);
    expect(isMemoryCappedWebkit(undefined, true)).toBe(false);
  });
});

describe('whether the voice model may be downloaded automatically', () => {
  it('refuses every iPhone, even though it reports nothing wrong', () => {
    // THE BUG THIS FILE EXISTS FOR. navigator.deviceMemory and
    // navigator.connection are Chromium-only, so on an iPhone every reading
    // below is absent -- and the old gate, built only from those readings,
    // therefore let 86 MB of ONNX weights into the tab least able to hold
    // them. The page was killed by WebKit and Safari said "A problem
    // repeatedly occurred".
    expect(
      mayAutoLoadVoiceModel({
        userAgent: UA.iphoneSafari,
        hasTouch: true,
        saveData: undefined,
        effectiveType: undefined,
        deviceMemoryGb: undefined,
      }),
    ).toBe(false);
  });

  it('still allows the mid-range Android the staff actually carry', () => {
    // The gate used to refuse anything under 4 GB, which was most handsets in
    // this hospital. That is not the mistake being corrected here, and it
    // must not come back.
    expect(
      mayAutoLoadVoiceModel({
        userAgent: UA.android,
        hasTouch: true,
        deviceMemoryGb: 3,
        effectiveType: '4g',
      }),
    ).toBe(true);
  });

  it('respects data saver and a 2g link', () => {
    expect(mayAutoLoadVoiceModel({ userAgent: UA.android, saveData: true })).toBe(false);
    expect(mayAutoLoadVoiceModel({ userAgent: UA.android, effectiveType: '2g' })).toBe(false);
    expect(mayAutoLoadVoiceModel({ userAgent: UA.android, effectiveType: 'slow-2g' })).toBe(false);
    // "3g" contains "2g" nowhere, but the guard is written defensively; a 3g
    // link is a perfectly good one for an 86 MB download in the background.
    expect(mayAutoLoadVoiceModel({ userAgent: UA.android, effectiveType: '3g' })).toBe(true);
  });

  it('refuses a genuinely tiny device', () => {
    expect(mayAutoLoadVoiceModel({ userAgent: UA.android, deviceMemoryGb: 1 })).toBe(false);
  });

  it('lets a corridor iPad opt back in, and nothing else', () => {
    // A kiosk has one job and can spend its memory on the voice.
    expect(
      mayAutoLoadVoiceModel({ userAgent: UA.ipadOS, hasTouch: true, forced: true }),
    ).toBe(true);
    // The override is not a licence to ignore a metered link.
    expect(
      mayAutoLoadVoiceModel({ userAgent: UA.ipadOS, hasTouch: true, forced: true, saveData: true }),
    ).toBe(false);
  });

  it('names the override key the installation notes will quote', () => {
    expect(KIOSK_OVERRIDE_KEY).toBe('orm.neuralVoice');
  });
});
