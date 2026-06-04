'use client';

// Public, no-login tutorial viewer reached via short links: /t/<deck-id>
// e.g. https://unth-theatre-mai.vercel.app/t/surgery-booking
// Anyone with the link can view, narrate, fullscreen and download — no sign-in.

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DECKS, getDeck, type DeckSlide, type SlideBg } from '@/lib/presentations';

const themes: Record<SlideBg, { background: string; accent: string; text: string; sub: string }> = {
  navy:    { background: 'linear-gradient(135deg, #001f3f 0%, #003366 50%, #001a2e 100%)', accent: '#87CEEB', text: '#FFFFFF', sub: '#87CEEB' },
  green:   { background: 'linear-gradient(135deg, #006400 0%, #228B22 50%, #004d00 100%)', accent: '#FFFFFF', text: '#FFFFFF', sub: '#90EE90' },
  skyblue: { background: 'linear-gradient(135deg, #4682B4 0%, #87CEEB 50%, #5F9EA0 100%)', accent: '#001f3f', text: '#001f3f', sub: '#003366' },
  maroon:  { background: 'linear-gradient(135deg, #800020 0%, #a52a2a 50%, #5a000f 100%)', accent: '#FFE4B5', text: '#FFFFFF', sub: '#FFE4B5' },
  gold:    { background: 'linear-gradient(135deg, #b8860b 0%, #daa520 50%, #8b6914 100%)', accent: '#001f3f', text: '#001f3f', sub: '#001a2e' },
};

