'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { MessageCircle, Send, X, Mic, MicOff, Volume2, Loader2 } from 'lucide-react';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
}

export default function AssistantWidget() {
  const { status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      text:
        "Hi — I'm your Theatre Assistant. I know every part of this app: patients, surgeries, theatres, anaesthesia, prescriptions, blood & lab requests, sub-stores, equipment, transfers/PACU, roster, CSSD, laundry, power, water, oxygen, incidents, mortality, the radio, reports, and admin tasks.\n\nAsk me anything — e.g. \"how do I book an emergency?\", \"how do I do an AM check?\", \"what is the WHO checklist?\", or \"show available theatres\".",
    },
  ]);
  const recRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, open]);

  const speak = (text: string) => {
    if (!voiceOut) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.98;
      synth.speak(u);
    } catch {
      /* noop */
    }
  };

  const send = async (q: string) => {
    if (!q.trim() || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const r = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, contextPath: pathname, channel: listening ? 'VOICE' : 'TEXT' }),
      });
      const data = await r.json();
      const ans = data.answer ?? 'Sorry, I could not produce an answer.';
      setMsgs((m) => [...m, { role: 'assistant', text: ans }]);
      speak(ans);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', text: 'Network error — please try again.' }]);
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (typeof window === 'undefined') return;
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Voice input is not supported in this browser. Please type your question.');
      return;
    }
    if (listening) {
      try { recRef.current?.stop(); } catch {}
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'en-GB';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const t = e.results[0]?.[0]?.transcript ?? '';
      setInput(t);
      setListening(false);
      if (t) send(t);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  if (status !== 'authenticated') return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-5 z-[55] w-14 h-14 rounded-full bg-gradient-to-br from-primary-600 to-secondary-600 text-white shadow-2xl hover:scale-105 transition flex items-center justify-center"
          title="Theatre assistant"
        >
          <MessageCircle className="w-7 h-7" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-20 right-5 z-[55] w-[360px] max-w-[95vw] h-[520px] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="bg-gradient-to-r from-primary-600 to-secondary-600 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <MessageCircle className="w-5 h-5" /> Theatre Assistant
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVoiceOut((v) => !v)}
                className={`p-1 rounded ${voiceOut ? 'bg-white/20' : 'opacity-50'}`}
                title={voiceOut ? 'Voice on' : 'Voice off'}
              >
                <Volume2 className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/20" title="Close assistant" aria-label="Close assistant">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'ml-auto bg-primary-600 text-white rounded-br-sm'
                    : 'mr-auto bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="mr-auto flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-3 h-3 animate-spin" /> thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="p-2 border-t bg-white flex items-center gap-2"
          >
            <button
              type="button"
              onClick={toggleMic}
              className={`p-2 rounded-full ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              title={listening ? 'Stop listening' : 'Voice input'}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask… e.g. how do I report a delay?"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary-500 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="p-2 rounded-full bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              title="Send"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
