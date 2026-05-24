'use client';

import AnnouncementDisplay, {
  AnnouncementItem,
} from '@/components/announcement-display/AnnouncementDisplay';

export default function ConsumablePackProviderAnnouncementPage() {
  return (
    <AnnouncementDisplay
      title="Consumable Pack Provider"
      subtitle="Live announcements for the surgical consumable packing team"
      emoji="📦"
      accentColorClass="from-amber-700 via-orange-600 to-red-700"
      cardAccentClass="border-amber-500 bg-amber-950/40"
      badgeClass="bg-amber-400 text-amber-950"
      endpoint="/api/announcement-display/consumable-pack-provider"
      emptyHint="No surgeries awaiting consumable packing. Announcements stop automatically once every requested consumable is marked PACKED."
      buildAnnouncement={buildConsumablePackAnnouncement}
      renderExtra={(item) => {
        const procedure = (item as any).procedureName as string | undefined;
        const surgeon = (item as any).surgeonName as string | undefined;
        const subspecialty = (item as any).subspecialty as string | undefined;
        const location = (item as any).location as string | undefined;
        const scheduledDate = (item as any).scheduledDate as string | undefined;
        const scheduledTime = (item as any).scheduledTime as string | undefined;
        const pendingCount = (item as any).pendingCount as number | undefined;
        const packingCount = (item as any).packingCount as number | undefined;
        const requestedCount = (item as any).requestedCount as number | undefined;
        const surgeryType = (item as any).surgeryType as string | undefined;

        const dateStr = scheduledDate ? new Date(scheduledDate).toLocaleDateString() : null;

        return (
          <div className="space-y-2 text-sm">
            {procedure && (
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400">Procedure: </span>
                <span className="font-semibold">{procedure}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {surgeon && (
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-400">Surgeon: </span>
                  <span className="font-semibold">{surgeon}</span>
                </div>
              )}
              {subspecialty && (
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-400">Specialty: </span>
                  <span className="font-semibold">{subspecialty}</span>
                </div>
              )}
              {location && (
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-400">Theatre: </span>
                  <span className="font-semibold">{location}</span>
                </div>
              )}
            </div>
            {(dateStr || scheduledTime) && (
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400">Scheduled: </span>
                <span className="font-semibold">
                  {dateStr}
                  {scheduledTime ? ` · ${scheduledTime}` : ''}
                </span>
              </div>
            )}
            {typeof pendingCount === 'number' && pendingCount > 0 && (
              <div className="rounded-lg bg-amber-900/40 border border-amber-500 px-3 py-2">
                <div className="text-xs font-bold text-amber-300 uppercase">Pending consumables</div>
                <div className="text-lg font-bold">
                  {pendingCount} item{pendingCount === 1 ? '' : 's'} awaiting packing
                  {typeof requestedCount === 'number' && typeof packingCount === 'number' && (
                    <span className="block text-xs font-normal text-amber-200 mt-1">
                      {requestedCount} requested · {packingCount} in progress
                    </span>
                  )}
                </div>
              </div>
            )}
            {surgeryType === 'EMERGENCY' && (
              <div className="rounded-lg bg-red-900/40 border border-red-500 px-3 py-2">
                <div className="text-xs font-bold text-red-300 uppercase">Emergency surgery</div>
                <div>Prioritise this pack immediately.</div>
              </div>
            )}
          </div>
        );
      }}
    />
  );
}

function buildConsumablePackAnnouncement(item: AnnouncementItem): string {
  const procedure = (item as any).procedureName || item.diagnosis || 'surgery';
  const surgeon = (item as any).surgeonName ? `under ${(item as any).surgeonName}` : '';
  const location = (item as any).location ? `in ${(item as any).location}` : '';
  const pending = (item as any).pendingCount as number | undefined;
  const surgeryType = (item as any).surgeryType as string | undefined;
  const emergency = surgeryType === 'EMERGENCY' ? 'Emergency. ' : '';
  const scheduledTime = (item as any).scheduledTime as string | undefined;
  const timeStr = scheduledTime ? `scheduled for ${scheduledTime}, ` : '';
  const count = typeof pending === 'number' && pending > 0
    ? `${pending} consumable${pending === 1 ? '' : 's'} `
    : 'Consumables ';

  return (
    `${emergency}Attention consumable pack provider. ` +
    `Patient ${item.patientName}. ` +
    `Procedure ${procedure} ${surgeon} ${location}, ${timeStr}. ` +
    `${count}awaiting packing. Please pack and deliver immediately.`
  )
    .replace(/\s+/g, ' ')
    .trim();
}
