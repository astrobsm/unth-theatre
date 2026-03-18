import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - Fetch a specific emergency lab request
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const labRequest = await prisma.emergencyLabRequest.findUnique({
      where: { id: params.id },
      include: {
        requestedBy: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
        emergencyBooking: true,
        surgery: {
          include: {
            patient: true,
            surgeon: { select: { fullName: true, role: true } },
            anesthetist: { select: { fullName: true, role: true } },
          },
        },
        labTests: {
          include: {
            sampleCollectedBy: { select: { fullName: true } },
            receivedByLab: { select: { fullName: true } },
            resultEnteredBy: { select: { fullName: true } },
            resultVerifiedBy: { select: { fullName: true } },
          },
        },
        labNotifications: true,
      },
    });

    if (!labRequest) {
      return NextResponse.json({ error: 'Lab request not found' }, { status: 404 });
    }

    return NextResponse.json(labRequest);
  } catch (error) {
    console.error('Error fetching lab request:', error);
    return NextResponse.json({ error: 'Failed to fetch lab request' }, { status: 500 });
  }
}

// PATCH - Update lab request / test status (sample collection, results entry, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, testId, ...data } = body;

    switch (action) {
      // Lab staff collects sample
      case 'COLLECT_SAMPLE': {
        if (!testId) {
          return NextResponse.json({ error: 'testId is required' }, { status: 400 });
        }

        await prisma.emergencyLabTest.update({
          where: { id: testId },
          data: {
            sampleCollected: true,
            sampleCollectedAt: new Date(),
            sampleCollectedById: session.user.id,
            sampleBarcode: data.sampleBarcode || null,
            status: 'SAMPLE_COLLECTED',
          },
        });

        // Check if all samples collected
        const allTests = await prisma.emergencyLabTest.findMany({
          where: { emergencyLabRequestId: params.id },
        });
        const allCollected = allTests.every(t => t.sampleCollected);
        if (allCollected) {
          await prisma.emergencyLabRequest.update({
            where: { id: params.id },
            data: { status: 'SAMPLE_COLLECTED' },
          });
        } else {
          await prisma.emergencyLabRequest.update({
            where: { id: params.id },
            data: { status: 'SAMPLE_COLLECTION_DISPATCHED' },
          });
        }

        return NextResponse.json({ message: 'Sample collected successfully' });
      }

      // Lab receives sample
      case 'RECEIVE_SAMPLE': {
        if (!testId) {
          return NextResponse.json({ error: 'testId is required' }, { status: 400 });
        }

        await prisma.emergencyLabTest.update({
          where: { id: testId },
          data: {
            receivedAtLabAt: new Date(),
            receivedByLabId: session.user.id,
            status: 'SAMPLE_RECEIVED_AT_LAB',
          },
        });

        // Check if all received
        const allTestsRcv = await prisma.emergencyLabTest.findMany({
          where: { emergencyLabRequestId: params.id },
        });
        const allReceived = allTestsRcv.every(t => t.receivedAtLabAt);
        if (allReceived) {
          await prisma.emergencyLabRequest.update({
            where: { id: params.id },
            data: { status: 'SAMPLE_RECEIVED_AT_LAB' },
          });
        }

        return NextResponse.json({ message: 'Sample received at lab' });
      }

      // Lab scientist starts processing
      case 'START_PROCESSING': {
        if (!testId) {
          return NextResponse.json({ error: 'testId is required' }, { status: 400 });
        }

        await prisma.emergencyLabTest.update({
          where: { id: testId },
          data: {
            processingStartedAt: new Date(),
            status: 'PROCESSING',
          },
        });

        await prisma.emergencyLabRequest.update({
          where: { id: params.id },
          data: { status: 'PROCESSING' },
        });

        return NextResponse.json({ message: 'Processing started' });
      }

      // Lab scientist enters results
      case 'ENTER_RESULTS': {
        if (!testId) {
          return NextResponse.json({ error: 'testId is required' }, { status: 400 });
        }

        const test = await prisma.emergencyLabTest.findUnique({
          where: { id: testId },
          include: { emergencyLabRequest: { select: { requestedAt: true } } },
        });

        const requestedAt = test?.emergencyLabRequest?.requestedAt;
        const turnaround = requestedAt
          ? Math.round((new Date().getTime() - new Date(requestedAt).getTime()) / 60000)
          : null;

        await prisma.emergencyLabTest.update({
          where: { id: testId },
          data: {
            resultValue: data.resultValue,
            resultUnit: data.resultUnit || null,
            referenceRange: data.referenceRange || null,
            abnormalResult: data.abnormalResult || false,
            criticalResult: data.criticalResult || false,
            resultNotes: data.resultNotes || null,
            resultAttachment: data.resultAttachment || null,
            resultEnteredById: session.user.id,
            resultEnteredAt: new Date(),
            status: 'RESULTS_READY',
            turnaroundMinutes: turnaround,
          },
        });

        // Check if all results are in
        const allTestsRes = await prisma.emergencyLabTest.findMany({
          where: { emergencyLabRequestId: params.id },
        });
        const allResultsReady = allTestsRes.every(t =>
          t.id === testId ? true : t.resultValue !== null
        );

        if (allResultsReady) {
          await prisma.emergencyLabRequest.update({
            where: { id: params.id },
            data: { status: 'RESULTS_READY' },
          });
        }

        // Get the lab request to find associated surgery & notify surgeon/anaesthetist
        const labReq = await prisma.emergencyLabRequest.findUnique({
          where: { id: params.id },
          include: {
            surgery: {
              select: { surgeonId: true, anesthetistId: true },
            },
            emergencyBooking: {
              select: { surgeonId: true, anesthetistId: true },
            },
          },
        });

        const surgeonId = labReq?.surgery?.surgeonId || labReq?.emergencyBooking?.surgeonId;
        const anesthetistId = labReq?.surgery?.anesthetistId || labReq?.emergencyBooking?.anesthetistId;

        const resultStatus = data.criticalResult ? 'CRITICAL' : (data.abnormalResult ? 'ABNORMAL' : 'NORMAL');
        const urgencyEmoji = data.criticalResult ? '🚨' : (data.abnormalResult ? '⚠️' : '✅');

        const notifyUsers = [surgeonId, anesthetistId].filter(Boolean) as string[];
        const notificationPromises = notifyUsers.map(userId =>
          prisma.notification.create({
            data: {
              userId,
              type: 'EMERGENCY_LAB_RESULT',
              title: `${urgencyEmoji} Lab Result: ${data.resultValue ? resultStatus : 'Ready'}`,
              message: `Lab result for ${labReq?.patientName} (${labReq?.folderNumber}): ${data.testName || 'Test'} = ${data.resultValue} ${data.resultUnit || ''}. ${data.criticalResult ? 'CRITICAL VALUE - IMMEDIATE ACTION REQUIRED' : ''}`,
              link: `/dashboard/emergency-lab-workup/${params.id}`,
            },
          })
        );

        // Also create voice notification for critical results
        if (data.criticalResult) {
          const voiceNotifications = notifyUsers.map(userId =>
            prisma.emergencyLabNotification.create({
              data: {
                emergencyLabRequestId: params.id,
                recipientId: userId,
                recipientRole: userId === surgeonId ? 'SURGEON' : 'ANAESTHETIST',
                notificationType: 'CRITICAL_RESULT',
                isVoiceNotification: true,
                voiceMessage: `CRITICAL LAB RESULT for patient ${labReq?.patientName}. Test: ${data.testName || 'Unknown'}. Value: ${data.resultValue}. Immediate action required!`,
                isPushNotification: true,
                pushTitle: '🚨 CRITICAL LAB RESULT',
                pushMessage: `${labReq?.patientName}: ${data.testName || 'Test'} = ${data.resultValue} - CRITICAL!`,
              },
            })
          );
          await Promise.all(voiceNotifications);
        }

        await Promise.all(notificationPromises);

        return NextResponse.json({ message: 'Results entered and clinical team notified' });
      }

      // Surgeon/Anaesthetist views results
      case 'VIEW_RESULTS': {
        if (!testId) {
          return NextResponse.json({ error: 'testId is required' }, { status: 400 });
        }

        const updateData: any = {};
        if (['SURGEON'].includes(session.user.role)) {
          updateData.viewedBySurgeon = true;
          updateData.viewedBySurgeonAt = new Date();
        }
        if (['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'].includes(session.user.role)) {
          updateData.viewedByAnaesthetist = true;
          updateData.viewedByAnaesthetistAt = new Date();
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.emergencyLabTest.update({
            where: { id: testId },
            data: updateData,
          });
        }

        // Check if all results viewed
        const allTestsView = await prisma.emergencyLabTest.findMany({
          where: { emergencyLabRequestId: params.id },
        });
        const allViewed = allTestsView.every(t =>
          t.viewedBySurgeon || t.viewedByAnaesthetist
        );
        if (allViewed) {
          await prisma.emergencyLabRequest.update({
            where: { id: params.id },
            data: { status: 'RESULTS_VIEWED' },
          });
        }

        return NextResponse.json({ message: 'Results viewed' });
      }

      // Lab scientist acknowledges request
      case 'ACKNOWLEDGE': {
        await prisma.emergencyLabRequest.update({
          where: { id: params.id },
          data: {
            status: 'ACKNOWLEDGED',
            acknowledgedById: session.user.id,
            acknowledgedAt: new Date(),
          },
        });

        // Notify requesting clinician
        const labReqAck = await prisma.emergencyLabRequest.findUnique({
          where: { id: params.id },
          select: { 
            requestedById: true, patientName: true, folderNumber: true, priority: true,
            surgery: { select: { surgeonId: true, anesthetistId: true } },
            emergencyBooking: { select: { surgeonId: true, anesthetistId: true } },
          },
        });

        if (labReqAck) {
          const notifyIds = new Set<string>();
          notifyIds.add(labReqAck.requestedById);
          if (labReqAck.surgery?.surgeonId) notifyIds.add(labReqAck.surgery.surgeonId);
          if (labReqAck.surgery?.anesthetistId) notifyIds.add(labReqAck.surgery.anesthetistId);
          if (labReqAck.emergencyBooking?.surgeonId) notifyIds.add(labReqAck.emergencyBooking.surgeonId);
          if (labReqAck.emergencyBooking?.anesthetistId) notifyIds.add(labReqAck.emergencyBooking.anesthetistId);

          await Promise.all(
            Array.from(notifyIds).map(userId =>
              prisma.notification.create({
                data: {
                  userId,
                  type: 'EMERGENCY_LAB_WORKUP',
                  title: `✅ Lab Acknowledged: ${labReqAck.patientName}`,
                  message: `Lab has acknowledged emergency workup for ${labReqAck.patientName} (${labReqAck.folderNumber}). Sample collection in progress.`,
                  link: '/dashboard/emergency-lab-workup',
                },
              })
            )
          );
        }

        // Audit log
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'UPDATE',
            tableName: 'EmergencyLabRequest',
            recordId: params.id,
            changes: JSON.stringify({ action: 'ACKNOWLEDGE', acknowledgedBy: session.user.name }),
          },
        });

        return NextResponse.json({ message: 'Request acknowledged by lab' });
      }

      // Lab scientist acknowledges + collects all samples at once
      case 'ACKNOWLEDGE_AND_COLLECT_ALL': {
        await prisma.emergencyLabRequest.update({
          where: { id: params.id },
          data: {
            status: 'SAMPLE_COLLECTED',
            acknowledgedById: session.user.id,
            acknowledgedAt: new Date(),
          },
        });

        await prisma.emergencyLabTest.updateMany({
          where: { emergencyLabRequestId: params.id },
          data: {
            sampleCollected: true,
            sampleCollectedAt: new Date(),
            sampleCollectedById: session.user.id,
            status: 'SAMPLE_COLLECTED',
          },
        });

        return NextResponse.json({ message: 'All samples acknowledged and collected' });
      }

      // Receive all samples at lab
      case 'RECEIVE_ALL_SAMPLES': {
        await prisma.emergencyLabTest.updateMany({
          where: { emergencyLabRequestId: params.id },
          data: {
            receivedAtLabAt: new Date(),
            receivedByLabId: session.user.id,
            status: 'SAMPLE_RECEIVED_AT_LAB',
          },
        });

        await prisma.emergencyLabRequest.update({
          where: { id: params.id },
          data: { status: 'SAMPLE_RECEIVED_AT_LAB' },
        });

        return NextResponse.json({ message: 'All samples received at lab' });
      }

      // Start processing all tests
      case 'START_PROCESSING_ALL': {
        await prisma.emergencyLabTest.updateMany({
          where: { emergencyLabRequestId: params.id, resultValue: null },
          data: {
            processingStartedAt: new Date(),
            status: 'PROCESSING',
          },
        });

        await prisma.emergencyLabRequest.update({
          where: { id: params.id },
          data: { status: 'PROCESSING' },
        });

        return NextResponse.json({ message: 'Processing started for all tests' });
      }

      // Verify results (senior lab scientist)
      case 'VERIFY_RESULTS': {
        if (!testId) {
          return NextResponse.json({ error: 'testId is required' }, { status: 400 });
        }

        await prisma.emergencyLabTest.update({
          where: { id: testId },
          data: {
            resultVerifiedById: session.user.id,
            resultVerifiedAt: new Date(),
            status: 'RESULTS_VERIFIED',
          },
        });

        // Check if all verified
        const allTestsVerify = await prisma.emergencyLabTest.findMany({
          where: { emergencyLabRequestId: params.id },
        });
        const allVerified = allTestsVerify.every(t =>
          t.id === testId ? true : t.resultVerifiedById !== null
        );
        if (allVerified) {
          await prisma.emergencyLabRequest.update({
            where: { id: params.id },
            data: { status: 'RESULTS_VERIFIED' },
          });
        }

        // Notify requesting clinician
        const labReqVerify = await prisma.emergencyLabRequest.findUnique({
          where: { id: params.id },
          select: {
            requestedById: true, patientName: true, folderNumber: true,
            surgery: { select: { surgeonId: true, anesthetistId: true } },
            emergencyBooking: { select: { surgeonId: true, anesthetistId: true } },
          },
        });

        if (labReqVerify) {
          const notifyIds = new Set<string>();
          notifyIds.add(labReqVerify.requestedById);
          if (labReqVerify.surgery?.surgeonId) notifyIds.add(labReqVerify.surgery.surgeonId);
          if (labReqVerify.surgery?.anesthetistId) notifyIds.add(labReqVerify.surgery.anesthetistId);
          if (labReqVerify.emergencyBooking?.surgeonId) notifyIds.add(labReqVerify.emergencyBooking.surgeonId);
          if (labReqVerify.emergencyBooking?.anesthetistId) notifyIds.add(labReqVerify.emergencyBooking.anesthetistId);

          const testInfo = allTestsVerify.find(t => t.id === testId);
          await Promise.all(
            Array.from(notifyIds).map(userId =>
              prisma.notification.create({
                data: {
                  userId,
                  type: 'EMERGENCY_LAB_RESULT',
                  title: `🔬 Results Verified: ${testInfo?.testName || 'Lab Test'}`,
                  message: `Verified lab result for ${labReqVerify.patientName} (${labReqVerify.folderNumber}): ${testInfo?.testName} = ${testInfo?.resultValue} ${testInfo?.resultUnit || ''}`,
                  link: '/dashboard/emergency-lab-workup',
                },
              })
            )
          );

          // Voice notification for critical verified results
          if (testInfo?.criticalResult) {
            await Promise.all(
              Array.from(notifyIds).map(userId =>
                prisma.emergencyLabNotification.create({
                  data: {
                    emergencyLabRequestId: params.id,
                    recipientId: userId,
                    recipientRole: 'CLINICIAN',
                    notificationType: 'CRITICAL_RESULT_VERIFIED',
                    isVoiceNotification: true,
                    voiceMessage: `VERIFIED CRITICAL RESULT for ${labReqVerify.patientName}. Test: ${testInfo.testName}. Value: ${testInfo.resultValue}. This result has been verified. Immediate clinical action required!`,
                    isPushNotification: true,
                    pushTitle: '🚨 VERIFIED CRITICAL RESULT',
                    pushMessage: `${labReqVerify.patientName}: ${testInfo.testName} = ${testInfo.resultValue} - CRITICAL (Verified)`,
                  },
                })
              )
            );
          }
        }

        return NextResponse.json({ message: 'Results verified' });
      }

      // Bulk enter results for multiple tests
      case 'BULK_ENTER_RESULTS': {
        const { results } = data;
        if (!results || !Array.isArray(results) || results.length === 0) {
          return NextResponse.json({ error: 'results array is required' }, { status: 400 });
        }

        const labReqBulk = await prisma.emergencyLabRequest.findUnique({
          where: { id: params.id },
          select: { 
            requestedAt: true, patientName: true, folderNumber: true, requestedById: true,
            surgery: { select: { surgeonId: true, anesthetistId: true } },
            emergencyBooking: { select: { surgeonId: true, anesthetistId: true } },
          },
        });

        const requestedAt = labReqBulk?.requestedAt;
        let hasCritical = false;

        for (const result of results) {
          const turnaround = requestedAt
            ? Math.round((new Date().getTime() - new Date(requestedAt).getTime()) / 60000)
            : null;

          await prisma.emergencyLabTest.update({
            where: { id: result.testId },
            data: {
              resultValue: result.resultValue,
              resultUnit: result.resultUnit || null,
              referenceRange: result.referenceRange || null,
              abnormalResult: result.abnormalResult || false,
              criticalResult: result.criticalResult || false,
              resultNotes: result.resultNotes || null,
              resultEnteredById: session.user.id,
              resultEnteredAt: new Date(),
              status: 'RESULTS_READY',
              turnaroundMinutes: turnaround,
            },
          });

          if (result.criticalResult) hasCritical = true;
        }

        // Check if all results are in
        const allTestsBulk = await prisma.emergencyLabTest.findMany({
          where: { emergencyLabRequestId: params.id },
        });
        const allReady = allTestsBulk.every(t => t.resultValue !== null);
        if (allReady) {
          await prisma.emergencyLabRequest.update({
            where: { id: params.id },
            data: { status: 'RESULTS_READY' },
          });
        }

        // Notify clinicians
        if (labReqBulk) {
          const notifyIds = new Set<string>();
          notifyIds.add(labReqBulk.requestedById);
          if (labReqBulk.surgery?.surgeonId) notifyIds.add(labReqBulk.surgery.surgeonId);
          if (labReqBulk.surgery?.anesthetistId) notifyIds.add(labReqBulk.surgery.anesthetistId);
          if (labReqBulk.emergencyBooking?.surgeonId) notifyIds.add(labReqBulk.emergencyBooking.surgeonId);
          if (labReqBulk.emergencyBooking?.anesthetistId) notifyIds.add(labReqBulk.emergencyBooking.anesthetistId);

          const emoji = hasCritical ? '🚨' : '🔬';
          await Promise.all(
            Array.from(notifyIds).map(userId =>
              prisma.notification.create({
                data: {
                  userId,
                  type: 'EMERGENCY_LAB_RESULT',
                  title: `${emoji} ${results.length} Lab Results Ready`,
                  message: `${results.length} investigation results are now available for ${labReqBulk.patientName} (${labReqBulk.folderNumber}).${hasCritical ? ' CRITICAL VALUES DETECTED!' : ''}`,
                  link: '/dashboard/emergency-lab-workup',
                },
              })
            )
          );

          // Voice for critical
          if (hasCritical) {
            await Promise.all(
              Array.from(notifyIds).map(userId =>
                prisma.emergencyLabNotification.create({
                  data: {
                    emergencyLabRequestId: params.id,
                    recipientId: userId,
                    recipientRole: 'CLINICIAN',
                    notificationType: 'CRITICAL_RESULT',
                    isVoiceNotification: true,
                    voiceMessage: `CRITICAL LAB RESULTS for patient ${labReqBulk.patientName}. ${results.length} results uploaded with critical values detected. Immediate action required!`,
                    isPushNotification: true,
                    pushTitle: '🚨 CRITICAL LAB RESULTS',
                    pushMessage: `${labReqBulk.patientName}: ${results.length} results with CRITICAL values!`,
                  },
                })
              )
            );
          }
        }

        return NextResponse.json({ message: `${results.length} results entered and clinical team notified` });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating lab request:', error);
    return NextResponse.json({ error: 'Failed to update lab request' }, { status: 500 });
  }
}
