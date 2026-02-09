import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// Force dynamic, no caching
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/notifications/stream - Server-Sent Events for real-time notifications
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();
  let isActive = true;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      const sendEvent = (event: string, data: any) => {
        if (!isActive) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          isActive = false;
        }
      };

      // Send heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        if (!isActive) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          isActive = false;
          clearInterval(heartbeat);
        }
      }, 15000);

      // Initial unread count
      try {
        const unreadCount = await prisma.systemNotification.count({
          where: {
            OR: [{ userId }, { userId: null }],
            isRead: false,
          },
        });
        sendEvent('init', { unreadCount, connected: true, timestamp: Date.now() });
      } catch (error) {
        console.error('SSE init error:', error);
      }

      // Poll for new notifications every 5 seconds
      let lastCheckTime = new Date();
      const pollInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(pollInterval);
          return;
        }

        try {
          // Check for new notifications since last check
          const newNotifications = await prisma.systemNotification.findMany({
            where: {
              OR: [{ userId }, { userId: null }],
              createdAt: { gt: lastCheckTime },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          });

          if (newNotifications.length > 0) {
            const unreadCount = await prisma.systemNotification.count({
              where: {
                OR: [{ userId }, { userId: null }],
                isRead: false,
              },
            });

            sendEvent('notifications', {
              notifications: newNotifications,
              unreadCount,
              timestamp: Date.now(),
            });
          }

          // Check for approaching timeline events (within 30 minutes)
          const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);
          const approachingEvents = await prisma.systemNotification.findMany({
            where: {
              AND: [
                { OR: [{ userId }, { userId: null }] },
                {
                  OR: [
                    {
                      scheduledAt: {
                        gte: new Date(),
                        lte: thirtyMinutesFromNow,
                      },
                    },
                    {
                      deadlineAt: {
                        gte: new Date(),
                        lte: thirtyMinutesFromNow,
                      },
                    },
                  ],
                },
              ],
              isRead: false,
              isTimelineCritical: false,
            },
            take: 5,
          });

          if (approachingEvents.length > 0) {
            // Mark as timeline critical
            await prisma.systemNotification.updateMany({
              where: {
                id: { in: approachingEvents.map(e => e.id) },
              },
              data: { isTimelineCritical: true },
            });

            sendEvent('timeline-alert', {
              events: approachingEvents,
              timestamp: Date.now(),
            });
          }

          lastCheckTime = new Date();
        } catch (error) {
          console.error('SSE poll error:', error);
        }
      }, 5000);

      // Cleanup on disconnect
      request.signal.addEventListener('abort', () => {
        isActive = false;
        clearInterval(heartbeat);
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
