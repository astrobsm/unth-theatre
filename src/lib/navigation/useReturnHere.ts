'use client';

// The other half of the back link: the page that sends somebody away tells
// the destination where they were, so its back link can bring them home.
//
// Returns a function rather than a string because a board builds many links
// at once, and because it must be cheap to apply to every one of them: a link
// that forgets to carry it is exactly the case that reappears as "back took
// me somewhere I had never been".

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { withReturnTo } from './returnTo';

export function useReturnHere(): (href: string) => string {
  const pathname = usePathname();
  const search = useSearchParams();

  // The query matters as much as the path: a board filtered to one theatre
  // or one date is a different page to come back to than the same board
  // showing everything.
  const qs = search?.toString() || '';
  const here = qs ? `${pathname}?${qs}` : pathname;

  return useCallback((href: string) => withReturnTo(href, here), [here]);
}
