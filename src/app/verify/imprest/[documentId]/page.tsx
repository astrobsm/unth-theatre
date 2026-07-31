'use client';

// ============================================================
// Public document verification
// ------------------------------------------------------------
// Where the QR code on a certified imprest document leads. The person scanning
// it is holding paper and wants one question answered: did this come from the
// system, unaltered?
//
// Public by design — an auditor or a bank has no hospital login — and outside
// /dashboard so it never renders the staff shell. It shows only what the holder
// can already read off the page, plus the checksum that binds it.
// ============================================================

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';

interface Verification {
  found: boolean;
  documentId: string;
  documentType?: string;
  title?: string;
  issuedAt?: string;
  issuedBy?: string;
  checksum?: string | null;
  certified?: boolean;
  pageCount?: number;
  watermark?: string | null;
  verificationCount?: number;
}

export default function VerifyImprestDocumentPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = params?.documentId;
  const [data, setData] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!documentId) return;
    (async () => {
      try {
        const res = await fetch(`/api/imprest/verify/${encodeURIComponent(documentId)}`);
        setData(await res.json());
      } catch {
        setData({ found: false, documentId: String(documentId) });
      } finally {
        setLoading(false);
      }
    })();
  }, [documentId]);

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center">
          <h1 className="text-lg font-bold text-gray-900">Document Verification</h1>
          <p className="text-sm text-gray-500">
            University of Nigeria Teaching Hospital, Ituku-Ozalla
            <br />
            Theatre Commercialized Unit — Imprest
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </div>
        ) : data?.found ? (
          <div className="overflow-hidden rounded-xl border border-green-200 bg-white">
            <div className="flex items-center gap-3 bg-green-50 px-5 py-4">
              <ShieldCheck className="h-7 w-7 flex-shrink-0 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">This document was issued by the system</p>
                <p className="text-xs text-green-800">
                  Compare the details below with the paper in your hand. If anything differs,
                  the copy you are holding has been altered.
                </p>
              </div>
            </div>
            <dl className="divide-y divide-gray-100 px-5 py-2">
              <Row label="Identifier" value={data.documentId} mono />
              <Row label="Document" value={data.title} />
              <Row label="Type" value={data.documentType?.replace(/_/g, ' ')} />
              <Row
                label="Issued"
                value={data.issuedAt ? new Date(data.issuedAt).toLocaleString() : undefined}
              />
              <Row label="Issued by" value={data.issuedBy} />
              <Row label="Pages" value={data.pageCount ? String(data.pageCount) : undefined} />
              {data.watermark && <Row label="Watermark" value={data.watermark} />}
              {data.certified ? (
                <Row label="Checksum" value={data.checksum ?? undefined} mono />
              ) : (
                <div className="py-2">
                  <p className="text-sm text-amber-700">
                    <strong>Issued, but not certified.</strong> No checksum was recorded for this
                    document, so its contents cannot be confirmed. Ask the issuing office to
                    re-issue it.
                  </p>
                </div>
              )}
              <Row
                label="Times verified"
                value={data.verificationCount ? String(data.verificationCount) : '1'}
              />
            </dl>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-red-200 bg-white">
            <div className="flex items-center gap-3 bg-red-50 px-5 py-4">
              <ShieldAlert className="h-7 w-7 flex-shrink-0 text-red-600" />
              <div>
                <p className="font-semibold text-red-900">No such document</p>
                <p className="text-xs text-red-800">
                  Nothing was issued with this identifier. Check that it was entered correctly —
                  and if it was, treat the document you are holding as unverified.
                </p>
              </div>
            </div>
            <div className="px-5 py-3">
              <p className="text-xs text-gray-500">Identifier searched</p>
              <p className="font-mono text-sm text-gray-900 break-all">{data?.documentId}</p>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          This page confirms issuance and integrity only. It does not disclose the contents
          or the amounts of any imprest.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap justify-between gap-2 py-2">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className={`text-right text-sm text-gray-900 ${mono ? 'font-mono break-all text-xs' : 'font-medium'}`}>
        {value}
      </dd>
    </div>
  );
}
