'use client';

/**
 * The oxygen status, for everybody.
 *
 * /dashboard/oxygen-control is the oxygen room's own workspace: filing
 * readiness reports, raising alerts, the history. It is scoped to
 * OXYGEN_UNIT_SUPERVISOR, which is correct for a workspace and wrong for a
 * question — "is there oxygen in Theatre 2 right now" is asked by the surgeon
 * deciding whether to start, the anaesthetist, the recovery nurse and the
 * porter who just wheeled a cylinder past a dead outlet.
 *
 * So this page shows and asks, and changes nothing. Everybody signed in can
 * open it; only the oxygen room can post a status or answer a request.
 */

import Link from 'next/link';
import { Wind, ArrowRight } from 'lucide-react';
import OxygenStatusPanel from '@/components/oxygen/OxygenStatusPanel';
import { scheduleSentence, OXYGEN_UPDATE_GRACE_MINUTES } from '@/lib/oxygen/schedule';

export default function OxygenStatusPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Wind className="w-7 h-7 text-sky-600 flex-shrink-0 mt-1" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Oxygen Status</h1>
          <p className="text-sm text-gray-600">
            What the oxygen room last posted, how old it is, and how to reach them.
          </p>
        </div>
      </div>

      <OxygenStatusPanel title="Current oxygen position" />

      <div className="card bg-gray-50">
        <h2 className="text-base font-bold text-gray-900 mb-2">How this is kept current</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          <li>{scheduleSentence()}</li>
          <li>
            A posting counts against the slot it falls in. After{' '}
            {OXYGEN_UPDATE_GRACE_MINUTES} minutes with nothing posted, the slot is marked late
            on this page and on the oxygen room{"'"}s own screen — the same strip, so nobody is
            reading a gentler account of the day than anybody else.
          </li>
          <li>
            Outside those hours, and at weekends, nothing is owed. The age of the last posting
            is shown instead, and after a day it is marked out of date whatever the schedule says.
          </li>
          <li>
            Anybody can comment. Only the oxygen room, works and theatre management can answer.
          </li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/dashboard/oxygen-control" className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-medium">
            Oxygen control room <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/dashboard/oxygen-control/history" className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-medium">
            Posting history <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
