'use client';

/**
 * The "install on this computer" button for the downloads page.
 *
 * Separate from InstallAppButton, which is the floating dock prompt: that one
 * hides itself when it has been dismissed, when the native event has not
 * fired, and for three days after a refusal. All sensible for something that
 * appears over the dashboard uninvited. All wrong here, on a page somebody
 * navigated to specifically in order to install the thing — it must never be
 * absent, and it must never say nothing.
 *
 * WHY THERE IS NO .EXE TO DOWNLOAD, since that is what people come here
 * looking for: an unsigned Windows installer triggers SmartScreen's "Windows
 * protected your PC", which is the same loss of confidence as Android's
 * unknown-sources warning and costs a few hundred dollars a year in code
 * signing to remove. Installing from the browser raises no warning at all.
 * The absence of a file is the feature; the page just has to say so without
 * sounding like an excuse.
 *
 * Three states, because the browser decides which one applies:
 *   installed  — already done, say so rather than offering it again
 *   ready      — Chrome/Edge fired beforeinstallprompt; one click does it
 *   manual     — Firefox, Safari, or the event has not fired; show the steps
 */

import { useEffect, useState } from 'react';
import { Download, Check } from 'lucide-react';
import { setupInstallPrompt, promptInstall, isPWAInstalled } from '@/lib/pwa';

type State = 'manual' | 'ready' | 'installed';

export default function DesktopInstallButton() {
  const [state, setState] = useState<State>('manual');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isPWAInstalled()) {
      setState('installed');
      return;
    }
    // Fires only on browsers that support it, and only once the page is
    // judged installable. Until then the manual steps stand.
    const teardown = setupInstallPrompt(() => setState('ready'));
    return teardown;
  }, []);

  const install = async () => {
    setBusy(true);
    const accepted = await promptInstall();
    setBusy(false);
    if (accepted) setState('installed');
    // A refusal leaves the button exactly as it was, so changing their mind
    // costs one more click rather than a page reload.
  };

  if (state === 'installed') {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#E4F2EE] p-4 font-medium text-[#15323B]">
        <Check className="h-5 w-5 shrink-0 text-[#0F7A6C]" />
        This computer already has the app installed. Look for <b>ORM - UNTH</b> in your
        Start menu or Applications folder.
      </p>
    );
  }

  if (state === 'ready') {
    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => void install()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0F7A6C] px-6 py-3 text-lg font-semibold text-white hover:bg-[#0C6558] disabled:opacity-60"
        >
          <Download className="h-5 w-5" />
          {busy ? 'Installing…' : 'Install on this computer'}
        </button>
        <p className="mt-2 text-sm text-[#3D5A63]">
          Takes about five seconds. No security warning, and nothing to download.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl bg-[#F0F4F3] p-4">
      <p className="text-sm font-medium text-[#15323B]">
        This browser does not offer one-click install. It takes three steps instead:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[#3D5A63]">
        <li>
          Open <b>unth-theatre.link</b> in <b>Microsoft Edge</b> or <b>Google Chrome</b>.
        </li>
        <li>
          Look at the right-hand end of the address bar for a small <b>install icon</b> — a
          screen with a downward arrow.
        </li>
        <li>
          Click it, then <b>Install</b>. If it is not there, open the browser menu
          (<b>⋯</b>) and choose <b>Apps → Install this site as an app</b>.
        </li>
      </ol>
    </div>
  );
}
