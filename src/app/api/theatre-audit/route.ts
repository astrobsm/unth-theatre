import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const ADMIN_AUDIT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR',
  'CMAC',
  'DC_MAC',
];

type AuditSourceType =
  | 'cancellations'
  | 'incidents'
  | 'delayed_tasks'
  | 'delayed_roster_submissions'
  | 'disciplinary_queries'
  | 'mortalities'
  | 'faults'
  | 'anonymous_tips'
  | 'security_reports';

type AuditSectionItem = {
  id: string;
  sourceType: AuditSourceType;
  title: string;
  summary: string;
  status: string;
  occurredAt: string;
  staffInvolved: string[];
  audited: boolean;
  lastRecommendationAt: string | null;
};

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && v.trim().length > 0)));
}

function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function rosterDeadlineForWeek(weekStartMonday: Date): Date {
  const deadline = new Date(weekStartMonday);
  deadline.setDate(deadline.getDate() - 3);
  deadline.setHours(12, 0, 0, 0);
  return deadline;
}

async function getReviewMap(items: Array<{ sourceType: AuditSourceType; id: string }>) {
  const keys = items.map((x) => `${x.sourceType}:${x.id}`);
  if (keys.length === 0) return new Map<string, { audited: boolean; lastRecommendationAt: string | null }>();

  const logs = await prisma.auditLog.findMany({
    where: {
      tableName: 'theatre_audit_reviews',
      recordId: { in: keys },
      action: 'THEATRE_AUDIT_REVIEW',
    },
    orderBy: { createdAt: 'desc' },
  });

  const out = new Map<string, { audited: boolean; lastRecommendationAt: string | null }>();
  for (const key of keys) {
    const entry = logs.find((l) => l.recordId === key);
    out.set(key, {
      audited: !!entry,
      lastRecommendationAt: entry ? entry.createdAt.toISOString() : null,
    });
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ADMIN_AUDIT_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');

    const [
      cancellations,
      incidents,
      disciplinaryQueries,
      mortalities,
      faultReports,
      equipmentFaultAlerts,
      subStoreFaults,
      plumbingFaults,
      anonymousTips,
      securityReports,
      rosters,
    ] = await Promise.all([
      prisma.caseCancellation.findMany({
        take: 200,
        orderBy: { cancelledAt: 'desc' },
        include: {
          surgery: {
            select: {
              id: true,
              procedureName: true,
              patient: { select: { name: true, folderNumber: true } },
              surgeon: { select: { fullName: true } },
              surgeonName: true,
            },
          },
          user: { select: { fullName: true } },
        },
      }),
      prisma.incidentReport.findMany({
        take: 200,
        orderBy: { incidentDate: 'desc' },
        include: {
          reportedBy: { select: { fullName: true } },
          investigatedBy: { select: { fullName: true } },
          verifiedBy: { select: { fullName: true } },
        },
      }),
      prisma.disciplinaryQuery.findMany({
        take: 300,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.mortality.findMany({
        take: 200,
        orderBy: { timeOfDeath: 'desc' },
        include: {
          patient: { select: { name: true, folderNumber: true } },
          surgery: {
            select: {
              procedureName: true,
              surgeon: { select: { fullName: true } },
              surgeonName: true,
            },
          },
          audit: { select: { id: true, createdAt: true } },
        },
      }),
      prisma.faultReport.findMany({
        take: 150,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.equipmentFaultAlert.findMany({
        take: 150,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.subStoreItemFault.findMany({
        take: 150,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.plumbingFault.findMany({
        take: 150,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.anonymousTip.findMany({
        take: 200,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.securityReport.findMany({
        take: 200,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.roster.findMany({
        take: 1000,
        orderBy: { uploadedAt: 'desc' },
        include: {
          user: { select: { fullName: true } },
          theatre: { select: { name: true } },
        },
      }),
    ]);

    const delayedTaskQueries = disciplinaryQueries.filter((q) =>
      ['READINESS_LATE', 'THEATRE_SETUP_LATE'].includes(q.queryType)
    );

    const delayedRosterRows = rosters.filter((r) => {
      const monday = mondayOfWeek(new Date(r.date));
      const deadline = rosterDeadlineForWeek(monday);
      return r.uploadedAt > deadline;
    });

    const cancellationsItems: AuditSectionItem[] = cancellations.map((c) => ({
      id: c.id,
      sourceType: 'cancellations',
      title: `${c.surgery.patient?.name || 'Unknown patient'} - ${c.surgery.procedureName}`,
      summary: `${c.category.replace(/_/g, ' ')}: ${c.reason}`,
      status: 'CANCELLED',
      occurredAt: c.cancelledAt.toISOString(),
      staffInvolved: uniqueNonEmpty([c.user.fullName, c.surgery.surgeon?.fullName, c.surgery.surgeonName]),
      audited: false,
      lastRecommendationAt: null,
    }));

    const incidentsItems: AuditSectionItem[] = incidents.map((i) => ({
      id: i.id,
      sourceType: 'incidents',
      title: `${i.incidentType.replace(/_/g, ' ')} at ${i.location}`,
      summary: i.description,
      status: i.status,
      occurredAt: i.incidentDate.toISOString(),
      staffInvolved: uniqueNonEmpty([
        i.reportedBy?.fullName,
        i.investigatedBy?.fullName,
        i.verifiedBy?.fullName,
        i.responsiblePerson,
      ]),
      audited: false,
      lastRecommendationAt: null,
    }));

    const delayedTaskItems: AuditSectionItem[] = delayedTaskQueries.map((q) => ({
      id: q.id,
      sourceType: 'delayed_tasks',
      title: `${q.queryType.replace(/_/g, ' ')} - ${q.recipientName}`,
      summary: q.subject,
      status: q.status,
      occurredAt: q.createdAt.toISOString(),
      staffInvolved: uniqueNonEmpty([q.recipientName, q.issuedByName]),
      audited: false,
      lastRecommendationAt: null,
    }));

    const delayedRosterItems: AuditSectionItem[] = delayedRosterRows.map((r) => ({
      id: r.id,
      sourceType: 'delayed_roster_submissions',
      title: `${r.staffName} (${r.staffCategory.replace(/_/g, ' ')})`,
      summary: `Uploaded late for ${new Date(r.date).toLocaleDateString('en-GB')} (${r.shift})`,
      status: 'LATE_SUBMISSION',
      occurredAt: r.uploadedAt.toISOString(),
      staffInvolved: uniqueNonEmpty([r.user?.fullName, r.staffName]),
      audited: false,
      lastRecommendationAt: null,
    }));

    const disciplinaryItems: AuditSectionItem[] = disciplinaryQueries.map((q) => ({
      id: q.id,
      sourceType: 'disciplinary_queries',
      title: `${q.referenceNumber} - ${q.recipientName}`,
      summary: q.subject,
      status: q.status,
      occurredAt: q.createdAt.toISOString(),
      staffInvolved: uniqueNonEmpty([q.recipientName, q.issuedByName]),
      audited: false,
      lastRecommendationAt: null,
    }));

    const mortalityItems: AuditSectionItem[] = mortalities.map((m) => ({
      id: m.id,
      sourceType: 'mortalities',
      title: `${m.patient?.name || 'Unknown patient'} - Mortality`,
      summary: m.causeOfDeath,
      status: m.audit ? 'AUDITED' : 'PENDING_AUDIT',
      occurredAt: m.timeOfDeath.toISOString(),
      staffInvolved: uniqueNonEmpty([m.surgery?.surgeon?.fullName, m.surgery?.surgeonName]),
      audited: !!m.audit,
      lastRecommendationAt: m.audit?.createdAt?.toISOString?.() || null,
    }));

    const faultsItems: AuditSectionItem[] = [
      ...faultReports.map((f) => ({
        id: `fault_report__${f.id}`,
        sourceType: 'faults' as const,
        title: `${f.faultType} - ${f.description.slice(0, 80)}`,
        summary: `Priority ${f.priority} | Status ${f.status}`,
        status: f.status,
        occurredAt: f.createdAt.toISOString(),
        staffInvolved: uniqueNonEmpty([f.reportedBy, f.acknowledgedBy, f.resolvedBy, f.closedBy]),
        audited: false,
        lastRecommendationAt: null,
      })),
      ...equipmentFaultAlerts.map((f) => ({
        id: `equipment_fault_alert__${f.id}`,
        sourceType: 'faults' as const,
        title: `${f.itemName} - ${f.faultDescription.slice(0, 80)}`,
        summary: `Severity ${f.severity} | Status ${f.status}`,
        status: f.status,
        occurredAt: f.alertTime.toISOString(),
        staffInvolved: uniqueNonEmpty([f.reportedBy, f.acknowledgedBy, f.resolvedBy]),
        audited: false,
        lastRecommendationAt: null,
      })),
      ...subStoreFaults.map((f) => ({
        id: `sub_store_fault__${f.id}`,
        sourceType: 'faults' as const,
        title: `${f.itemName} - ${f.faultType}`,
        summary: f.description,
        status: f.status,
        occurredAt: f.reportedAt.toISOString(),
        staffInvolved: uniqueNonEmpty([f.reportedById, f.acknowledgedById || undefined, f.resolvedById || undefined]),
        audited: false,
        lastRecommendationAt: null,
      })),
      ...plumbingFaults.map((f) => ({
        id: `plumbing_fault__${f.id}`,
        sourceType: 'faults' as const,
        title: `${f.title} (${f.location})`,
        summary: f.description,
        status: f.status,
        occurredAt: f.reportedAt.toISOString(),
        staffInvolved: uniqueNonEmpty([f.reportedByName, f.assignedToName, f.resolvedByName]),
        audited: false,
        lastRecommendationAt: null,
      })),
    ];

    const anonymousTipItems: AuditSectionItem[] = anonymousTips.map((t) => ({
      id: t.id,
      sourceType: 'anonymous_tips',
      title: `${t.category.replace(/_/g, ' ')} - ${t.location}`,
      summary: t.description,
      status: t.status,
      occurredAt: t.createdAt.toISOString(),
      staffInvolved: [],
      audited: false,
      lastRecommendationAt: null,
    }));

    const securityReportItems: AuditSectionItem[] = securityReports.map((s) => ({
      id: s.id,
      sourceType: 'security_reports',
      title: `${s.category.replace(/_/g, ' ')} - ${s.location}`,
      summary: s.description,
      status: s.status,
      occurredAt: s.createdAt.toISOString(),
      staffInvolved: uniqueNonEmpty([s.personsInvolved]),
      audited: false,
      lastRecommendationAt: null,
    }));

    const allForReviews = [
      ...cancellationsItems,
      ...incidentsItems,
      ...delayedTaskItems,
      ...delayedRosterItems,
      ...disciplinaryItems,
      ...mortalityItems,
      ...faultsItems,
      ...anonymousTipItems,
      ...securityReportItems,
    ];

    const reviewMap = await getReviewMap(allForReviews.map((x) => ({ sourceType: x.sourceType, id: x.id })));
    const withReviewState = (items: AuditSectionItem[]) =>
      items.map((item) => {
        const key = `${item.sourceType}:${item.id}`;
        const review = reviewMap.get(key);
        if (!review) return item;
        return {
          ...item,
          audited: item.audited || review.audited,
          lastRecommendationAt: item.lastRecommendationAt || review.lastRecommendationAt,
        };
      });

    const sections: Record<AuditSourceType, AuditSectionItem[]> = {
      cancellations: withReviewState(cancellationsItems),
      incidents: withReviewState(incidentsItems),
      delayed_tasks: withReviewState(delayedTaskItems),
      delayed_roster_submissions: withReviewState(delayedRosterItems),
      disciplinary_queries: withReviewState(disciplinaryItems),
      mortalities: withReviewState(mortalityItems),
      faults: withReviewState(faultsItems),
      anonymous_tips: withReviewState(anonymousTipItems),
      security_reports: withReviewState(securityReportItems),
    };

    if (section && section in sections) {
      return NextResponse.json({ section, items: sections[section as AuditSourceType] });
    }

    const totals = Object.fromEntries(
      Object.entries(sections).map(([k, items]) => [
        k,
        {
          count: items.length,
          audited: items.filter((i) => i.audited).length,
          pending: items.filter((i) => !i.audited).length,
        },
      ])
    );

    return NextResponse.json({ sections, totals });
  } catch (error) {
    console.error('Error fetching theatre audit data:', error);
    return NextResponse.json({ error: 'Failed to fetch theatre audit data' }, { status: 500 });
  }
}
