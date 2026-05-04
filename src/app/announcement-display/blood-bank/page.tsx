'use client';

import AnnouncementDisplay, {
  AnnouncementItem,
} from '@/components/announcement-display/AnnouncementDisplay';

export default function BloodBankAnnouncementPage() {
  return (
    <AnnouncementDisplay
      title="Emergency Blood Requests"
      subtitle="Live announcements for the Blood Bank team"
      emoji="🩸"
      accentColorClass="from-rose-700 via-red-600 to-red-700"
      cardAccentClass="border-red-500 bg-red-950/40"
      badgeClass="bg-red-400 text-red-950"
      endpoint="/api/announcement-display/blood-bank"
      emptyHint="No outstanding emergency blood requests. Announcements stop automatically once each request is marked READY."
      buildAnnouncement={buildBloodBankAnnouncement}
      renderExtra={(item) => {
        const units = (item as any).unitsRequested as number | undefined;
        const bloodType = (item as any).bloodType as string | undefined;
        const rh = (item as any).rhFactor as string | undefined;
        const procedure = (item as any).procedureName as string | undefined;
        return (
          <div className="space-y-2 text-sm">
            {(bloodType || units) && (
              <div className="flex flex-wrap gap-2">
                {bloodType && (
                  <span className="px-3 py-1 rounded-full bg-red-500 text-white font-bold text-base">
                    {bloodType}
                    {rh ? (rh.toLowerCase().startsWith('pos') ? '+' : '−') : ''}
                  </span>
                )}
                {units !== undefined && (
                  <span className="px-3 py-1 rounded-full bg-slate-700 text-slate-100 font-semibold">
                    {units} unit{units === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            )}
            {procedure && (
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400">Procedure: </span>
                <span className="font-semibold">{procedure}</span>
              </div>
            )}
          </div>
        );
      }}
    />
  );
}

function buildBloodBankAnnouncement(item: AnnouncementItem): string {
  const diagnosis = item.diagnosis || 'emergency surgery';
  const ward = item.ward || 'unknown ward';
  const units = (item as any).unitsRequested as number | undefined;
  const bloodType = (item as any).bloodType as string | undefined;
  const rh = (item as any).rhFactor as string | undefined;
  const rhWord = rh ? (rh.toLowerCase().startsWith('pos') ? 'positive' : 'negative') : '';
  const bloodSpec =
    bloodType && units !== undefined
      ? `Required: ${units} unit${units === 1 ? '' : 's'} of blood group ${bloodType} ${rhWord}.`
      : '';
  return (
    `Attention blood bank staff. Emergency blood request for surgery. ` +
    `Patient ${item.patientName}. ` +
    `Diagnosis: ${diagnosis}. ` +
    `Ward: ${ward}. ` +
    `${bloodSpec} ` +
    `Please cross-match and prepare blood immediately.`
  );
}
