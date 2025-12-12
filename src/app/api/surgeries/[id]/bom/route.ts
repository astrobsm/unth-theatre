import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const surgery = await prisma.surgery.findUnique({
      where: { id: params.id },
      include: {
        patient: {
          select: {
            name: true,
            folderNumber: true,
            age: true,
            gender: true,
          },
        },
        surgeon: {
          select: {
            fullName: true,
          },
        },
        items: {
          include: {
            item: {
              select: {
                name: true,
                category: true,
              },
            },
          },
          orderBy: {
            item: {
              category: 'asc',
            },
          },
        },
      },
    });

    if (!surgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    return NextResponse.json(surgery);
  } catch (error) {
    console.error('Error fetching surgery BOM:', error);
    return NextResponse.json(
      { error: 'Failed to fetch surgery BOM' },
      { status: 500 }
    );
  }
}