function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    setSupported(true);
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (!voice && list.length) {
        const preferred =
          list.find((v) => /en-GB|en_GB/i.test(v.lang) && /female/i.test(v.name)) ||
          list.find((v) => /en-GB|en_GB/i.test(v.lang)) ||
          list.find((v) => /^en/i.test(v.lang)) ||
          list[0];
        setVoice(preferred);
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { try { window.speechSynthesis.cancel(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = useCallback((text: string) => {
    if (!supported || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.pitch = 1.0;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch { setSpeaking(false); }
  }, [supported, voice]);

  const stop = useCallback(() => {
    if (!supported) return;
    try { window.speechSynthesis.cancel(); } catch {}
    setSpeaking(false);
  }, [supported]);

  return { supported, speaking, speak, stop };
}

async function copyShareLink(id: string, label: string) {
  if (typeof window === 'undefined') return;
  const url = `${window.location.origin}/t/${id}`;
  try {
    await navigator.clipboard.writeText(url);
    alert(`Sharable link copied!\n\n${label}\n${url}\n\nNo login required — anyone can open it.`);
  } catch {
    window.prompt('Copy this sharable tutorial link:', url);
  }
}

function NotFound({ id }: { id: string }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #001f3f 0%, #003366 100%)', color: '#fff', fontFamily: 'Georgia, serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 720, textAlign: 'center' }}>
        <Image src="/logo.png" alt="UNTH" width={72} height={72} style={{ borderRadius: '50%', background: '#fff' }} />
        <h1 style={{ fontSize: 28, marginTop: 16 }}>Tutorial not found</h1>
        <p style={{ color: '#87CEEB', marginTop: 8 }}>No tutorial exists at <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>/t/{id}</code></p>
        <div style={{ marginTop: 24, padding: 20, background: 'rgba(135,206,235,0.08)', border: '1px solid rgba(135,206,235,0.3)', borderRadius: 12, textAlign: 'left' }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#87CEEB' }}>Available tutorials:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {DECKS.filter(d => d.id !== 'vision').map(d => (
              <Link key={d.id} href={`/t/${d.id}`} style={{ color: '#fff', background: 'rgba(255,255,255,0.06)', padding: '8px 12px', borderRadius: 8, textDecoration: 'none', fontSize: 13, border: '1px solid rgba(135,206,235,0.2)' }}>
                {d.icon} {d.title}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicTutorialPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : (rawId || '');
  const deck = getDeck(id);

  const [current, setCurrent] = useState(0);
  const [anim, setAnim] = useState('morph-in');
  const [full, setFull] = useState(false);
  const [auto, setAuto] = useState(false);
  const [narrate, setNarrate] = useState(false);
  const speech = useSpeech();

  const data = deck?.slides || [];
  const total = data.length;

  useEffect(() => {
    if (!narrate || !data.length) return;
    const s = data[current];
    if (s?.voiceOver) speech.speak(s.voiceOver);
    return () => { speech.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, narrate, total]);

  const goTo = useCallback((n: number) => {
    if (n < 0 || n >= total || n === current) return;
    speech.stop();
    setAnim('morph-out');
    setTimeout(() => { setCurrent(n); setAnim('morph-in'); }, 400);
  }, [current, total, speech]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      if (e.key === 'f') setFull(p => !p);
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [next, prev]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => {
      setCurrent(c => {
        if (c >= total - 1) { setAuto(false); return c; }
        setAnim('morph-out');
        setTimeout(() => { setCurrent(cc => cc + 1); setAnim('morph-in'); }, 400);
        return c;
      });
    }, narrate ? 14000 : 6000);
    return () => clearInterval(t);
  }, [auto, total, narrate]);

  const downloadPdf = useCallback(() => {
    if (!data.length || !deck) return;
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow popups to download the PDF.'); return; }
    const slideHtml = data.map((sl, idx) => {
      const t = themes[sl.bg] || themes.navy;
      const isEdgeSlide = idx === 0 || idx === data.length - 1;
      const bulletsHtml = sl.bullets.length > 0
        ? `<ul style="list-style:none;padding:0;margin:0;columns:${sl.bullets.length > 6 ? 2 : 1};column-gap:40px;">
            ${sl.bullets.map(b => `<li style="font-size:16px;color:${t.text};margin-bottom:10px;padding-left:24px;position:relative;line-height:1.5;break-inside:avoid;">
              <span style="position:absolute;left:0;top:5px;width:12px;height:12px;border-radius:50%;background:${t.accent};opacity:0.8;"></span>${b}
            </li>`).join('')}
          </ul>` : '';
      return `<div style="page-break-after:always;width:100%;height:100vh;box-sizing:border-box;background:${t.background};display:flex;flex-direction:column;justify-content:center;padding:50px 60px;position:relative;font-family:Georgia,serif;overflow:hidden;">
        <div style="position:absolute;bottom:20px;left:30px;display:flex;align-items:center;gap:8px;opacity:0.7;">
          <img src="${window.location.origin}/logo.png" width="28" height="28" style="object-fit:contain;border-radius:50%;" />
          <span style="font-size:11px;color:${t.text};">UNTH Theatre — ${deck.title}</span>
        </div>
        <div style="position:absolute;bottom:20px;right:30px;font-size:13px;color:${t.text};opacity:0.6;">${idx + 1} / ${data.length}</div>
        <h1 style="font-size:${isEdgeSlide ? 40 : 32}px;color:${t.text};margin:0 0 8px;line-height:1.2;white-space:pre-line;text-align:${isEdgeSlide ? 'center' : 'left'};">${sl.title}</h1>
        <p style="font-size:18px;color:${t.sub};margin:0 0 24px;line-height:1.4;white-space:pre-line;text-align:${isEdgeSlide ? 'center' : 'left'};">${sl.subtitle}</p>
        ${bulletsHtml}
      </div>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>${deck.title}</title>
      <style>@page{size:landscape;margin:0;}*{margin:0;padding:0;}body{margin:0;padding:0;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>
    </head><body>${slideHtml}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
  }, [data, deck]);

  if (!deck) return <NotFound id={id} />;
  if (!data.length) return null;

  const s: DeckSlide = data[current];
  const th = themes[s.bg] || themes.navy;
  const isEdge = current === 0 || current === total - 1;

  return (
    <>
      <style>{`
        @keyframes morphIn { 0%{opacity:0;transform:scale(.92) translateY(30px);filter:blur(4px)} 100%{opacity:1;transform:scale(1) translateY(0);filter:blur(0)} }
        @keyframes morphOut { 0%{opacity:1;transform:scale(1) translateY(0);filter:blur(0)} 100%{opacity:0;transform:scale(1.05) translateY(-20px);filter:blur(4px)} }
        @keyframes bulletIn { 0%{opacity:0;transform:translateX(-30px)} 100%{opacity:1;transform:translateX(0)} }
        @keyframes pulseRing { 0%{box-shadow:0 0 0 0 rgba(135,206,235,0.6)} 70%{box-shadow:0 0 0 12px rgba(135,206,235,0)} 100%{box-shadow:0 0 0 0 rgba(135,206,235,0)} }
        .morph-in{animation:morphIn .5s ease-out forwards}
        .morph-out{animation:morphOut .4s ease-in forwards}
        .blt{animation:bulletIn .5s ease-out forwards;opacity:0}
        .speaking{animation:pulseRing 1.5s infinite}
        html,body{margin:0;padding:0;background:#001f3f;}
      `}</style>

      <div style={{ position: full ? 'fixed' : 'relative', inset: full ? 0 : undefined, zIndex: full ? 9998 : 1, width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Georgia, serif', overflow: 'hidden' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#001f3f', padding: '8px 16px', color: '#fff', flexShrink: 0, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Image src="/logo.png" alt="Logo" width={28} height={28} style={{ objectFit: 'contain' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{deck.title}</div>
              <div style={{ fontSize: 11, color: '#87CEEB', opacity: 0.85 }}>UNTH Theatre Tutorial · Public Link</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {speech.supported && (
              <button onClick={() => { const on = !narrate; setNarrate(on); if (on) { const t = data[current]?.voiceOver; if (t) speech.speak(t); } else { speech.stop(); } }} className={narrate && speech.speaking ? 'speaking' : ''} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #87CEEB', background: narrate ? '#87CEEB' : 'transparent', color: narrate ? '#001f3f' : '#87CEEB', cursor: 'pointer', fontFamily: 'Georgia, serif', fontWeight: narrate ? 'bold' : 'normal' }}>{narrate ? (speech.speaking ? '🔊 Speaking…' : '🔊 Narration ON') : '🔇 Narrate'}</button>
            )}
            <button onClick={() => copyShareLink(id, deck.title)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #87CEEB', background: 'transparent', color: '#87CEEB', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>🔗 Share</button>
            <button onClick={downloadPdf} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #87CEEB', background: '#87CEEB', color: '#001f3f', cursor: 'pointer', fontFamily: 'Georgia, serif', fontWeight: 'bold' }}>📥 PDF</button>
            <button onClick={() => setAuto(!auto)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #87CEEB', background: auto ? '#87CEEB' : 'transparent', color: auto ? '#001f3f' : '#87CEEB', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>{auto ? 'Pause' : 'Auto'}</button>
            <button onClick={() => setFull(!full)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #87CEEB', background: 'transparent', color: '#87CEEB', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>{full ? 'Exit' : 'Fullscreen'}</button>
          </div>
        </div>

        <div className={anim} style={{ flex: 1, background: th.background, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 60px', position: 'relative', overflow: 'auto' }}>
          <div style={{ position: 'absolute', top: 20, right: 30, opacity: 0.15 }}>
            <Image src="/logo.png" alt="" width={120} height={120} style={{ objectFit: 'contain' }} />
          </div>
          <div style={{ position: 'absolute', bottom: 20, left: 30, display: 'flex', alignItems: 'center', gap: 10, opacity: 0.7 }}>
            <Image src="/logo.png" alt="" width={36} height={36} style={{ objectFit: 'contain', borderRadius: '50%' }} />
            <span style={{ fontSize: 12, color: th.text }}>UNTH Theatre — {deck.title}</span>
          </div>
          <div style={{ position: 'absolute', bottom: 20, right: 30, fontSize: 14, color: th.text, opacity: 0.6 }}>{current + 1} / {total}</div>

          <h1 style={{ fontSize: isEdge ? 48 : 38, color: th.text, marginBottom: 8, lineHeight: 1.2, whiteSpace: 'pre-line', textAlign: isEdge ? 'center' : 'left' }}>{s.title}</h1>
          <p style={{ fontSize: 22, color: th.sub, marginBottom: 30, lineHeight: 1.4, whiteSpace: 'pre-line', textAlign: isEdge ? 'center' : 'left' }}>{s.subtitle}</p>

          {s.bullets.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, columns: s.bullets.length > 6 ? 2 : 1, columnGap: 40 }}>
              {s.bullets.map((b, i) => (
                <li key={`${current}-${i}`} className="blt" style={{ fontSize: 20, color: th.text, marginBottom: 14, paddingLeft: 28, position: 'relative', lineHeight: 1.5, animationDelay: `${i * 0.1}s`, breakInside: 'avoid' as const }}>
                  <span style={{ position: 'absolute', left: 0, top: 4, width: 14, height: 14, borderRadius: '50%', background: th.accent, opacity: 0.8 }} />
                  {b}
                </li>
              ))}
            </ul>
          )}

          {narrate && speech.speaking && (
            <div style={{ position: 'absolute', top: 16, left: 30, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.3)', padding: '6px 12px', borderRadius: 20 }}>
              <span style={{ fontSize: 16 }}>🔊</span>
              <span style={{ color: th.text, fontSize: 12 }}>Narrating…</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#001f3f', padding: '10px 20px', flexShrink: 0 }}>
          <button onClick={prev} disabled={current === 0} style={{ fontSize: 16, padding: '8px 24px', borderRadius: 8, border: 'none', background: current === 0 ? '#334455' : '#228B22', color: '#fff', cursor: current === 0 ? 'default' : 'pointer', opacity: current === 0 ? 0.5 : 1, fontFamily: 'Georgia, serif' }}>Previous</button>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {data.map((_, i) => (
              <button key={i} onClick={() => goTo(i)} style={{ width: i === current ? 28 : 12, height: 12, borderRadius: 6, border: 'none', background: i === current ? '#87CEEB' : 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'all 0.3s' }} />
            ))}
          </div>
          <button onClick={next} disabled={current === total - 1} style={{ fontSize: 16, padding: '8px 24px', borderRadius: 8, border: 'none', background: current === total - 1 ? '#334455' : '#228B22', color: '#fff', cursor: current === total - 1 ? 'default' : 'pointer', opacity: current === total - 1 ? 0.5 : 1, fontFamily: 'Georgia, serif' }}>Next</button>
        </div>
      </div>
    </>
  );
}
