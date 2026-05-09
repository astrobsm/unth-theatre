'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Download, Printer, FileText } from 'lucide-react';

export default function HodLetterPage() {
  const [text, setText] = useState<string>('Loading…');

  useEffect(() => {
    fetch('/HOD_ONBOARDING_LETTER.txt')
      .then((r) => r.text())
      .then(setText)
      .catch(() => setText('Failed to load the letter. Please refresh.'));
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto print:p-0 print:max-w-none">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>
        <div className="flex gap-2">
          <a
            href="/HOD_ONBOARDING_LETTER.txt"
            download
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            <Download className="w-4 h-4" /> Download (.txt)
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded bg-gray-700 text-white hover:bg-gray-800"
          >
            <Printer className="w-4 h-4" /> Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="bg-white shadow border border-gray-200 rounded-lg p-6 print:shadow-none print:border-0">
        <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide mb-3 print:hidden">
          <FileText className="w-4 h-4" />
          Official Circular — HOD Onboarding
        </div>
        <pre className="whitespace-pre-wrap font-serif text-[15px] leading-7 text-gray-900">
{text}
        </pre>
      </div>
    </div>
  );
}
