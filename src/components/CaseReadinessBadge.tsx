'use client';

/**
 * "Is my patient ready?" on a case, for whoever is looking at it.
 *
 * Surgeon, anaesthetist and nurses all see the same badge computed by the
 * same function — lib/specialNeeds/readiness. Three screens working it out
 * separately is how a case gets wheeled in on one team's understanding and
 * turned away on another's.
 *
 * It renders nothing while loading rather than flashing grey. A readiness
 * badge that says "not recorded" for half a second and then turns green is
 * worse than one that appears a moment late: somebody reads the first state
 * and walks off.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, CircleDashed } from 'lucide-react';
import { readinessOf, readinessTone, type CaseDeposit } from '@/lib/specialNeeds/readiness';

const TONE_CLASS: Record<string, string> = {
  green: 'bg-green-50 text-green-800 border-green-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-red-50 text-red-800 border-red-200',
  grey: 'bg-gray-50 text-gray-700 border-gray-200',
};

export default function CaseReadinessBadge({
  surgeryId,
  compact = false,
}: {
  surgeryId: string;
  compact?: boolean;
}) {
  const [deposit, setDeposit] = useState<CaseDeposit | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/surgeries/${surgeryId}/deposit`, { credentials: 'include' });
        if (!res.ok) {
          if (!cancelled) setDeposit(null);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const d = data?.deposit;
        setDeposit(
          d
            ? {
                consumable: {
                  status: d.consumableStatus,
                  packedAt: d.consumablePackedAt,
                  amount: d.consumableAmount,
                },
                pharmacy: {
                  status: d.pharmacyStatus,
                  packedAt: d.pharmacyPackedAt,
                  amount: d.pharmacyAmount,
                },
              }
            : null,
        );
      } catch {
        if (!cancelled) setDeposit(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surgeryId]);

  // undefined means still loading; null means loaded and there is no record.
  if (deposit === undefined) return null;

  const r = readinessOf(deposit);
  const tone = readinessTone(r.state);
  const Icon = r.ready ? CheckCircle2 : tone === 'grey' ? CircleDashed : AlertTriangle;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
        title={r.outstanding.join(' ') || r.summary}
      >
        <Icon className="h-3 w-3" />
        {r.ready ? 'Drugs & consumables ready' : r.summary}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border p-3 text-sm ${TONE_CLASS[tone]}`}>
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4" />
        {r.summary}
      </p>
      {r.outstanding.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
          {r.outstanding.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
