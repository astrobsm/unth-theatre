import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Retired alongside /dashboard/roster/weekly — see that file for why. Group
// slugs map 1:1 onto department roster slugs, so send each one to its
// replacement instead of dropping the visitor on the hub.
const GROUP_TO_DEPT: Record<string, string> = {
  anaesthetists: 'anaesthetists',
  'anaesthetic-technicians': 'anaesthetic-technicians',
  'nurse-anaesthetists': 'nurse-anaesthetists',
  porters: 'porters',
  cleaners: 'cleaners',
  pharmacy: 'pharmacy',
  pharmacists: 'pharmacy',
};

export default function WeeklyRosterGroupRetired({ params }: { params: { group: string } }) {
  const dept = GROUP_TO_DEPT[params.group];
  redirect(dept ? `/dashboard/roster/dept/${dept}` : '/dashboard/roster/departments');
}
