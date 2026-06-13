'use client';

/**
 * Public ORM Booking Guide — shareable link.
 *
 * Open to anyone (no auth). A clear, step-by-step guide for surgical units on
 * how to register a patient and book a case on the ORM platform.
 *
 * Live at: /booking-guide  (e.g. https://unth-theatre-mai.vercel.app/booking-guide)
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  UserPlus,
  CalendarPlus,
  LogIn,
  ClipboardList,
  PackageCheck,
  Pill,
  CheckCircle2,
  AlertTriangle,
  Phone,
  ArrowRight,
  Printer,
} from 'lucide-react';

interface Step {
  icon: any;
  title: string;
  details: string[];
}

const REGISTER_STEPS: Step[] = [
  {
    icon: LogIn,
    title: 'Log in to ORM',
    details: [
      'Open the ORM platform in any browser: https://unth-theatre-mai.vercel.app',
      'Sign in with your username and password. If you do not yet have an account, ask your HoD or the Theatre IT desk to create one.',
      'First-time users will be prompted to change their password.',
    ],
  },
  {
    icon: UserPlus,
    title: 'Register the patient',
    details: [
      'From the dashboard sidebar, open Patients → New Patient.',
      'Enter the patient\u2019s full name, folder/PT number, age, gender and ward.',
      'Add the diagnosis and any relevant clinical summary (comorbidities, current medications).',
      'Save. The patient is now in the system and can be selected when booking a case.',
    ],
  },
];

const BOOK_STEPS: Step[] = [
  {
    icon: CalendarPlus,
    title: 'Start a new booking',
    details: [
      'Open Surgeries → Book Surgery (New Surgery) from the sidebar.',
      'Search and select the patient you just registered.',
      'Choose your surgical unit and subspecialty \u2014 the theatre allocated to your unit for that day is shown automatically.',
    ],
  },
  {
    icon: ClipboardList,
    title: 'Enter the procedure details',
    details: [
      'Enter the procedure name, indication, surgery type (elective / urgent / emergency) and anaesthesia type.',
      'Pick the scheduled date and time, and the estimated duration.',
      'Add the surgical team members (consultant, registrars, house officers).',
      'Flag any special needs (blood transfusion, diathermy, special mattress, etc.).',
    ],
  },
  {
    icon: PackageCheck,
    title: 'Select the consumable pack',
    details: [
      'Tick the surgical consumables your case needs from the pre-loaded catalogue for your subspecialty.',
      'The Pack Provider sees this list and pre-packs everything the night before surgery.',
      'Patients pay for the pack at the Surgical Pack Consumable Shop and present the receipt at theatre to collect it.',
    ],
  },
  {
    icon: Pill,
    title: 'Add the anaesthetic / drug prescription',
    details: [
      'Add the drugs, IV fluids and dressing agents to be packed by Pharmacy.',
      'On submission, the prescription is wired automatically to Pharmacy for dispensing.',
    ],
  },
  {
    icon: CheckCircle2,
    title: 'Submit & confirm',
    details: [
      'Review the summary and submit the booking.',
      'ORM automatically notifies the on-duty anaesthetist, the theatre nurse-in-charge, the Pack Provider and Pharmacy.',
      'You can view the booked case under Surgeries and track it through to recovery.',
    ],
  },
];

function StepCard({ step, index }: { step: Step; index: number }) {
  const Icon = step.icon;
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
          {index + 1}
        </div>
      </div>
      <div className="pb-6 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">{step.title}</h3>
        </div>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
          {step.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function BookingGuidePage() {
  const [tab, setTab] = useState<'register' | 'book'>('register');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <h1 className="text-2xl md:text-3xl font-bold">
            ORM Booking Guide
          </h1>
          <p className="mt-2 text-blue-100">
            University of Nigeria Teaching Hospital (UNTH) — Theatre Complex
          </p>
          <p className="mt-1 text-blue-100 text-sm">
            How to register a patient and book a surgical case on the ORM platform. From Monday 15 June 2026,
            every case must be booked here — paper booking lists are no longer accepted.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            <button
              onClick={() => setTab('register')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                tab === 'register' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              1. Register a patient
            </button>
            <button
              onClick={() => setTab('book')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                tab === 'book' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              2. Book a case
            </button>
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          {tab === 'register' ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Part 1 — Register the patient
              </h2>
              <div>
                {REGISTER_STEPS.map((s, i) => (
                  <StepCard key={i} step={s} index={i} />
                ))}
              </div>
              <button
                onClick={() => setTab('book')}
                className="mt-2 inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-medium"
              >
                Next: Book a case <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Part 2 — Book the surgical case
              </h2>
              <div>
                {BOOK_STEPS.map((s, i) => (
                  <StepCard key={i} step={s} index={i} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Important</p>
            <p className="mt-1">
              From Monday 15 June 2026, the theatre will not recognise any surgery or case booked on paper.
              Departmental staff must no longer receive or type cases for distribution. All bookings must go
              through the ORM platform.
            </p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3">
          <Phone className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-gray-700">
            <p className="font-semibold text-gray-900">Need help?</p>
            <p className="mt-1">
              Contact the Theatre IT desk or the System Administrator for login issues or hands-on training.
              See also the{' '}
              <Link href="/role-guide" className="text-blue-700 hover:underline">
                Role Guide
              </Link>{' '}
              for role-specific instructions.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
