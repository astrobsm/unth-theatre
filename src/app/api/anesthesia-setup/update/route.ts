import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { triggerRadio } from '@/lib/radioEvents';
import { canCertifyReady, canDeclareNotReady } from '@/lib/theatreOps/setupCertification';

export const dynamic = 'force-dynamic';

const updateSetupSchema = z.object({
  setupLogId: z.string().min(1, 'Setup log ID is required'),
  gasSupplyChecked: z.boolean().optional(),
  suctionChecked: z.boolean().optional(),
  monitorsChecked: z.boolean().optional(),
  ventilatorChecked: z.boolean().optional(),
  anesthesiaMachineChecked: z.boolean().optional(),
  emergencyDrugsChecked: z.boolean().optional(),
  airwayEquipmentChecked: z.boolean().optional(),
  ivEquipmentChecked: z.boolean().optional(),
  setupNotes: z.string().optional(),
  blockingIssues: z.string().optional(),
  markAsReady: z.boolean().optional(),
  // The declaration, and which wording was agreed to. Both are required to
  // certify — an acknowledgement with no version attached is not evidence of
  // anything once the text is revised.
  declarationAcknowledged: z.boolean().optional(),
  declarationVersion: z.string().optional(),
  // The honest exit: standing a theatre down, with what is wrong.
  markNotReady: z.boolean().optional(),
  deficiency: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateSetupSchema.parse(body);

    // Get existing setup log
    const setupLog = await prisma.anesthesiaSetupLog.findUnique({
      where: { id: validatedData.setupLogId },
    });

    if (!setupLog) {
      return NextResponse.json(
        { error: 'Setup log not found' },
        { status: 404 }
      );
    }

    // Only the technician who created the log can update it
    if (setupLog.technicianId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'You can only update your own setup logs' },
        { status: 403 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    
    if (validatedData.gasSupplyChecked !== undefined) updateData.gasSupplyChecked = validatedData.gasSupplyChecked;
    if (validatedData.suctionChecked !== undefined) updateData.suctionChecked = validatedData.suctionChecked;
    if (validatedData.monitorsChecked !== undefined) updateData.monitorsChecked = validatedData.monitorsChecked;
    if (validatedData.ventilatorChecked !== undefined) updateData.ventilatorChecked = validatedData.ventilatorChecked;
    if (validatedData.anesthesiaMachineChecked !== undefined) updateData.anesthesiaMachineChecked = validatedData.anesthesiaMachineChecked;
    if (validatedData.emergencyDrugsChecked !== undefined) updateData.emergencyDrugsChecked = validatedData.emergencyDrugsChecked;
    if (validatedData.airwayEquipmentChecked !== undefined) updateData.airwayEquipmentChecked = validatedData.airwayEquipmentChecked;
    if (validatedData.ivEquipmentChecked !== undefined) updateData.ivEquipmentChecked = validatedData.ivEquipmentChecked;
    if (validatedData.setupNotes !== undefined) updateData.setupNotes = validatedData.setupNotes;
    if (validatedData.blockingIssues !== undefined) updateData.blockingIssues = validatedData.blockingIssues;

    // ── Standing the theatre down ───────────────────────────────────────────
    // Handled before certification and never gated on the checklist: a
    // technician who cannot finish the setup must have a route that is as easy
    // as the one that says everything is fine, or the only route that works is
    // the false one.
    if (validatedData.markNotReady) {
      const verdict = canDeclareNotReady({
        deficiency: validatedData.deficiency ?? '',
        technicianId: session.user.id,
      });
      if (!verdict.ok) {
        return NextResponse.json({ error: verdict.problem }, { status: 422 });
      }

      updateData.status = 'BLOCKED';
      updateData.isReady = false;
      updateData.blockingIssues = validatedData.deficiency!.trim();
      updateData.deficiencyReportedAt = new Date();
      updateData.deficiencyReportedById = session.user.id;
      // A theatre that is not ready is useless information if it stays on the
      // technician's own screen. The anaesthetic team is told at once.
      updateData.readyTime = null;
    }

    // ── Certifying it ready ─────────────────────────────────────────────────
    if (validatedData.markAsReady) {
      const verdict = canCertifyReady({
        checks: {
          gasSupplyChecked: updateData.gasSupplyChecked ?? setupLog.gasSupplyChecked,
          suctionChecked: updateData.suctionChecked ?? setupLog.suctionChecked,
          monitorsChecked: updateData.monitorsChecked ?? setupLog.monitorsChecked,
          ventilatorChecked: updateData.ventilatorChecked ?? setupLog.ventilatorChecked,
          anesthesiaMachineChecked: updateData.anesthesiaMachineChecked ?? setupLog.anesthesiaMachineChecked,
          emergencyDrugsChecked: updateData.emergencyDrugsChecked ?? setupLog.emergencyDrugsChecked,
          airwayEquipmentChecked: updateData.airwayEquipmentChecked ?? setupLog.airwayEquipmentChecked,
          ivEquipmentChecked: updateData.ivEquipmentChecked ?? setupLog.ivEquipmentChecked,
        },
        technicianId: session.user.id,
        // Read from THIS request, never from what is already stored: an
        // acknowledgement is a thing a person did just now, and treating a
        // previous one as standing consent is how the declaration becomes a
        // box that was ticked once, months ago, by somebody else.
        declarationAcknowledged: validatedData.declarationAcknowledged === true,
        declarationVersion: validatedData.declarationVersion ?? null,
      });

      if (!verdict.ok) {
        return NextResponse.json(
          { error: verdict.problems[0], problems: verdict.problems, outstanding: verdict.outstanding },
          { status: 422 },
        );
      }

      updateData.status = 'READY';
      updateData.isReady = true;
      updateData.readyTime = new Date();
      updateData.complianceAcknowledged = true;
      updateData.complianceAcknowledgedAt = new Date();
      updateData.complianceDeclarationVersion = validatedData.declarationVersion;
      updateData.blockingIssues = null;
      updateData.deficiencyReportedAt = null;
      updateData.deficiencyReportedById = null;
    }

    // Calculate duration if setting end time
    if (updateData.status === 'READY' && !setupLog.setupEndTime) {
      updateData.setupEndTime = new Date();
      const durationMs = updateData.setupEndTime.getTime() - setupLog.setupStartTime.getTime();
      updateData.durationMinutes = Math.floor(durationMs / 60000);
    }

    // Update setup log
    const updatedLog = await prisma.anesthesiaSetupLog.update({
      where: { id: validatedData.setupLogId },
      data: updateData,
    });

    // Theatre Radio: announce when theatre anaesthetic setup is ready
    if (validatedData.markAsReady && updateData.status === 'READY') {
      const theatreName = (updatedLog as any).theatreName || (setupLog as any).theatreName || 'Theatre';
      const technicianName = (setupLog as any).technicianName || session.user.name || 'Anaesthetic technician';
      const dur = (updateData as any).durationMinutes;
      await triggerRadio({
        category: 'CONFIRMATION',
        title: 'Theatre anaesthetic setup ready',
        message: `${theatreName} anaesthetic setup is complete and ready. Set up by ${technicianName}${dur ? ` in ${dur} minutes` : ''}. All anaesthesia equipment checked.`,
        location: theatreName,
        priority: 65,
        triggeredById: session.user.id,
        metadata: { setupLogId: updatedLog.id, theatreId: (updatedLog as any).theatreId },
      });
    }

    // A theatre standing down is more urgent than one coming ready, and it is
    // useless information if it stays on the technician's own screen — the
    // anaesthetist and the coordinator are the people who have to decide
    // whether the case moves room or waits.
    if (validatedData.markNotReady && updateData.status === 'BLOCKED') {
      const theatreName = (updatedLog as any).theatreName || (setupLog as any).theatreName || 'Theatre';
      const technicianName = (setupLog as any).technicianName || session.user.name || 'Anaesthetic technician';
      await triggerRadio({
        category: 'WORKFLOW',
        title: 'Theatre NOT ready',
        message: `${theatreName} is NOT ready. ${updateData.blockingIssues} Reported by ${technicianName}.`,
        location: theatreName,
        // Above the "setup ready" confirmation deliberately: a room that
        // cannot be used changes what everybody does next.
        priority: 90,
        triggeredById: session.user.id,
        metadata: { setupLogId: updatedLog.id, theatreId: (updatedLog as any).theatreId, deficiency: updateData.blockingIssues },
      }).catch(() => {
        // The radio failing must not lose the record that the theatre was
        // stood down — the row is already written by this point.
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'anesthesia_setup_logs',
        recordId: updatedLog.id,
        changes: JSON.stringify({
          status: { from: setupLog.status, to: updateData.status ?? setupLog.status },
          // The certification is the part asked about afterwards: who said this
          // theatre was ready, when, and against which wording.
          ...(validatedData.markAsReady
            ? {
                certifiedBy: { userId: session.user.id, role: (session.user as { role?: string }).role },
                declarationVersion: validatedData.declarationVersion,
              }
            : {}),
          ...(validatedData.markNotReady ? { deficiency: updateData.blockingIssues } : {}),
        }),
      },
    }).catch(() => {});

    return NextResponse.json(
      {
        message: 'Setup log updated successfully',
        setupLog: updatedLog,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating setup log:', error);
    return NextResponse.json(
      { error: 'Failed to update setup log' },
      { status: 500 }
    );
  }
}
