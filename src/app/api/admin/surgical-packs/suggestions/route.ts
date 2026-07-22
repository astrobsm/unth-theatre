import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPackSuggestions } from '@/lib/packSuggestions';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'PHARMACIST', 'CONSUMABLE_PACK_PROVIDER',
];

// GET /api/admin/surgical-packs/suggestions?subspecialty=&kind=CONSUMABLE|PHARMACY
// Returns items most often requested historically for the subspecialty, as a
// starting point for authoring a pack. Not auto-applied — the admin curates.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const subspecialty = searchParams.get('subspecialty')?.trim();
  const kind = searchParams.get('kind')?.trim();
  if (!subspecialty || (kind !== 'CONSUMABLE' && kind !== 'PHARMACY')) {
    return NextResponse.json({ error: 'subspecialty and kind (CONSUMABLE|PHARMACY) required' }, { status: 400 });
  }

  const suggestions = await getPackSuggestions(subspecialty, kind);
  return NextResponse.json({ subspecialty, kind, suggestions });
}
