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

type TimelineEvent = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  actor?: string;
};

function parseJsonChanges(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function ensureSorted(events: TimelineEvent[]) {
  return [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

async function getReviewHistory(sourceType: string, id: string) {
  const recordId = `${sourceType}:${id}`;
  const reviews = await prisma.auditLog.findMany({
    where: {
      tableName: 'theatre_audit_reviews',
      recordId,
      action: 'THEATRE_AUDIT_REVIEW',
    },
    include: {
      user: { select: { fullName: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return reviews.map((r) => {
    const parsed = parseJsonChanges(r.changes);
    return {
      id: r.id,
      reviewedAt: r.createdAt.toISOString(),
      reviewedBy: r.user?.fullName || 'Unknown reviewer',
      reviewerRole: r.user?.role || '',
      recommendation: parsed?.recommendation || '',
      committeeStatus: parsed?.committeeStatus || 'AUDITED',
      actionPoints: parsed?.actionPoints || '',
      faultSummary: parsed?.faultSummary || '',
    };
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { sourceType: string; id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ADMIN_AUDIT_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { sourceType, id } = params;
    let entry: any = null;
    let timeline: (TimelineEvent | null)[] = [];
    let staffInvolved: string[] = [];

    if (sourceType === 'cancellations') {
      const item = await prisma.caseCancellation.findUnique({
        where: { id },
        include: {
          surgery: {
            include: {
              patient: true,
              surgeon: { select: { fullName: true } },
              surgicalTiming: true,
              movements: true,
            },
          },
          user: { select: { fullName: true } },
        },
      });
      if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

      entry = {
        id: item.id,
        sourceType,
        title: `${item.surgery.patient?.name || 'Unknown patient'} - ${item.surgery.procedureName}`,
        status: 'CANCELLED',
        occurredAt: item.cancelledAt,
        details: item,
      };
      staffInvolved = [item.user?.fullName, item.surgery.surgeon?.fullName, item.surgery.surgeonName].filter(Boolean) as string[];
      timeline.push(
        {
          id: 'cancelled',
          title: 'Case Cancelled',
          description: `${item.reason}\n${item.detailedNotes || ''}`.trim(),
          timestamp: item.cancelledAt.toISOString(),
          actor: item.user?.fullName || 'Unknown',
        },
        ...item.surgery.movements.map((m) => ({
          id: `movement-${m.id}`,
          title: `Patient movement: ${m.phase.replace(/_/g, ' ')}`,
          description: m.notes || 'Movement recorded',
          timestamp: m.timestamp.toISOString(),
          actor: m.recordedBy || undefined,
        }))
      );
    } else if (sourceType === 'incidents') {
      const item = await prisma.incidentReport.findUnique({
        where: { id },
        include: {
          reportedBy: { select: { fullName: true } },
          investigatedBy: { select: { fullName: true } },
          verifiedBy: { select: { fullName: true } },
        },
      });
      if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

      entry = {
        id: item.id,
        sourceType,
        title: `${item.incidentType.replace(/_/g, ' ')} - ${item.location}`,
        status: item.status,
        occurredAt: item.incidentDate,
        details: item,
      };
      staffInvolved = [
        item.reportedBy?.fullName,
        item.investigatedBy?.fullName,
        item.verifiedBy?.fullName,
        item.responsiblePerson,
      ].filter(Boolean) as string[];

      timeline.push({
        id: 'reported',
        title: 'Incident Reported',
        description: item.description,
        timestamp: item.incidentDate.toISOString(),
        actor: item.reportedBy?.fullName || 'Unknown',
      });
      if (item.investigationDate) {
        timeline.push({
          id: 'investigated',
          title: 'Incident Investigated',
          description: item.investigationNotes || 'Investigation completed',
          timestamp: item.investigationDate.toISOString(),
          actor: item.investigatedBy?.fullName || 'Unknown investigator',
        });
      }
      if (item.verifiedAt) {
        timeline.push({
          id: 'verified',
          title: 'Incident Verified',
          description: item.verificationNotes || 'Verification completed',
          timestamp: item.verifiedAt.toISOString(),
          actor: item.verifiedBy?.fullName || 'Unknown verifier',
        });
      }
    } else if (sourceType === 'delayed_tasks' || sourceType === 'disciplinary_queries') {
      const item = await prisma.disciplinaryQuery.findUnique({ where: { id } });
      if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

      entry = {
        id: item.id,
        sourceType,
        title: `${item.referenceNumber} - ${item.recipientName}`,
        status: item.status,
        occurredAt: item.createdAt,
        details: item,
      };
      staffInvolved = [item.recipientName, item.issuedByName].filter(Boolean) as string[];
      timeline.push(
        {
          id: 'issued',
          title: 'Query Issued',
          description: item.subject,
          timestamp: item.createdAt.toISOString(),
          actor: item.issuedByName,
        },
        item.respondedAt
          ? {
              id: 'responded',
              title: 'Recipient Response',
              description: item.recipientResponse || 'Response submitted',
              timestamp: item.respondedAt.toISOString(),
              actor: item.recipientName,
            }
          : null,
        item.escalatedAt
          ? {
              id: 'escalated',
              title: 'Query Escalated',
              description: item.escalationReason || 'Escalated',
              timestamp: item.escalatedAt.toISOString(),
              actor: item.issuedByName,
            }
          : null,
        item.resolvedAt
          ? {
              id: 'resolved',
              title: 'Query Resolved',
              description: item.resolution || 'Resolved',
              timestamp: item.resolvedAt.toISOString(),
              actor: item.issuedByName,
            }
          : null
      );
      timeline = timeline.filter(Boolean) as TimelineEvent[];
    } else if (sourceType === 'mortalities') {
      const item = await prisma.mortality.findUnique({
        where: { id },
        include: {
          patient: true,
          surgery: {
            include: {
              surgeon: { select: { fullName: true } },
              surgicalTiming: true,
            },
          },
          audit: true,
        },
      });
      if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

      entry = {
        id: item.id,
        sourceType,
        title: `${item.patient?.name || 'Unknown patient'} - Mortality`,
        status: item.audit ? 'AUDITED' : 'PENDING_AUDIT',
        occurredAt: item.timeOfDeath,
        details: item,
      };
      staffInvolved = [item.surgery?.surgeon?.fullName, item.surgery?.surgeonName].filter(Boolean) as string[];
      timeline.push({
        id: 'death',
        title: 'Time of Death Recorded',
        description: item.causeOfDeath,
        timestamp: item.timeOfDeath.toISOString(),
      });
      if (item.audit) {
        timeline.push({
          id: 'mortality-audit',
          title: 'Mortality Audit Completed',
          description: item.audit.recommendations || item.audit.findings,
          timestamp: item.audit.createdAt.toISOString(),
          actor: item.audit.reviewedBy,
        });
      }
    } else if (sourceType === 'faults') {
      const [kind, realId] = id.split('__');
      if (!kind || !realId) {
        return NextResponse.json({ error: 'Invalid fault id' }, { status: 400 });
      }

      if (kind === 'fault_report') {
        const item = await prisma.faultReport.findUnique({ where: { id: realId } });
        if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        entry = {
          id,
          sourceType,
          title: `${item.faultType} fault`,
          status: item.status,
          occurredAt: item.createdAt,
          details: item,
        };
        staffInvolved = [item.reportedBy, item.acknowledgedBy, item.resolvedBy, item.closedBy].filter(Boolean) as string[];
        timeline.push(
          {
            id: 'fault-reported',
            title: 'Fault Reported',
            description: item.description,
            timestamp: item.createdAt.toISOString(),
            actor: item.reportedBy,
          },
          item.acknowledgedAt
            ? {
                id: 'fault-ack',
                title: 'Fault Acknowledged',
                description: 'Acknowledged by responsible unit',
                timestamp: item.acknowledgedAt.toISOString(),
                actor: item.acknowledgedBy || undefined,
              }
            : null,
          item.resolvedAt
            ? {
                id: 'fault-resolved',
                title: 'Fault Resolved',
                description: item.resolution || 'Resolution recorded',
                timestamp: item.resolvedAt.toISOString(),
                actor: item.resolvedBy || undefined,
              }
            : null,
          item.closedAt
            ? {
                id: 'fault-closed',
                title: 'Fault Closed',
                description: 'Case closed after review',
                timestamp: item.closedAt.toISOString(),
                actor: item.closedBy || undefined,
              }
            : null
        );
      } else if (kind === 'equipment_fault_alert') {
        const item = await prisma.equipmentFaultAlert.findUnique({ where: { id: realId } });
        if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        entry = {
          id,
          sourceType,
          title: `${item.itemName} fault alert`,
          status: item.status,
          occurredAt: item.alertTime,
          details: item,
        };
        staffInvolved = [item.reportedBy, item.acknowledgedBy, item.resolvedBy].filter(Boolean) as string[];
        timeline.push(
          {
            id: 'efa-reported',
            title: 'Equipment Fault Alert Triggered',
            description: item.faultDescription,
            timestamp: item.alertTime.toISOString(),
            actor: item.reportedBy,
          },
          item.acknowledgedAt
            ? {
                id: 'efa-ack',
                title: 'Alert Acknowledged',
                description: 'Acknowledgement recorded',
                timestamp: item.acknowledgedAt.toISOString(),
                actor: item.acknowledgedBy || undefined,
              }
            : null,
          item.resolvedAt
            ? {
                id: 'efa-resolved',
                title: 'Fault Resolved',
                description: item.resolutionNotes || 'Resolution recorded',
                timestamp: item.resolvedAt.toISOString(),
                actor: item.resolvedBy || undefined,
              }
            : null
        );
      } else if (kind === 'sub_store_fault') {
        const item = await prisma.subStoreItemFault.findUnique({ where: { id: realId } });
        if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        entry = {
          id,
          sourceType,
          title: `${item.itemName} sub-store fault`,
          status: item.status,
          occurredAt: item.reportedAt,
          details: item,
        };
        staffInvolved = [item.reportedById, item.acknowledgedById, item.resolvedById].filter(Boolean) as string[];
        timeline.push({
          id: 'ssf-reported',
          title: 'Sub-store Fault Reported',
          description: item.description,
          timestamp: item.reportedAt.toISOString(),
          actor: item.reportedById,
        });
      } else if (kind === 'plumbing_fault') {
        const item = await prisma.plumbingFault.findUnique({ where: { id: realId } });
        if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        entry = {
          id,
          sourceType,
          title: item.title,
          status: item.status,
          occurredAt: item.reportedAt,
          details: item,
        };
        staffInvolved = [item.reportedByName, item.assignedToName, item.resolvedByName].filter(Boolean) as string[];
        timeline.push(
          {
            id: 'plumbing-reported',
            title: 'Plumbing Fault Reported',
            description: item.description,
            timestamp: item.reportedAt.toISOString(),
            actor: item.reportedByName,
          },
          item.acknowledgedAt
            ? {
                id: 'plumbing-ack',
                title: 'Fault Acknowledged',
                description: 'Acknowledged for action',
                timestamp: item.acknowledgedAt.toISOString(),
              }
            : null,
          item.resolvedAt
            ? {
                id: 'plumbing-resolved',
                title: 'Fault Resolved',
                description: item.resolutionNotes || 'Resolution recorded',
                timestamp: item.resolvedAt.toISOString(),
                actor: item.resolvedByName || undefined,
              }
            : null
        );
      } else {
        return NextResponse.json({ error: 'Unsupported fault subtype' }, { status: 400 });
      }
      timeline = timeline.filter(Boolean) as TimelineEvent[];
    } else if (sourceType === 'anonymous_tips') {
      const item = await prisma.anonymousTip.findUnique({ where: { id } });
      if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      entry = {
        id: item.id,
        sourceType,
        title: `${item.category.replace(/_/g, ' ')} - ${item.location}`,
        status: item.status,
        occurredAt: item.createdAt,
        details: item,
      };
      timeline.push(
        {
          id: 'tip-submitted',
          title: 'Anonymous Tip Submitted',
          description: item.description,
          timestamp: item.createdAt.toISOString(),
        },
        item.resolvedAt
          ? {
              id: 'tip-resolved',
              title: 'Tip Marked Resolved',
              description: item.actionTaken || item.adminNotes || 'Resolved after review',
              timestamp: item.resolvedAt.toISOString(),
            }
          : null
      );
      timeline = timeline.filter(Boolean) as TimelineEvent[];
    } else if (sourceType === 'security_reports') {
      const item = await prisma.securityReport.findUnique({ where: { id } });
      if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      entry = {
        id: item.id,
        sourceType,
        title: `${item.category.replace(/_/g, ' ')} - ${item.location}`,
        status: item.status,
        occurredAt: item.createdAt,
        details: item,
      };
      staffInvolved = [item.personsInvolved || ''].filter(Boolean) as string[];
      timeline.push(
        {
          id: 'security-submitted',
          title: 'Security Report Submitted',
          description: item.description,
          timestamp: item.createdAt.toISOString(),
        },
        item.resolvedAt
          ? {
              id: 'security-resolved',
              title: 'Security Report Resolved',
              description: item.actionTaken || item.adminNotes || 'Resolved after review',
              timestamp: item.resolvedAt.toISOString(),
            }
          : null
      );
      timeline = timeline.filter(Boolean) as TimelineEvent[];
    } else if (sourceType === 'delayed_roster_submissions') {
      const item = await prisma.roster.findUnique({
        where: { id },
        include: {
          user: { select: { fullName: true } },
          theatre: { select: { name: true } },
        },
      });
      if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

      const monday = new Date(item.date);
      const day = monday.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      monday.setDate(monday.getDate() + diff);
      monday.setHours(0, 0, 0, 0);
      const deadline = new Date(monday);
      deadline.setDate(deadline.getDate() - 2);
      deadline.setHours(16, 0, 0, 0);

      entry = {
        id: item.id,
        sourceType,
        title: `${item.staffName} (${item.staffCategory.replace(/_/g, ' ')})`,
        status: 'LATE_SUBMISSION',
        occurredAt: item.uploadedAt,
        details: {
          ...item,
          computedDeadline: deadline,
        },
      };
      staffInvolved = [item.user?.fullName, item.staffName].filter(Boolean) as string[];
      timeline.push(
        {
          id: 'deadline',
          title: 'Roster Submission Deadline',
          description: 'Saturday 4:00 PM weekly submission cut-off',
          timestamp: deadline.toISOString(),
        },
        {
          id: 'submitted',
          title: 'Roster Entry Uploaded',
          description: `${item.shift} shift | ${item.theatre?.name || 'No theatre assigned'}`,
          timestamp: item.uploadedAt.toISOString(),
          actor: item.uploadedBy,
        }
      );
    } else if (sourceType === 'late_first_case') {
      const item = await prisma.surgery.findUnique({
        where: { id },
        select: {
          id: true,
          unit: true,
          location: true,
          procedureName: true,
          scheduledDate: true,
          scheduledTime: true,
          knifeOnSkinTime: true,
          surgeryEndTime: true,
          surgeonName: true,
          patient: { select: { name: true, folderNumber: true } },
          surgeon: { select: { fullName: true } },
          anesthetist: { select: { fullName: true } },
        },
      });
      if (!item) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      if (!item.knifeOnSkinTime) {
        return NextResponse.json({ error: 'No knife-on-skin time recorded for this case' }, { status: 404 });
      }

      const kos = new Date(item.knifeOnSkinTime);
      const target = new Date(kos);
      target.setHours(9, 25, 0, 0);
      const minutesLate = Math.max(0, Math.round((kos.getTime() - target.getTime()) / 60000));
      const startStr = kos.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      entry = {
        id: item.id,
        sourceType,
        title: `${item.unit || 'Unspecified Unit'} - First case late start`,
        status: 'LATE_START',
        occurredAt: item.knifeOnSkinTime,
        details: {
          ...item,
          targetStart: '09:25',
          actualStart: startStr,
          minutesLate,
        },
      };
      staffInvolved = [item.surgeon?.fullName, item.surgeonName, item.anesthetist?.fullName].filter(
        Boolean
      ) as string[];
      timeline.push(
        {
          id: 'target',
          title: 'Target First Knife-on-Skin',
          description: '09:25 AM daily target for the first case of each unit',
          timestamp: target.toISOString(),
        },
        {
          id: 'knife',
          title: 'Actual First Knife-on-Skin',
          description: `${item.procedureName}${item.patient?.name ? ` — ${item.patient.name}` : ''} (${minutesLate} min after target)`,
          timestamp: item.knifeOnSkinTime.toISOString(),
        },
        item.surgeryEndTime
          ? {
              id: 'end',
              title: 'Surgery Ended',
              description: 'End of first case',
              timestamp: item.surgeryEndTime.toISOString(),
            }
          : null
      );
      timeline = timeline.filter(Boolean) as TimelineEvent[];
    } else {
      return NextResponse.json({ error: 'Unsupported source type' }, { status: 400 });
    }

    const relatedAuditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { tableName: sourceType, recordId: id },
          { tableName: sourceType.replace(/_/g, ''), recordId: id },
        ],
      },
      include: {
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 120,
    });

    timeline.push(
      ...relatedAuditLogs.map((log) => ({
        id: `audit-log-${log.id}`,
        title: `System Action: ${log.action.replace(/_/g, ' ')}`,
        description: log.changes || 'Audit log entry',
        timestamp: log.createdAt.toISOString(),
        actor: log.user?.fullName || undefined,
      }))
    );

    const reviewHistory = await getReviewHistory(sourceType, id);

    return NextResponse.json({
      entry,
      staffInvolved: Array.from(new Set(staffInvolved.filter(Boolean))),
      timeline: ensureSorted(timeline.filter(Boolean) as TimelineEvent[]),
      reviewHistory,
      latestReview: reviewHistory[0] || null,
      audited: reviewHistory.length > 0,
    });
  } catch (error) {
    console.error('Error fetching theatre audit detail:', error);
    return NextResponse.json({ error: 'Failed to fetch theatre audit detail' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { sourceType: string; id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ADMIN_AUDIT_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { sourceType, id } = params;
    const body = await request.json();

    const recommendation = String(body.recommendation || '').trim();
    const committeeStatus = String(body.committeeStatus || '').trim();
    const actionPoints = String(body.actionPoints || '').trim();
    const faultSummary = String(body.faultSummary || '').trim();

    if (recommendation.length < 10) {
      return NextResponse.json(
        { error: 'Recommendation should be at least 10 characters' },
        { status: 400 }
      );
    }

    const payload = {
      sourceType,
      sourceId: id,
      recommendation,
      committeeStatus: committeeStatus || 'AUDITED',
      actionPoints,
      faultSummary,
    };

    const log = await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'THEATRE_AUDIT_REVIEW',
        tableName: 'theatre_audit_reviews',
        recordId: `${sourceType}:${id}`,
        changes: JSON.stringify(payload),
      },
      include: {
        user: { select: { fullName: true, role: true } },
      },
    });

    return NextResponse.json({
      id: log.id,
      reviewedAt: log.createdAt,
      reviewedBy: log.user?.fullName || '',
      reviewerRole: log.user?.role || '',
      ...payload,
    });
  } catch (error) {
    console.error('Error saving theatre audit recommendation:', error);
    return NextResponse.json({ error: 'Failed to save audit recommendation' }, { status: 500 });
  }
}
