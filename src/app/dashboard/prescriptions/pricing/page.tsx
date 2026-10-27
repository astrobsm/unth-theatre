'use client';

/**
 * What drugs cost — the pharmacy's own page.
 *
 * Separate from the prescriptions queue for the same reason the consumable
 * one is separate from packing: that screen is worked under time pressure
 * and this is a desk job.
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ItemPricingTable from '@/components/ItemPricingTable';
import UnpricedItemsQueue from '@/components/UnpricedItemsQueue';

export default function PharmacyPricingPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/prescriptions"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to prescriptions
      </Link>
      {/* First, because these are the items a surgeon cannot
          order at all until somebody here prices them. */}
      <div className="mb-6">
        <UnpricedItemsQueue />
      </div>


      <ItemPricingTable side="pharmacy" title="Drug prices" />
    </div>
  );
}
