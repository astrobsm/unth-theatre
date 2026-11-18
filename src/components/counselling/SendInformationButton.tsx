'use client';

// ============================================================
// "Send information" — under the patient's name on the surgery list
// ------------------------------------------------------------
// Placed there deliberately, and where it was asked for: the patient column
// is the cell somebody reads when they are thinking about the person rather
// than the list, and sending them their information sheet is a thing you do
// to a person.
//
// ONE PRESS SENDS IT. No dialog asking "are you sure", because the act is not
// dangerous — it sends an approved template carrying a personal link, and the
// link can be withdrawn. What IS shown is the result, in words: sent, or the
// reason it could not be.
//
// THE REFUSALS ARE SPOKEN RATHER THAN GREYED OUT. "No phone number on file"
// and "this patient asked not to be written to on WhatsApp" are both things
// somebody can act on — the first by adding a number, the second by printing
// the sheet — and a disabled button with a tooltip tells them neither.
// ============================================================

import { useCallback, useState } from 'react';
import { Check, Copy, FileText, Loader2, Send } from 'lucide-react';

interface Props {
  surgeryId: string;
  /** Shown in the confirmation, so the sender knows who it went to. */
  patientName?: string | null;
  className?: string;
}

type State =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'sent'; link: string }
  | { kind: 'prepared'; link: string; warning: string }
  | { kind: 'failed'; message: string };

export default function SendInformationButton({ surgeryId, patientName, className }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);

  const issue = useCallback(async (channel: 'WHATSAPP' | 'PRINTED') => {
    setState({ kind: 'working' });
    setCopied(false);
    try {
      const res = await fetch('/api/counselling/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surgeryId, channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: 'failed', message: data?.error ?? 'It could not be sent.' });
        return;
      }
      if (data?.warning) {
        setState({ kind: 'prepared', link: data.link, warning: data.warning });
        return;
      }
      if (channel === 'PRINTED') {
        setState({ kind: 'prepared', link: data.link, warning: 'Open the link to print or save the sheet.' });
        window.open(data.link, '_blank', 'noopener,noreferrer');
        return;
      }
      setState({ kind: 'sent', link: data.link });
    } catch {
      setState({
        kind: 'failed',
        message: 'It could not be sent — you may be offline. Try again when you have signal.',
      });
    }
  }, [surgeryId]);

  const copy = useCallback(async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, []);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => issue('WHATSAPP')}
          disabled={state.kind === 'working'}
          title="Send this patient their operation information on WhatsApp"
          className="inline-flex items-center gap-1 rounded-md border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-800 hover:bg-green-100 disabled:opacity-50"
        >
          {state.kind === 'working'
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Send className="h-3 w-3" />}
          Send information
        </button>
        <button
          type="button"
          onClick={() => issue('PRINTED')}
          disabled={state.kind === 'working'}
          title="Open the sheet to print or hand over"
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <FileText className="h-3 w-3" /> Print
        </button>
      </div>

      {state.kind === 'sent' && (
        <p className="mt-1 text-[11px] font-medium text-green-700">
          Sent{patientName ? ` to ${patientName}` : ''}. They can read it, save it as a PDF and
          bring their questions.
        </p>
      )}

      {state.kind === 'prepared' && (
        <div className="mt-1">
          <p className="text-[11px] text-amber-800">{state.warning}</p>
          <button
            type="button"
            onClick={() => copy(state.link)}
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 underline"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Link copied' : 'Copy the link'}
          </button>
        </div>
      )}

      {state.kind === 'failed' && (
        <p className="mt-1 text-[11px] text-red-700">{state.message}</p>
      )}
    </div>
  );
}
