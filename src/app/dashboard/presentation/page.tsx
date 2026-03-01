'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

// ── Slide data ──────────────────────────────────────────────────────────
const slides = [
  {
    title: 'UNTH Digital Theatre\nManagement System',
    subtitle: 'Transforming Surgical Theatre Operations Through Technology',
    bullets: [] as string[],
    bg: 'navy',
  },
  {
    title: 'The Problem',
    subtitle: 'Challenges Facing Our Surgical Theatres Today',
    bullets: [
      'Poor coordination among surgeons, anaesthetists, nurses & pharmacy',
      'Inadequate patient preparation leading to surgery cancellations',
      'Delayed patient transfers between wards, holding areas & theatres',
      'No real-time visibility into consumable inventory levels',
      'Untracked pre-anaesthetic reviews causing unsafe surgeries',
      'Patient extortion through unverified billing & charges',
      'No audit trail for accountability & compliance',
      'Slow emergency response due to communication gaps',
    ],
    bg: 'green',
  },
  {
    title: 'Our Solution',
    subtitle: 'An Integrated Digital Platform for End-to-End Theatre Management',
    bullets: [
      'Web-based platform accessible on any device — desktop, tablet, phone',
      'Role-based access for every stakeholder in the surgical workflow',
      'Real-time dashboards, notifications & alerts',
      'Complete digital audit trail from booking to discharge',
      'Offline-capable PWA — works even with poor connectivity',
    ],
    bg: 'skyblue',
  },
  {
    title: '1. Stakeholder Coordination',
    subtitle: 'Eliminating Communication Silos',
    bullets: [
      'Shared surgery schedule visible to all team members in real-time',
      'Automated notifications when surgery is booked, approved or changed',
      'Role-based dashboards — Surgeon, Anaesthetist, Nurse, Pharmacist, Admin',
      'Theatre allocation board showing live room assignments',
      'Emergency team availability tracking with instant mobilization alerts',
      'Digital handoff protocols between wards, holding areas & theatres',
    ],
    bg: 'navy',
  },
  {
    title: '2. Proper Patient Preparation',
    subtitle: 'Ensuring Every Patient Is Fully Ready Before Surgery',
    bullets: [
      'Mandatory pre-operative checklist — labs, consent, imaging, blood',
      'Pre-Op visit form completed digitally by the anaesthetist',
      'ASA classification, airway assessment & risk scoring built in',
      'Surgery cannot proceed until all preparation items are verified',
      'Automated reminders for incomplete preparation items',
      'Digital consent capture with timestamp & provider signature',
    ],
    bg: 'green',
  },
  {
    title: '3. Timely Patient Transfer',
    subtitle: 'Streamlining the Journey From Ward to Theatre',
    bullets: [
      'Holding area module tracks patient arrival & readiness status',
      'Live surgery status board — Waiting, In Holding, In Theatre, Recovery',
      'Surgical timing module records: Anaesthesia Start, Knife-to-Skin, Close, Out',
      'Automated alerts when theatre is ready for the next patient',
      'Transfer delay tracking with accountability timestamps',
      'Recovery room handoff with post-op monitoring integration',
    ],
    bg: 'skyblue',
  },
  {
    title: '4. Consumable Inventory',
    subtitle: 'Real-Time Tracking of Every Surgical Supply',
    bullets: [
      'Central store & sub-store (per-theatre) inventory management',
      'Bill of Materials (BOM) auto-generates supply list per surgery type',
      'Theatre setup requests pull from sub-store with approval workflow',
      'Real-time stock levels with low-stock & expiry alerts',
      'Bulk upload of inventory via Excel/CSV for rapid data entry',
      'Usage tracking per surgery — know exactly what was consumed',
      'Transfer management between stores with full audit trail',
    ],
    bg: 'navy',
  },
  {
    title: '5. Pre-Anaesthetic Review',
    subtitle: 'Prompt, Tracked & Accountable Reviews',
    bullets: [
      'Digital pre-operative assessment form with structured fields',
      'Anaesthetist approval/rejection workflow with prescription capability',
      'When review is rejected, corrective prescriptions are issued immediately',
      'Review status tracked: Pending then Approved or Rejected',
      'Notifications alert the anaesthetist when a review is due',
      'Full history of all reviews linked to patient & surgery record',
      'Prevents surgery from proceeding without anaesthetist sign-off',
    ],
    bg: 'green',
  },
  {
    title: '6. Stop Patient Extortion',
    subtitle: 'Transparent Billing & Verified Charges',
    bullets: [
      'All consumables used are digitally logged against each surgery',
      'Patients see exactly what was used — nothing more, nothing less',
      'Medication tracking: dispensed vs. administered vs. returned to pharmacy',
      'Non-return queries auto-generated when drugs are not accounted for',
      'Instrument & swab counts verified digitally before & after surgery',
      'No room for inflated bills or phantom charges',
      'Complete audit trail accessible to hospital management',
    ],
    bg: 'skyblue',
  },
  {
    title: '7. Real-Time Audit',
    subtitle: 'Every Action Logged, Every Decision Traceable',
    bullets: [
      'Staff effectiveness reports — surgeries performed, durations, outcomes',
      'Theatre utilization dashboards — peak hours, idle time, cancellations',
      'Roster compliance tracking — who was scheduled vs. who showed up',
      'Inventory audit — stock in vs. stock out vs. current balance',
      'Medication reconciliation reports per surgery',
      'Management dashboards with real-time KPIs & charts',
      'Exportable reports for CMD presentations & regulatory compliance',
    ],
    bg: 'navy',
  },
  {
    title: '8. Rapid Emergency Response',
    subtitle: 'When Every Second Counts',
    bullets: [
      'Emergency surgery booking bypasses the 5 PM cutoff restriction',
      'Emergency team availability board — see who is on-call instantly',
      'One-click emergency mobilization alerts via app notifications',
      'Emergency medication requests trigger instant pharmacist alerts',
      'Walkie-talkie integration for critical drug delivery coordination',
      'Pre-configured emergency BOM templates for rapid theatre setup',
      'Priority queue management — emergency cases jump the schedule',
    ],
    bg: 'green',
  },
  {
    title: 'System Modules',
    subtitle: 'A Complete Suite of Integrated Modules',
    bullets: [
      'Surgery Booking & Scheduling — with 5 PM cutoff & emergency override',
      'Theatre Allocation — intelligent room assignment & conflict detection',
      'Staff Roster — duty scheduling with role-based assignments',
      'Inventory & Sub-Stores — central + per-theatre stock management',
      'Pre-Op Assessment — structured forms, checklists & approvals',
      'Intra-Op Tracking — timing, counts, anaesthesia monitoring',
      'Medication Tracking — collection, usage, reconciliation, return',
      'Reports & Analytics — staff effectiveness, utilization, audit',
    ],
    bg: 'skyblue',
  },
  {
    title: 'Value to the Hospital',
    subtitle: 'Measurable Impact on Theatre Efficiency',
    bullets: [
      'Reduce surgery cancellations by ensuring complete patient preparation',
      'Cut turnaround time between surgeries with streamlined transfers',
      'Eliminate stock-outs with proactive inventory management',
      'Prevent revenue leakage through transparent consumable tracking',
      'Improve patient safety with mandatory checklists & reviews',
      'Enable data-driven decisions with real-time analytics',
      'Establish accountability culture with complete audit trails',
      'Faster emergency response — saving lives when minutes matter',
    ],
    bg: 'navy',
  },
  {
    title: 'How to Get Started',
    subtitle: 'Simple Steps to Transform Your Theatre Operations',
    bullets: [
      '1. Log in with your staff code at the secure portal',
      '2. Your role-based dashboard shows exactly what you need',
      '3. Book surgeries, manage inventory, conduct reviews — all in one place',
      '4. Receive real-time notifications for actions requiring your attention',
      '5. Complete checklists and forms digitally — no more paper',
      '6. View reports and analytics from your management dashboard',
      '7. Works on your phone, tablet, or desktop — anywhere, anytime',
    ],
    bg: 'green',
  },
  {
    title: 'Thank You',
    subtitle: 'UNTH Digital Theatre Management System\nBuilt for Efficiency. Designed for Excellence.',
    bullets: [
      'University of Nigeria Teaching Hospital',
      'Department of Surgery — Theatre Complex',
      'Empowering surgical teams with digital tools',
    ],
    bg: 'navy',
  },
];

