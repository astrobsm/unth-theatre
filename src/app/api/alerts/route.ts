import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - Get all active alerts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const active = searchParams.get('active') === 'true';
    const type = searchParams.get('type'); // 'holding' or 'pacu'

    let holdingAlerts: any[] = [];
    let pacuAlerts: any[] = [];

    if (!type || type === 'holding') {
      const holdingWhere: any = {};
      if (active) {
        holdingWhere.resolved = false;
      }

      holdingAlerts = await prisma.holdingAreaRedAlert.findMany({
        where: holdingWhere,
        include: {
          assessment: {
            include: {
              patient: {
                select: {
                  id: true,
                  folderNumber: true,
                  name: true,
                  age: true,
                  gender: true,
                  ward: true
                }
              },
              surgery: {
                select: {
                  id: true,
                  procedureName: true,
                  scheduledDate: true,
                  surgeon: {
                    select: {
                      fullName: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: {
          triggeredAt: 'desc'
        }
      });
    }

    if (!type || type === 'pacu') {
      const pacuWhere: any = {};
      if (active) {
        pacuWhere.resolved = false;
      }

      pacuAlerts = await prisma.pACURedAlert.findMany({
        where: pacuWhere,
        include: {
          pacuAssessment: {
            include: {
              patient: {
                select: {
                  id: true,
                  folderNumber: true,
                  name: true,
                  age: true,
                  gender: true,
                  ward: true
                }
              },
              surgery: {
                select: {
                  id: true,
                  procedureName: true,
                  scheduledDate: true,
                  surgeon: {
                    select: {
                      fullName: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: {
          triggeredAt: 'desc'
        }
      });
    }

    return NextResponse.json({
      holdingAreaAlerts: holdingAlerts,
      pacuAlerts: pacuAlerts,
      totalActive: holdingAlerts.filter(a => !a.resolved).length + 
                   pacuAlerts.filter(a => !a.resolved).length
    });

  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}
