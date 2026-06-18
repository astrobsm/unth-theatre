'use client';

import { useState } from 'react';
import { Headset, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';
import { whatsappChatLink } from '@/lib/whatsapp';

// Consumable Pack Provider customer careline numbers — shown on every dashboard.
const CARELINE_NUMBERS = [
  '08086894420',
  '08187846315',
  '08171254557',
  '08189893738',
];

export default function CarelineBar() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50/80 shadow-sm">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2">
        <Headset className="w-4 h-4 text-primary-600 flex-shrink-0" />
        <span className="text-sm font-semibold text-primary-800">
          Consumable Pack Provider Careline
        </span>
        {/* Quick-call links inline on wider screens */}
        <span className="hidden md:flex items-center gap-2 ml-2 flex-wrap">
          {CARELINE_NUMBERS.map((n) => (
            <a
              key={n}
              href={whatsappChatLink(n) || `tel:${n}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Chat on WhatsApp"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-primary-200 text-primary-700 text-xs font-medium hover:bg-green-50 hover:text-green-700"
            >
              <MessageCircle className="w-3 h-3" /> {n}
            </a>
          ))}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle careline numbers"
          className="ml-auto md:hidden text-primary-600 p-1"
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Collapsible list for small screens */}
      {open && (
        <div className="md:hidden px-3 pb-3 grid grid-cols-2 gap-2">
          {CARELINE_NUMBERS.map((n) => (
            <a
              key={n}
              href={whatsappChatLink(n) || `tel:${n}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Chat on WhatsApp"
              className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-semibold hover:bg-green-100"
            >
              <MessageCircle className="w-4 h-4" /> {n}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