type SlideData = { title: string; subtitle: string; bullets: string[]; bg: string };

const themes: Record<string, { background: string; accent: string; text: string; sub: string }> = {
  navy: { background: 'linear-gradient(135deg, #001f3f 0%, #003366 50%, #001a2e 100%)', accent: '#87CEEB', text: '#FFFFFF', sub: '#87CEEB' },
  green: { background: 'linear-gradient(135deg, #006400 0%, #228B22 50%, #004d00 100%)', accent: '#FFFFFF', text: '#FFFFFF', sub: '#90EE90' },
  skyblue: { background: 'linear-gradient(135deg, #4682B4 0%, #87CEEB 50%, #5F9EA0 100%)', accent: '#001f3f', text: '#001f3f', sub: '#003366' },
};

function EditModal({ slide, index, onSave, onClose }: { slide: SlideData; index: number; onSave: (i: number, s: SlideData) => void; onClose: () => void }) {
  const [title, setTitle] = useState(slide.title);
  const [subtitle, setSubtitle] = useState(slide.subtitle);
  const [bullets, setBullets] = useState(slide.bullets.join('\n'));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: '90%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#001f3f', marginBottom: 16 }}>Edit Slide {index + 1}</h2>
        <label style={{ fontFamily: 'Georgia, serif', fontWeight: 'bold', display: 'block', marginBottom: 4 }}>Title</label>
        <textarea value={title} onChange={(e) => setTitle(e.target.value)} rows={2} style={{ width: '100%', fontFamily: 'Georgia, serif', fontSize: 16, padding: 8, marginBottom: 12, border: '2px solid #003366', borderRadius: 8 }} />
        <label style={{ fontFamily: 'Georgia, serif', fontWeight: 'bold', display: 'block', marginBottom: 4 }}>Subtitle</label>
        <textarea value={subtitle} onChange={(e) => setSubtitle(e.target.value)} rows={2} style={{ width: '100%', fontFamily: 'Georgia, serif', fontSize: 16, padding: 8, marginBottom: 12, border: '2px solid #003366', borderRadius: 8 }} />
        <label style={{ fontFamily: 'Georgia, serif', fontWeight: 'bold', display: 'block', marginBottom: 4 }}>Bullet Points (one per line)</label>
        <textarea value={bullets} onChange={(e) => setBullets(e.target.value)} rows={8} style={{ width: '100%', fontFamily: 'Georgia, serif', fontSize: 14, padding: 8, marginBottom: 16, border: '2px solid #003366', borderRadius: 8 }} />
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ fontFamily: 'Georgia, serif', fontSize: 16, padding: '10px 24px', borderRadius: 8, border: '2px solid #999', background: '#f5f5f5', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { onSave(index, { title, subtitle, bullets: bullets.split('\n').filter((b) => b.trim()), bg: slide.bg }); onClose(); }} style={{ fontFamily: 'Georgia, serif', fontSize: 16, padding: '10px 24px', borderRadius: 8, border: 'none', background: '#003366', color: '#fff', cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function PresentationPage() {
  const [current, setCurrent] = useState(0);
  const [data, setData] = useState<SlideData[]>(slides);
  const [editing, setEditing] = useState<number | null>(null);
  const [anim, setAnim] = useState('morph-in');
  const [full, setFull] = useState(false);
  const [auto, setAuto] = useState(false);
  const total = data.length;

  const goTo = useCallback((n: number) => {
    if (n < 0 || n >= total || n === current) return;
    setAnim('morph-out');
    setTimeout(() => { setCurrent(n); setAnim('morph-in'); }, 400);
  }, [current, total]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (editing !== null) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      if (e.key === 'f') setFull(p => !p);
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [next, prev, editing]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => {
      setCurrent(c => {
        if (c >= total - 1) { setAuto(false); return c; }
        setAnim('morph-out');
        setTimeout(() => { setCurrent(cc => cc + 1); setAnim('morph-in'); }, 400);
        return c;
      });
    }, 6000);
    return () => clearInterval(t);
  }, [auto, total]);

  const s = data[current];
  const th = themes[s.bg] || themes.navy;
  const isEdge = current === 0 || current === total - 1;

  return (
    <>
      <style>{`
        @keyframes morphIn { 0%{opacity:0;transform:scale(.92) translateY(30px);filter:blur(4px)} 100%{opacity:1;transform:scale(1) translateY(0);filter:blur(0)} }
        @keyframes morphOut { 0%{opacity:1;transform:scale(1) translateY(0);filter:blur(0)} 100%{opacity:0;transform:scale(1.05) translateY(-20px);filter:blur(4px)} }
        @keyframes bulletIn { 0%{opacity:0;transform:translateX(-30px)} 100%{opacity:1;transform:translateX(0)} }
        .morph-in{animation:morphIn .5s ease-out forwards}
        .morph-out{animation:morphOut .4s ease-in forwards}
        .blt{animation:bulletIn .5s ease-out forwards;opacity:0}
      `}</style>

      <div style={{ position: full ? 'fixed' : 'relative', inset: full ? 0 : undefined, zIndex: full ? 9998 : 1, width: '100%', height: full ? '100vh' : 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', fontFamily: 'Georgia, serif', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#001f3f', padding: '8px 20px', color: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Image src="/logo.png" alt="Logo" width={28} height={28} style={{ objectFit: 'contain' }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 'bold' }}>UNTH Theatre Presentation</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditing(current)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #87CEEB', background: 'transparent', color: '#87CEEB', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>Edit</button>
            <button onClick={() => setAuto(!auto)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #87CEEB', background: auto ? '#87CEEB' : 'transparent', color: auto ? '#001f3f' : '#87CEEB', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>{auto ? 'Pause' : 'Auto'}</button>
            <button onClick={() => setFull(!full)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #87CEEB', background: 'transparent', color: '#87CEEB', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>{full ? 'Exit' : 'Fullscreen'}</button>
          </div>
        </div>

        {/* Slide */}
        <div className={anim} style={{ flex: 1, background: th.background, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 60px', position: 'relative', overflow: 'auto' }}>
          <div style={{ position: 'absolute', top: 20, right: 30, opacity: 0.15 }}>
            <Image src="/logo.png" alt="" width={120} height={120} style={{ objectFit: 'contain' }} />
          </div>
          <div style={{ position: 'absolute', bottom: 20, left: 30, display: 'flex', alignItems: 'center', gap: 10, opacity: 0.7 }}>
            <Image src="/logo.png" alt="" width={36} height={36} style={{ objectFit: 'contain', borderRadius: '50%' }} />
            <span style={{ fontSize: 12, color: th.text }}>UNTH Theatre Management System</span>
          </div>
          <div style={{ position: 'absolute', bottom: 20, right: 30, fontSize: 14, color: th.text, opacity: 0.6 }}>{current + 1} / {total}</div>

          <h1 style={{ fontSize: isEdge ? 48 : 38, color: th.text, marginBottom: 8, lineHeight: 1.2, whiteSpace: 'pre-line', textAlign: isEdge ? 'center' : 'left' }}>{s.title}</h1>
          <p style={{ fontSize: 22, color: th.sub, marginBottom: 30, lineHeight: 1.4, whiteSpace: 'pre-line', textAlign: isEdge ? 'center' : 'left' }}>{s.subtitle}</p>

          {s.bullets.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, columns: s.bullets.length > 6 ? 2 : 1, columnGap: 40 }}>
              {s.bullets.map((b, i) => (
                <li key={i} className="blt" style={{ fontSize: 20, color: th.text, marginBottom: 14, paddingLeft: 28, position: 'relative', lineHeight: 1.5, animationDelay: `${i * 0.1}s`, breakInside: 'avoid' as const }}>
                  <span style={{ position: 'absolute', left: 0, top: 4, width: 14, height: 14, borderRadius: '50%', background: th.accent, opacity: 0.8 }} />
                  {b}
                </li>
              ))}
            </ul>
          )}

          {current === 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 30 }}>
              <div style={{ width: 100, height: 100, borderRadius: '50%', overflow: 'hidden', border: '4px solid #87CEEB', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image src="/logo.png" alt="UNTH Logo" width={80} height={80} style={{ objectFit: 'contain' }} />
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
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

      {editing !== null && <EditModal slide={data[editing]} index={editing} onSave={(i, ns) => { setData(p => { const c = [...p]; c[i] = ns; return c; }); }} onClose={() => setEditing(null)} />}
    </>
  );
}
