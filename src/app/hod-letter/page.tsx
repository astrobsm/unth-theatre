'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function HodLetterPrintPage() {
  const params = useSearchParams();
  const auto = params?.get('print') === '1';

  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [auto]);

  return (
    <>
      {/* Print + page styling */}
      <style jsx global>{`
        @page {
          size: A4;
          margin: 18mm 18mm 22mm 18mm;
        }
        html, body {
          background: #f3f4f6;
        }
        body {
          font-family: 'Georgia', 'Times New Roman', serif;
          color: #111827;
        }
        .letter-toolbar { background: #ffffff; border-bottom: 1px solid #e5e7eb; }
        .letter-page {
          width: 210mm;
          min-height: 297mm;
          margin: 18px auto;
          background: #ffffff;
          padding: 22mm 22mm 26mm 22mm;
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
          color: #111827;
          line-height: 1.55;
          font-size: 12pt;
        }
        .letter-page h1, .letter-page h2 { font-family: 'Georgia', serif; }
        .letter-header {
          display: flex;
          align-items: center;
          gap: 18px;
          padding-bottom: 12px;
          border-bottom: 2px solid #15803d;
        }
        .letter-header .crest { flex: 0 0 auto; }
        .letter-header .titles {
          flex: 1 1 auto;
          text-align: center;
          font-family: 'Georgia', serif;
        }
        .letter-header .titles .institution {
          font-size: 18pt; font-weight: 700; color: #15803d;
          letter-spacing: 0.5px; margin: 0;
        }
        .letter-header .titles .subline {
          font-size: 11pt; color: #374151; margin: 2px 0 0 0;
        }
        .letter-header .titles .office {
          font-size: 10.5pt; color: #6b7280; margin: 4px 0 0 0;
          font-style: italic;
        }
        .ref-row {
          display: flex; justify-content: space-between;
          margin-top: 14px; font-size: 11pt; color: #374151;
        }
        .ref-row .ref { font-weight: 600; }
        .recipient { margin-top: 18px; }
        .recipient .label { font-weight: 700; }
        .recipient .scroll { color: #374151; }
        .through { margin-top: 10px; }
        .subject {
          margin-top: 18px; padding: 8px 12px;
          background: #f0fdf4; border-left: 4px solid #15803d;
          font-weight: 700; font-size: 12pt; line-height: 1.4;
          text-transform: uppercase; letter-spacing: 0.3px;
        }
        .salutation { margin-top: 18px; font-weight: 600; }
        .body p { margin: 0 0 12px 0; text-align: justify; }
        .clause { margin: 14px 0; }
        .clause h3 {
          font-size: 11.5pt; color: #15803d; margin: 0 0 4px 0;
          text-transform: uppercase; letter-spacing: 0.3px;
        }
        .clause p { margin: 0; text-align: justify; }
        .role-table {
          margin: 6px 0 0 0; border-collapse: collapse;
          font-size: 11pt;
        }
        .role-table td { padding: 4px 14px 4px 0; }
        .role-table td.arrow { color: #6b7280; }
        .signature-block {
          margin-top: 36px;
        }
        .signature-block .line {
          width: 220px; border-bottom: 1px solid #111827;
          height: 36px;
        }
        .signature-block .name { font-weight: 700; margin-top: 4px; }
        .cc { margin-top: 28px; font-size: 10.5pt; color: #374151; }
        .cc .label { font-weight: 700; }
        .cc ul { margin: 4px 0 0 18px; padding: 0; }
        .cc li { margin: 1px 0; }

        @media print {
          .letter-toolbar { display: none !important; }
          html, body { background: #ffffff !important; }
          .letter-page {
            width: auto; min-height: 0; margin: 0; padding: 0;
            box-shadow: none; border: 0;
            font-size: 11.5pt;
          }
        }
      `}</style>

      <div className="letter-toolbar print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md bg-green-700 text-white hover:bg-green-800 shadow"
          >
            <Printer className="w-4 h-4" />
            Print / Save as PDF
          </button>
        </div>
      </div>

      <article className="letter-page">
        <header className="letter-header">
          <div className="crest">
            {/* Use unoptimized so it works fine when printed */}
            <Image
              src="/unth-orm-logo.png"
              alt="UNTH crest"
              width={84}
              height={84}
              priority
              unoptimized
            />
          </div>
          <div className="titles">
            <p className="institution">University of Nigeria Teaching Hospital</p>
            <p className="subline">Ituku-Ozalla, Enugu State, Nigeria</p>
            <p className="office">Office of the Theatre Chairman — Operative Resource Manager (ORM)</p>
          </div>
          <div className="crest">
            <Image
              src="/unth-orm-logo.png"
              alt="UNTH crest"
              width={84}
              height={84}
              priority
              unoptimized
            />
          </div>
        </header>

        <div className="ref-row">
          <span className="ref">Ref: UNTH/THEATRE/ORM/2026/05-001</span>
          <span>9th May 2026</span>
        </div>

        <div className="recipient">
          <div className="label">To: All Heads of Department</div>
          <div className="scroll">
            Department of Surgery and its Sub-Specialties; Department of Anaesthesia;
            Theatre Nursing Services; PACU/Recovery; Pharmacy; Laboratory; Blood Bank;
            Biomedical Engineering; Power House; Plumbing &amp; Water Services; CSSD;
            Theatre Stores; Portering Services; Catering &amp; Theatre Meals; Security;
            ICT; Records — and all other allied services.
          </div>
        </div>

        <div className="through">
          <div className="label" style={{ fontWeight: 700 }}>Through:</div>
          <div>The Chief Medical Director</div>
          <div>The Chairman, Medical Advisory Committee</div>
          <div>The Director of Nursing Services</div>
        </div>

        <div className="subject">
          Re: Staff Onboarding on the Operative Resource Manager (ORM) Platform and
          Commencement of Digital Duty Rosters with Effect from Sunday, 10th May 2026
        </div>

        <div className="salutation">Dear Sir/Madam,</div>

        <div className="body" style={{ marginTop: '8px' }}>
          <p>
            Sequel to the deployment of the <strong>Operative Resource Manager (ORM)</strong>
            — the unified digital platform now serving the Main Theatre Complex of UNTH
            Ituku-Ozalla — I write to formally solicit your support in driving full staff
            adoption across your department.
          </p>
          <p>
            The platform consolidates patient scheduling, pre-operative review, theatre
            allocation, intra-operative documentation (WHO Surgical Safety Checklist),
            PACU handover, blood and drug requests, equipment checkout, fault and
            emergency alerts, the live theatre radio service, departmental announcements
            and the weekly duty roster — all in one place, accessible from any phone,
            tablet or computer, online or offline.
          </p>
          <p>To this end, I respectfully request the following:</p>
        </div>

        <div className="clause">
          <h3>1. Staff Profile Creation</h3>
          <p>
            Kindly direct every member of staff in your department — clinical and
            non-clinical — to register an individual profile on the platform without
            delay. Each staff member should select the role and department that match
            their substantive posting; the system will automatically generate a unique
            staff code on approval.
          </p>
        </div>

        <div className="clause">
          <h3>2. Commencement of Digital Duty Rosters — Sunday, 10th May 2026</h3>
          <p>
            With effect from <strong>Sunday, 10th May 2026</strong>, all departmental
            duty rosters (call, morning, afternoon and night shifts; on-call consultants;
            standby teams) shall be created and maintained on the ORM platform. Manual /
            paper rosters will run in parallel only during the transition fortnight and
            will be retired thereafter. Heads of Department, Unit Heads and Roster
            Officers are kindly requested to ensure that the roster for the week
            beginning Sunday, 10th May 2026 is published on the platform on or before
            <strong> Saturday, 9th May 2026, 12:00 noon</strong>, and that subsequent
            weekly rosters are uploaded every <strong>Thursday before 12:00 noon</strong>
            as already standardised.
          </p>
        </div>

        <div className="clause">
          <h3>3. Physical Onboarding Meetings — From Next Week</h3>
          <p>
            A dedicated physical onboarding session will be held for each department from
            next week. The schedule will be circulated separately by this office in
            consultation with each Head of Department. <strong>Attendance is mandatory</strong>
            for all departmental staff; laptops, tablets or smartphones should be
            brought along so that profiles, rosters and module access can be configured
            live during the session.
          </p>
        </div>

        <div className="clause">
          <h3>4. Platform Access</h3>
          <p>
            The platform is available at:{' '}
            <strong>https://unth-theatre-mai.vercel.app</strong>
            <br />
            It is also installable as a Progressive Web App on Android, iOS and Windows
            devices (use the browser&rsquo;s &ldquo;Install App&rdquo; or &ldquo;Add to
            Home Screen&rdquo; option). The app continues to function offline and will
            synchronise once connectivity is restored.
          </p>
        </div>

        <div className="clause">
          <h3>5. Support</h3>
          <p>
            For technical assistance during registration or roster upload, departmental
            super-users and the ICT helpdesk will be on hand throughout the onboarding
            fortnight. Issues may also be reported in-app via{' '}
            <em>Settings &rarr; Fault Alerts</em>.
          </p>
        </div>

        <p style={{ marginTop: '14px', textAlign: 'justify' }}>
          Your usual co-operation in ensuring 100% staff onboarding and timely roster
          publication will go a long way in enhancing patient safety, transparency and
          operational efficiency in our theatre complex.
        </p>

        <p style={{ marginTop: '12px' }}>Thank you.</p>

        <div className="signature-block">
          <div>Yours faithfully,</div>
          <div className="line" />
          <div className="name">Theatre Chairman</div>
          <div>UNTH Ituku-Ozalla</div>
          <div style={{ color: '#374151' }}>For: The Chief Medical Director</div>
        </div>

        <div className="cc">
          <span className="label">cc:</span>
          <ul>
            <li>Chief Medical Director</li>
            <li>Chairman, Medical Advisory Committee</li>
            <li>Director of Clinical Services</li>
            <li>Director of Nursing Services</li>
            <li>Director of Pharmaceutical Services</li>
            <li>Head, Biomedical Engineering</li>
            <li>Head, Information &amp; Communication Technology</li>
            <li>Theatre Manager</li>
            <li>File</li>
          </ul>
        </div>
      </article>
    </>
  );
}
