'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  label: string;
  /** Existing signature (base64 PNG data URL) to show / keep. */
  value?: string | null;
  /** Called with the signature data URL (or null when cleared). */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  heightClass?: string;
}

// A lightweight canvas signature pad — captures a drawn signature as a PNG data
// URL. Works with mouse, touch and stylus via Pointer Events. No dependencies.
//
// THE RULE THIS COMPONENT IS BUILT AROUND: ink that is visible on the canvas
// must already have been handed to the parent. A surgeon at a bedside who has
// signed and is then told "please capture the patient signature" has no way to
// tell what the form wants from them, and consent is the one form that cannot
// be worked around — it gates the whole save.
//
// The original version committed only in the pointerup handler, which meant
// three separate ways to draw a signature the form never received:
//
//   1. pointercancel. On a touchscreen the browser can take a gesture away
//      mid-stroke — palm contact, a scroll it decides to own, an incoming call.
//      It fires pointercancel and NO pointerup ever follows, so the commit
//      never ran and the ink sat on screen belonging to nobody.
//   2. a stale closure. The commit was gated on the `hasInk` state variable
//      read from the render that bound the handler, and a tap or a very short
//      stroke never set it in the first place.
//   3. pointerleave ended the stroke. A hand straying a few pixels outside the
//      box ended the signature permanently — there was no way to resume it
//      short of clearing and starting again.
//
// So now: every terminal event commits, a timer commits mid-stroke in case no
// terminal event ever arrives, and the decision to commit is made from a ref
// that is written the instant ink is laid down.
export default function SignaturePad({
  label,
  value,
  onChange,
  disabled = false,
  heightClass = 'h-36',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Whether anything has been drawn. A REF, not state, because the commit path
  // runs inside pointer handlers and must see the value written microseconds
  // ago by the current stroke rather than the one captured at last render.
  const hasInkRef = useRef<boolean>(!!value);
  // What the parent was last given, so a resize can restore it.
  const committed = useRef<string | null>(value ?? null);
  // Mid-stroke safety commit, in case no terminal event ever arrives.
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // onChange is an inline arrow at every call site, so it is a new function on
  // every parent render. Held in a ref so handlers never need it as a dep.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [hasInk, setHasInk] = useState<boolean>(!!value);

  /**
   * Size the backing store to the element and restore whatever was drawn.
   *
   * Setting canvas.width/height RESETS the context — transform, line width,
   * colour, and every pixel — so this both re-applies the drawing state and
   * paints the previous image back. It bails when the element has no layout
   * yet (a pad inside a section that is still display:none measures 0×0, and
   * committing that would give the form a blank signature) and when the size
   * is already correct, which is what keeps a stray ResizeObserver callback
   * from wiping a half-finished signature.
   */
  const prepare = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return; // not laid out yet
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = Math.floor(rect.width * ratio);
    const h = Math.floor(rect.height * ratio);
    if (canvas.width === w && canvas.height === h) return; // already correct

    const previous =
      hasInkRef.current && canvas.width > 0 && canvas.height > 0
        ? canvas.toDataURL('image/png')
        : committed.current;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.fillStyle = '#111827';
    if (previous) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = previous;
    }
  }, []);

  useEffect(() => {
    prepare();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    // Covers the pad being laid out late, a phone being rotated, and a section
    // that was hidden when the pad mounted becoming visible.
    const ro = new ResizeObserver(() => prepare());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [prepare]);

  // Clear the safety timer if the pad goes away mid-stroke.
  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
  }, []);

  /** Hand the current canvas to the parent. Safe to call repeatedly. */
  const commit = useCallback(() => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current) return;
    if (canvas.width < 1 || canvas.height < 1) return; // never commit a blank
    const url = canvas.toDataURL('image/png');
    committed.current = url;
    onChangeRef.current(url);
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const inked = () => {
    if (!hasInkRef.current) {
      hasInkRef.current = true;
      setHasInk(true);
    }
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    prepare(); // in case this is the first interaction after becoming visible
    const ctx = canvasRef.current?.getContext('2d');
    const p = pos(e);
    drawing.current = true;
    last.current = p;
    // Draw a dot straight away, so a signature that is a tap or a short flick
    // is real ink rather than a stroke that never produced a pointermove.
    if (ctx) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    inked();
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Capture is an optimisation — without it the stroke still works while
      // the pointer stays over the canvas. Never let it break signing.
    }
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    const p = pos(e);
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last.current = p;
    inked();
    // If no terminal event ever arrives, this still gets the ink to the form.
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(commit, 600);
  };

  /**
   * Every way a stroke can end, including the ones that are not a pointerup.
   * Committing here is idempotent, so being called twice for one stroke is
   * harmless — whereas not being called at all loses the signature.
   */
  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    commit();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    drawing.current = false;
    last.current = null;
    hasInkRef.current = false;
    committed.current = null;
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {!disabled && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
          >
            <Eraser className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        // touch-action must be none or the browser claims the gesture as a
        // scroll and cancels the stroke. Set in both places deliberately: the
        // class for consistency with the rest of the styling, the inline style
        // so it survives any stylesheet that fails to load.
        style={{ touchAction: 'none' }}
        className={`w-full ${heightClass} rounded-lg border-2 border-dashed border-gray-300 bg-white touch-none ${disabled ? 'opacity-60' : 'cursor-crosshair'}`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        // The stroke is NOT ended when the pointer leaves the box. Capture keeps
        // the events coming, and ending here used to strand a surgeon whose
        // hand strayed a few pixels outside with a signature they could not
        // finish or resume.
        onPointerCancel={end}
        onLostPointerCapture={end}
      />
      <p className="mt-1 text-xs text-gray-400">
        {hasInk ? 'Signed.' : 'Sign above using a finger, stylus or mouse.'}
      </p>
    </div>
  );
}
