import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ROSTER_DEPARTMENTS } from '@/lib/rosterDepartments';
import { manageableDeptSlugs } from '@/lib/rosterSupervisors';

export const dynamic = 'force-dynamic';

/**
 * Which department rosters the signed-in person may edit.
 *
 * The departments index decided this from the ROLE alone, in the browser. That
 * was fine while authority was role-only; a supervisor would have seen their
 * own department listed read-only while the API happily accepted their edits —
 * a screen and a server disagreeing about the same permission.
 *
 * This is advisory, for rendering. Every write is still authorised server-side
 * in the department routes: hiding a button is not a permission check.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slugs = await manageableDeptSlugs(
    { id: (session.user as any).id, role: (session.user as any).role },
    ROSTER_DEPARTMENTS,
  );

  return NextResponse.json({ slugs });
}
