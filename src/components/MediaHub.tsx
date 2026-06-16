'use client';

/**
 * MediaHub — a single collapsible launcher that unifies the Theatre Radio and
 * Background Music widgets.
 *
 * UX flow:
 *   1. Collapsed: one combined floating icon (radio + music overlapped).
 *   2. Tap it → it SPLITS into two icons (Radio / Music).
 *   3. Tap one → that widget ENLARGES (its full panel renders).
 *   4. After the action / a short idle period it AUTO-COLLAPSES back to the
 *      single combined icon.
 *
 * The two player components consume this context to decide when to render
 * their full panels; the launcher below renders the combined + split icons.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Radio, Music, X } from 'lucide-react';

type Mode = 'hub' | 'split' | 'radio' | 'music';

interface MediaHubCtx {
  mode: Mode;
  openRadio: () => void;
  openMusic: () => void;
  split: () => void;
  collapse: () => void;
  /** True while the radio has an emergency / acknowledgement-required alert. */
  radioAlert: boolean;
  setRadioAlert: (v: boolean) => void;
  /** True while background music is actively playing. */
  musicActive: boolean;
  setMusicActive: (v: boolean) => void;
}

const Ctx = createContext<MediaHubCtx | null>(null);

export function useMediaHub(): MediaHubCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useMediaHub must be used within a MediaHubProvider');
  return c;
}

export function MediaHubProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('hub');
  const [radioAlert, setRadioAlert] = useState(false);
  const [musicActive, setMusicActive] = useState(false);

  const openRadio = useCallback(() => setMode('radio'), []);
  const openMusic = useCallback(() => setMode('music'), []);
  const split = useCallback(() => setMode('split'), []);
  const collapse = useCallback(() => setMode('hub'), []);

  // An emergency / acknowledgement alert auto-enlarges the radio so the
  // clinician never has to hunt for it.
  useEffect(() => {
    if (radioAlert) setMode('radio');
  }, [radioAlert]);

  return (
    <Ctx.Provider
      value={{ mode, openRadio, openMusic, split, collapse, radioAlert, setRadioAlert, musicActive, setMusicActive }}
    >
      {children}
    </Ctx.Provider>
  );
}

/**
 * The floating combined launcher. Renders the single combined icon (hub) and
 * the two split icons; hides itself entirely while a player panel is enlarged.
 */
export function MediaHubLauncher() {
  const { mode, openRadio, openMusic, split, collapse, radioAlert, musicActive } = useMediaHub();
  const splitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If the user splits but doesn't pick a widget, fold back to the combined
  // icon after a few seconds so the screen stays uncluttered.
  useEffect(() => {
    if (mode !== 'split') {
      if (splitTimerRef.current) { clearTimeout(splitTimerRef.current); splitTimerRef.current = null; }
      return;
    }
    splitTimerRef.current = setTimeout(() => collapse(), 5000);
    return () => {
      if (splitTimerRef.current) { clearTimeout(splitTimerRef.current); splitTimerRef.current = null; }
    };
  }, [mode, collapse]);

  // While a panel is enlarged the launcher steps aside.
  if (mode === 'radio' || mode === 'music') return null;

  return (
    <div className="fixed bottom-4 right-4 z-[10004] print:hidden flex items-center gap-2">
      {mode === 'split' ? (
        <>
          <button
            type="button"
            onClick={openMusic}
            title="Open background music"
            aria-label="Open background music"
            className={`w-12 h-12 rounded-full shadow-2xl border-2 flex items-center justify-center bg-white hover:scale-105 transition-transform ${
              musicActive ? 'border-green-500 text-green-600' : 'border-gray-300 text-gray-600'
            }`}
          >
            <Music className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={openRadio}
            title="Open theatre radio"
            aria-label="Open theatre radio"
            className={`w-12 h-12 rounded-full shadow-2xl border-2 flex items-center justify-center text-white hover:scale-105 transition-transform ${
              radioAlert ? 'bg-red-600 border-red-800 animate-pulse' : 'bg-slate-800 border-primary-600'
            }`}
          >
            <Radio className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={collapse}
            title="Collapse"
            aria-label="Collapse media controls"
            className="w-9 h-9 rounded-full shadow-lg border border-gray-300 bg-white text-gray-500 flex items-center justify-center hover:bg-gray-50"
          >
            <X className="w-4 h-4" />
          </button>
        </>
      ) : (
        // Combined collapsed icon — radio with a small music badge.
        <button
          type="button"
          onClick={split}
          title="Media controls — tap to choose Radio or Music"
          aria-label="Open media controls"
          className={`relative w-14 h-14 rounded-full shadow-2xl border-2 flex items-center justify-center text-white transition-transform hover:scale-105 ${
            radioAlert
              ? 'bg-red-600 border-red-800 animate-pulse'
              : 'bg-gradient-to-br from-slate-800 to-slate-900 border-primary-600'
          }`}
        >
          <Radio className="w-6 h-6" />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center ${
              musicActive ? 'bg-green-500' : 'bg-primary-600'
            }`}
          >
            <Music className="w-3 h-3 text-white" />
          </span>
        </button>
      )}
    </div>
  );
}
