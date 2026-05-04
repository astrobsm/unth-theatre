'use client';

import AnnouncementDisplay, {
  AnnouncementItem,
} from '@/components/announcement-display/AnnouncementDisplay';

export default function LabAnnouncementPage() {
  return (
    <AnnouncementDisplay
      title="Emergency Lab Requests"
      subtitle="Live announcements for the Laboratory team"
      emoji="🧪"
      accentColorClass="from-cyan-700 via-cyan-600 to-blue-700"
      cardAccentClass="border-cyan-500 bg-cyan-950/40"
      badgeClass="bg-cyan-400 text-cyan-950"
      endpoint="/api/announcement-display/lab"
      emptyHint="No outstanding emergency lab requests. Announcements stop automatically once results are uploaded for each request."
      buildAnnouncement={buildLabAnnouncement}
      renderExtra={(item) => {
        const tests = (item as any).tests as { name: string; resultUploaded: boolean }[] | undefined;
        if (!tests || tests.length === 0) return null;
        return (
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Tests</div>
            <ul className="text-sm space-y-1">
              {tests.map((t, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={t.resultUploaded ? 'text-green-400' : 'text-yellow-300'}>
                    {t.resultUploaded ? '✓' : '•'}
                  </span>
                  <span>{t.name}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    />
  );
}

function buildLabAnnouncement(item: AnnouncementItem): string {
  const diagnosis = item.diagnosis || 'unspecified diagnosis';
  const ward = item.ward || 'unknown ward';
  const tests = (item as any).tests as { name: string }[] | undefined;
  const testList = tests && tests.length > 0
    ? `Tests required: ${tests.map((t) => t.name).join(', ')}.`
    : '';
  return (
    `Attention laboratory staff. Emergency lab request. ` +
    `Patient ${item.patientName}. ` +
    `Diagnosis: ${diagnosis}. ` +
    `Ward: ${ward}. ` +
    `${testList} ` +
    `Please collect samples and process immediately.`
  );
}
