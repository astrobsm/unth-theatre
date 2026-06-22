'use client';

import { useEffect, useRef, useState } from 'react';
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

// A lightweight canvas signature pad — captures a drawn signature as a PNG data URL.
// Works with mouse, touch and stylus via Pointer Events. No external dependencies.
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
  const [hasInk, setHasInk] = useState<boolean>(!!value);

  // Size the canvas to its container (accounting for devicePixelRatio) and
  // restore any existing signature image.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111827';
        if (value) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
          img.src = value;
        }
      }
    };
    resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
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
    if (!hasInk) setHasInk(true);
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas && hasInk) onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
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
        className={`w-full ${heightClass} rounded-lg border-2 border-dashed border-gray-300 bg-white touch-none ${disabled ? 'opacity-60' : 'cursor-crosshair'}`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <p className="mt-1 text-xs text-gray-400">
        {hasInk ? 'Signed.' : 'Sign above using a finger, stylus or mouse.'}
      </p>
    </div>
  );
}
