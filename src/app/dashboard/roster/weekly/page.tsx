import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// The Weekly Roster Forms have been retired: they wrote the same `rosters` table
// as the department rosters, so a department could be rostered twice a week with
// no way to tell which submission was current. Department rosters (draft →
// publish → version history) are now the single submission route.
//
// Kept as a redirect rather than deleted so existing bookmarks, WhatsApp links
// and the printed HOD onboarding letter still land somewhere useful.
export default function WeeklyRosterFormsRetired() {
  redirect('/dashboard/roster/departments');
}
