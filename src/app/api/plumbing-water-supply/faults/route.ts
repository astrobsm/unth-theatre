import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// ===== Plumbing Fault Schema =====
const createFaultSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  category: z.enum([
    'LEAK', 'BLOCKAGE', 'BURST_PIPE', 'LOW_PRESSURE', 'NO_WATER',
    'HOT_WATER_ISSUE', 'DRAINAGE', 'SEWAGE', 'FIXTURE_DAMAGE',
    'VALVE_ISSUE', 'TANK_ISSUE', 'PUMP_FAILURE', 'OTHER'
  ]),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  location: z.string().min(1, 'Location is required'),
  floor: z.string().optional(),
  building: z.string().optional(),
  affectsTheatreOps: z.boolean().default(false),
  theatresAffected: z.array(z.string()).optional(),
  notes: z.string().optional(),
  photoUrl: z.string().optional(),
});

// GET - Fetch list of plumbing faults
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const category = searchParams.get('category');
    const myFaults = searchParams.get('myFaults') === 'true';

    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;
    if (myFaults) {
      where.OR = [
        { reportedById: session.user.id },
        { assignedToId: session.user.id },
      ];
    }

    const faults = await prisma.plumbingFault.findMany({
      where,
      include: {
        reportedBy: { select: { id: true, fullName: true, role: true } },
        assignedTo: { select: { id: true, fullName: true, role: true } },
        acknowledgedBy: { select: { id: true, fullName: true } },
        resolvedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [
        { priority: 'asc' },
        { reportedAt: 'desc' },
      ],
    });

    return NextResponse.json(faults);
  } catch (error) {
    console.error('Error fetching plumbing faults:', error);
    return NextResponse.json([]);
  }
}

// POST - Report a new plumbing fault
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = createFaultSchema.parse(body);

    const fault = await prisma.plumbingFault.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority,
        location: data.location,
        floor: data.floor,
        building: data.building,
        reportedById: session.user.id,
        reportedByName: session.user.name || '',
        affectsTheatreOps: data.affectsTheatreOps,
        theatresAffected: data.theatresAffected ? JSON.stringify(data.theatresAffected) : null,
        photoUrl: data.photoUrl,
        notes: data.notes,
        status: 'REPORTED',
      },
      include: {
        reportedBy: { select: { fullName: true, role: true } },
      },
    });

    // Notify plumbing/works staff (non-blocking)
    try {
      const plumbingStaff = await prisma.user.findMany({
        where: {
          role: { in: ['PLUMBER', 'WORKS_SUPERVISOR'] },
          status: 'APPROVED',
        },
        select: { id: true },
      });

      const notifPromises = plumbingStaff.map(staff =>
        prisma.notification.create({
          data: {
            userId: staff.id,
            type: 'PLUMBING_FAULT',
            title: `🔧 ${data.priority} Plumbing Fault: ${data.title}`,
            message: `${data.category.replace(/_/g, ' ')} at ${data.location}. ${data.description}. ${data.affectsTheatreOps ? '⚠️ AFFECTS THEATRE OPERATIONS' : ''}`,
            link: '/dashboard/plumbing-water-supply',
          },
        })
      );

      // If critical and affects theatre ops, also notify management  
      if (data.priority === 'CRITICAL' || data.affectsTheatreOps) {
        const mgmt = await prisma.user.findMany({
          where: {
            role: { in: ['THEATRE_MANAGER', 'ADMIN', 'CHIEF_MEDICAL_DIRECTOR'] },
            status: 'APPROVED',
          },
          select: { id: true },
        });

        const mgmtNotifs = mgmt.map(m =>
          prisma.notification.create({
            data: {
              userId: m.id,
              type: 'PLUMBING_CRITICAL',
              title: `🚨 CRITICAL Plumbing Fault: ${data.title}`,
              message: `${data.category.replace(/_/g, ' ')} at ${data.location}. ${data.affectsTheatreOps ? 'Theatre operations affected!' : ''} ${data.description}`,
              link: '/dashboard/plumbing-water-supply',
            },
          })
        );
        notifPromises.push(...mgmtNotifs);
      }

      await Promise.all(notifPromises);
    } catch (notifError) {
      console.error('Error sending plumbing fault notifications:', notifError);
    }

    // Audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          tableName: 'PlumbingFault',
          recordId: fault.id,
          changes: JSON.stringify({
            title: data.title,
            category: data.category,
            priority: data.priority,
            location: data.location,
            affectsTheatreOps: data.affectsTheatreOps,
          }),
        },
      });
    } catch (auditError) {
      console.error('Error creating audit log for plumbing fault:', auditError);
    }

    return NextResponse.json(fault, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error creating plumbing fault:', error);
    const message = error instanceof Error ? error.message : 'Failed to report plumbing fault';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
