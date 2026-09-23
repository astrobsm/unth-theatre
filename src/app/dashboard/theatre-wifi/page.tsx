'use client';

// ============================================================
// Getting onto the theatre Wi-Fi
// ------------------------------------------------------------
// The whole point is that nobody types a password. A camera reads the code and
// the phone joins — which is what removes the frustration, because the password
// is sixteen characters that get transposed, read aloud across a theatre, and
// entered wrongly three times before somebody gives up.
//
// WHY THIS IS BEHIND A SIGN-IN. The code contains the hospital's network
// password. The captive portal is served to anybody within range and, in the
// cloud, to the whole internet — putting it there would publish it. So it lives
// here, for staff already signed in, and on the printed sheet below, which goes
// on a wall inside the theatre where being in the room is the credential.
//
// AND THERE IS A PRINT BUTTON, which is not an afterthought. The people who
// need this most are the ones who cannot get online to read it.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Check, ClipboardCopy, Printer, Wifi,
} from 'lucide-react';
import {
  STEPS_FOR_NETWORK, COMMON_FAILURE, PRIMARY_SSID, THEATRE_SSIDS,
  WIFI_SECURITY, NETWORK_IS_OPEN, wifiQrPayload,
} from '@/lib/hotspot/wifi';

/**
 * The network password.
 *
 * Held in the client bundle deliberately: the QR has to be drawn on a phone
 * that may have no connection at all, which is the entire situation this
 * addresses. The page is behind a sign-in, which is where the protection sits.
 */
const WIFI_PASSWORD = '93934015';

export default function TheatreWifiPage() {
  const [copied, setCopied] = useState(false);
  const [ssid, setSsid] = useState<string>(PRIMARY_SSID);
  const [qr, setQr] = useState<string>('');
  const [qrError, setQrError] = useState<string | null>(null);

  const payload = wifiQrPayload({ ssid, password: WIFI_PASSWORD, security: WIFI_SECURITY });

  const draw = useCallback(async () => {
    try {
      // Loaded on demand so the QR library is not in every other page's bundle.
      const QR = (await import('qrcode')).default;
      const url = await QR.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: { dark: '#111827', light: '#ffffff' },
      });
      setQr(url);
      setQrError(null);
    } catch {
      // Said plainly. A blank square where a code should be teaches people the
      // whole page is broken.
      setQrError('The code could not be drawn on this device. The password below still works.');
    }
  }, [payload]);

  useEffect(() => { void draw(); }, [draw]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(WIFI_PASSWORD);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      /* a clipboard refusal is not worth an error box; the password is on screen */
    }
  };

  return (
    <div className="space-y-6">
      <style jsx global>{`
        @media print {
          /* The sheet that goes on the wall: the code, the name, the steps.
             Everything else on the screen is for the person holding a phone. */
          body * { visibility: hidden; }
          #wifi-poster, #wifi-poster * { visibility: visible; }
          #wifi-poster {
            position: absolute; left: 0; top: 0; width: 100%;
            padding: 24px; border: none;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Wifi className="h-6 w-6 text-blue-600" /> Theatre Wi-Fi
        </h1>
        <p className="text-gray-600">
          Point a camera at the code and the phone joins. Nobody types the password.
        </p>
      </div>

      {/* ── The poster ── */}
      <div id="wifi-poster" className="rounded-2xl border-2 border-gray-300 bg-white p-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900">Theatre Wi-Fi — scan to join</h2>
          <p className="mt-1 text-sm text-gray-600">
            Open the camera. Point it at the code. Tap the banner that appears.
          </p>
        </div>

        <div className="mt-4 flex flex-col items-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`Wi-Fi join code for ${ssid}`} width={280} height={280} />
          ) : (
            <div className="flex h-[280px] w-[280px] items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-500">
              {qrError ?? 'Drawing the code…'}
            </div>
          )}

          <p className="mt-3 text-center">
            <span className="block text-xs uppercase tracking-wide text-gray-500">Network</span>
            <span className="block text-lg font-bold text-gray-900">{ssid}</span>
            <span className="block text-xs text-gray-500">
              The same network everywhere in the theatre complex
            </span>
          </p>
          {NETWORK_IS_OPEN ? (
            <p className="mt-2 text-center text-sm font-semibold text-green-800">
              No network password. Tap the name and it joins.
            </p>
          ) : (
            <p className="mt-1 text-center">
              <span className="block text-xs uppercase tracking-wide text-gray-500">
                Password, if you must type it
              </span>
              <span className="block font-mono text-lg font-bold tracking-widest text-gray-900">
                {WIFI_PASSWORD}
              </span>
            </p>
          )}
        </div>

        <ol className="mx-auto mt-5 max-w-xl space-y-2">
          {STEPS_FOR_NETWORK.map((s, i) => (
            <li key={s.step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span>
                <span className="block font-semibold text-gray-900">{s.step}</span>
                <span className="block text-sm text-gray-600">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mx-auto mt-5 max-w-xl rounded-xl bg-amber-50 p-3">
          <p className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">{COMMON_FAILURE.symptom}.</span>{' '}
              {COMMON_FAILURE.fix}
            </span>
          </p>
        </div>
      </div>

      {/* ── Controls, screen only ── */}
      <div className="no-print space-y-4">
        {THEATRE_SSIDS.length > 1 && (
          <div>
            <p className="mb-1 text-sm font-semibold text-gray-800">
              Which network is on the wall nearest you?
            </p>
            <div className="flex flex-wrap gap-2">
              {THEATRE_SSIDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSsid(s)}
                  className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
                    ssid === s
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Extenders rebroadcasting the same name need no separate code — the phone treats
              them as one network and roams between them on its own.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!NETWORK_IS_OPEN && (
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 ring-1 ring-gray-300 hover:bg-gray-50"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <ClipboardCopy className="h-4 w-4" />}
              {copied ? 'Password copied' : 'Copy the password'}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Printer className="h-4 w-4" /> Print for the theatre wall
          </button>
        </div>

        {/* The honest limitation, stated where somebody would otherwise keep
            looking for a setting that does not exist. */}
        <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <span className="font-semibold">Why the app cannot join the network for you.</span>{' '}
          Joining Wi-Fi happens in the phone&rsquo;s own settings, before any page has loaded, and
          no website on any platform is allowed to put a password there. The code above is the
          nearest thing to it and it is genuinely one tap. Print it and put it where people
          stand — the staff who need it most are the ones who cannot get online to read this.
        </p>

        <p className="text-sm text-gray-600">
          Once you are on the network, signing in opens both the network and the app at the same
          time, and the app moves into your normal browser so it is still there when you come
          back to it.
        </p>
      </div>
    </div>
  );
}
