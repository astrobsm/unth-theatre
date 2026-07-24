import { redirect } from 'next/navigation';
import { getRosterDept } from '@/lib/rosterDepartments';

export const dynamic = 'force-dynamic';

// Standalone shareable department roster URL, e.g. /roster/nursing.
// Redirects into the authenticated dashboard department roster page.
export default function StandaloneDeptRoster({ params }: { params: { dept: string } }) {
  const dept = getRosterDept(params.dept);
  if (!dept) redirect('/dashboard/roster/departments');
  redirect(`/dashboard/roster/dept/${params.dept}`);
}
