// ============================================================
// Where staff get the app
// ------------------------------------------------------------
// Deliberately OUTSIDE /dashboard and open without signing in. Somebody
// standing in a corridor being told "install the app" has no app to sign in
// to yet, and a download page behind a login is a circle.
//
// ANDROID IS A FILE. The app is not on Play, so the phone will warn that it
// comes from an unknown source. That warning is correct and people are right
// to hesitate at it, so the page says plainly what it will say and why,
// rather than leaving somebody to decide alone whether to override their
// phone's security advice.
//
// DESKTOP IS NOT A FILE. There is no installer: the site installs itself
// from the browser. Every instinct says to look for a .exe, so the page says
// why there is none and exactly which button to press instead.
// ============================================================

import type { Metadata } from 'next';
import DesktopInstallButton from '@/components/DesktopInstallButton';
import { Smartphone, Monitor, ShieldCheck, Download, CircleHelp } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Install the ORM app — UNTH Theatre',
  description: 'Install the Operative Resource Manager on an Android phone or on a computer.',
};

/** Bumped whenever a new APK is published, so the page never claims a stale one. */
const APK_VERSION = '1.3';
const APK_SIZE = '6.7 MB';
/** The release tag the file hangs off. Keep in step with APK_VERSION. */
const APK_TAG = 'android-v1.3';
/** From `apksigner verify --print-certs`. Lets a cautious person check the file. */
const APK_SHA1 = 'ce:df:98:17:8f:64:f7:3c:18:83:bb:1e:b8:0a:b5:9f:87:6b:0d:18';

export default function DownloadsPage() {
  return (
    <main className="min-h-screen bg-[#F7F9F8] px-5 py-12 text-[#15323B]">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#0F7A6C]">
            UNTH Ituku-Ozalla · Theatre Complex
          </p>
          <h1 className="mt-2 text-4xl font-bold">Install the ORM app</h1>
          <p className="mt-3 text-lg text-[#3D5A63]">
            The Operative Resource Manager, on your phone or your computer. Sign in with the
            account you already use.
          </p>
        </header>

        {/* ── Android ───────────────────────────────────────────────── */}
        <section className="mb-8 rounded-2xl bg-white p-7 ring-1 ring-[#D7E0DE]">
          <div className="flex items-start gap-4">
            <Smartphone className="mt-1 h-8 w-8 shrink-0 text-[#0F7A6C]" />
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-semibold">Android phone or tablet</h2>
              <p className="mt-1 text-[#3D5A63]">
                Version {APK_VERSION} · {APK_SIZE} · Android 6.0 or newer
              </p>

              {/* The hospital's own address, which redirects to the release
                  holding the file — see ./android/route.ts. Staff should not
                  be asked to tap a github.com URL to install a hospital
                  system; an address nobody recognises is where a careful
                  person stops. */}
              <a
                href="/downloads/android"
                download
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0F7A6C] px-6 py-3 text-lg font-semibold text-white hover:bg-[#0C6558]"
              >
                <Download className="h-5 w-5" />
                Download the app
              </a>

              <div className="mt-6 rounded-xl bg-[#FBF0E8] p-5">
                <h3 className="flex items-center gap-2 font-semibold text-[#B4531A]">
                  <ShieldCheck className="h-5 w-5" />
                  Android will ask you twice. Both are normal.
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#7A4420]">
                  This is hospital software, distributed by the hospital rather than
                  through the Play Store. Android cannot tell who wrote it, so it asks you
                  to confirm &mdash; once before installing and sometimes again afterwards.
                  Neither message means anything is wrong with the app, and you are
                  allowing this one file, not turning your protection off.
                </p>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[#7A4420]">
                  <li>Tap <b>Download the app</b> above.</li>
                  <li>Open the downloaded file. Android asks about unknown sources.</li>
                  <li>Tap <b>Settings</b> &rarr; turn on <b>Allow from this source</b> &rarr; go back.</li>
                  <li>Tap <b>Install</b>.</li>
                  <li>
                    If a second box says <b>Unsafe app blocked</b> or offers to scan the
                    app, choose <b>Install anyway</b> or <b>Send for scanning</b>. This is
                    Google Play Protect, and it says this about every app not on the Play
                    Store.
                  </li>
                  <li>Tap <b>Open</b>.</li>
                </ol>
                <p className="mt-3 text-sm text-[#7A4420]">
                  If you would rather not do this yourself, bring your phone to the theatre
                  manager and it will be installed for you.
                </p>
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-[#0F7A6C]">
                  Check you have the real file
                </summary>
                <p className="mt-2 text-sm text-[#3D5A63]">
                  Signed by the hospital. Its certificate fingerprint (SHA-1) is:
                </p>
                <code className="mt-1 block break-all rounded-lg bg-[#F0F4F3] p-3 text-xs">
                  {APK_SHA1}
                </code>
              </details>
            </div>
          </div>
        </section>

        {/* ── Desktop ───────────────────────────────────────────────── */}
        <section className="mb-8 rounded-2xl bg-white p-7 ring-1 ring-[#D7E0DE]">
          <div className="flex items-start gap-4">
            <Monitor className="mt-1 h-8 w-8 shrink-0 text-[#0F7A6C]" />
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-semibold">Computer</h2>
              <p className="mt-1 text-[#3D5A63]">Windows, Mac or Linux</p>

              <p className="mt-4 rounded-xl bg-[#E4F2EE] p-4 text-[#15323B]">
                <b>There is no file to download, and that is deliberate.</b> An installer
                downloaded from the web makes Windows warn you the same way your phone
                does. Installing from the browser raises no warning at all, takes about
                five seconds, and updates itself from then on.
              </p>

              {/* A button rather than three steps, where the browser allows it.
                  "Look for an icon in your address bar" is not an answer to
                  "where is the desktop version" — it is a treasure hunt. */}
              <DesktopInstallButton />

              <p className="mt-4 text-sm text-[#3D5A63]">
                It then opens in its own window with its own icon, like any other program,
                and keeps working when the connection drops.
              </p>

              <p className="mt-4 rounded-xl bg-[#FBF0E8] p-4 text-sm text-[#7A4420]">
                <b>Use Edge where you can.</b> Spoken announcements use the voice installed
                on the computer, and Edge is the one that ships a Nigerian English voice.
                Chrome on Windows usually has none, so announcements are read in whatever
                accent the machine offers.
              </p>
            </div>
          </div>
        </section>

        {/* ── Updates ───────────────────────────────────────────────── */}
        <section className="rounded-2xl bg-[#15323B] p-7 text-[#D4E6E3]">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
            <CircleHelp className="h-5 w-5" />
            You will not have to download this again
          </h2>
          <p className="mt-2 leading-relaxed">
            Both versions update themselves. Changes made to the system appear on your phone
            and your computer without reinstalling anything — the app you install is a window
            onto the live system, not a copy of it.
          </p>
          <p className="mt-3 text-sm text-[#8FA8AE]">
            Trouble installing? Ask the theatre manager, or whoever set up your account.
          </p>
        </section>
      </div>
    </main>
  );
}
