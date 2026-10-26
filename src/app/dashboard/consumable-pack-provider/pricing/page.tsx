'use client';

/**
 * What consumables cost — the store's own page.
 *
 * Deliberately its own route rather than another section bolted onto the
 * pack-provider page, which is already long and is used under time
 * pressure while packs are being made up. Pricing is a quiet job done at a
 * desk, and mixing the two means doing one of them badly.
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ItemPricingTable from '@/components/ItemPricingTable';

export default function ConsumablePricingPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/consumable-pack-provider"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to consumable packs
      </Link>

      <ItemPricingTable side="consumables" title="Consumable prices" />
    </div>
  );
}
