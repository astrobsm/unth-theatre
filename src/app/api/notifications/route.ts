import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// GET /api/notifications - Fetch notifications for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const unreadOnly = searchParams.get('unread') === 'true';
    const type = searchParams.get('type');
    const timeline = searchParams.get('timeline') === 'true';

    const skip = (page - 1) * limit;

    // Build where clause: user's own notifications + broadcasts
    const where: any = {
      OR: [
        { userId: session.user.id },
        { userId: null }, // Broadcast notifications
      ],
    };

    if (unreadOnly) {
      where.isRead = false;
    }

    if (type) {
      where.type = type;
    }

    // Timeline mode: show upcoming events
    if (timeline) {
      where.OR = [
        { scheduledAt: { gte: new Date() } },
        { deadlineAt: { gte: new Date() } },
        { isTimelineCritical: true, isRead: false },
      ];
      // Also scope to user
      where.AND = [
        {
          OR: [
            { userId: session.user.id },
            { userId: null },
          ],
        },
      ];
      delete where.OR;
      where.OR = [
        { scheduledAt: { gte: new Date() } },
        { deadlineAt: { gte: new Date() } },
        { isTimelineCritical: true, isRead: false },
      ];
      // Restructure properly
      const timelineWhere: any = {
        AND: [
          {
            OR: [
              { userId: session.user.id },
              { userId: null },
            ],
          },
          {
            OR: [
              { scheduledAt: { gte: new Date() } },
              { deadlineAt: { gte: new Date() } },
              { isTimelineCritical: true, isRead: false },
            ],
          },
        ],
      };

      const [notifications, total] = await Promise.all([
        prisma.systemNotification.findMany({
          where: timelineWhere,
          orderBy: [
            { scheduledAt: 'asc' },
            { deadlineAt: 'asc' },
            { createdAt: 'desc' },
          ],
          skip,
          take: limit,
        }),
        prisma.systemNotification.count({ where: timelineWhere }),
      ]);

      return NextResponse.json({
        notifications,
        total,
        page,
        pages: Math.ceil(total / limit),
      });
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.systemNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.systemNotification.count({ where }),
      prisma.systemNotification.count({
        where: {
          OR: [
            { userId: session.user.id },
            { userId: null },
          ],
          isRead: false,
        },
      }),
    ]);

    return NextResponse.json({
      notifications,
      total,
      unreadCount,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('GET /api/notifications error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// POST /api/notifications - Create a new notification
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      userId,
      type,
      title,
      message,
      priority = 'NORMAL',
      actionUrl,
      relatedEntityType,
      relatedEntityId,
      scheduledAt,
      deadlineAt,
      isTimelineCritical = false,
    } = body;

    if (!type || !title || !message) {
      return NextResponse.json(
        { error: 'type, title, and message are required' },
        { status: 400 }
      );
    }

    const notification = await prisma.systemNotification.create({
      data: {
        userId: userId || null, // null = broadcast
        type,
        title,
        message,
        priority,
        actionUrl,
        relatedEntityType,
        relatedEntityId,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        deadlineAt: deadlineAt ? new Date(deadlineAt) : null,
        isTimelineCritical,
      },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error('POST /api/notifications error:', error);
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
  }
}

// PUT /api/notifications - Mark notification(s) as read
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { notificationId, markAllRead } = body;

    if (markAllRead) {
      // Mark all user's notifications as read
      await prisma.systemNotification.updateMany({
        where: {
          OR: [
            { userId: session.user.id },
            { userId: null },
          ],
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return NextResponse.json({ message: 'All notifications marked as read' });
    }

    if (!notificationId) {
      return NextResponse.json(
        { error: 'notificationId or markAllRead is required' },
        { status: 400 }
      );
    }

    const notification = await prisma.systemNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json(notification);
  } catch (error) {
    console.error('PUT /api/notifications error:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
