'use client';

import AnnouncementDisplay, {
  AnnouncementItem,
} from '@/components/announcement-display/AnnouncementDisplay';

export default function PharmacyAnnouncementPage() {
  return (
    <AnnouncementDisplay
      title="Emergency Prescriptions"
      subtitle="Live announcements for the Pharmacy team"
      emoji="💊"
      accentColorClass="from-emerald-700 via-emerald-600 to-teal-700"
      cardAccentClass="border-emerald-500 bg-emerald-950/40"
      badgeClass="bg-emerald-400 text-emerald-950"
      endpoint="/api/announcement-display/pharmacy"
      emptyHint="No prescriptions awaiting packing. Announcements stop automatically once each prescription is packed by the pharmacist."
      buildAnnouncement={buildPharmacyAnnouncement}
      renderExtra={(item) => {
        const allergies = (item as any).allergyAlerts as string | null;
        const procedure = (item as any).procedureName as string | undefined;
        return (
          <div className="space-y-2 text-sm">
            {procedure && (
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400">Procedure: </span>
                <span className="font-semibold">{procedure}</span>
              </div>
            )}
            {allergies && (
              <div className="rounded-lg bg-red-900/40 border border-red-500 px-3 py-2">
                <div className="text-xs font-bold text-red-300 uppercase">Allergy alert</div>
                <div>{allergies}</div>
              </div>
            )}
          </div>
        );
      }}
    />
  );
}

function buildPharmacyAnnouncement(item: AnnouncementItem): string {
  const diagnosis = item.diagnosis || 'emergency surgery';
  const ward = item.ward || 'unknown ward';
  const procedure = (item as any).procedureName ? `for ${(item as any).procedureName}` : '';
  return (
    `Attention pharmacist. Emergency prescription submitted. ` +
    `Patient ${item.patientName}. ` +
    `Diagnosis: ${diagnosis}. ` +
    `Ward: ${ward}. ` +
    `Please pack the drugs ${procedure} immediately.`
  );
}
