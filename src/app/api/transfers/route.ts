import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const transfers = await prisma.patientTransfer.findMany({
      include: {
        patient: {
          select: {
            name: true,
            folderNumber: true,
          }
        }
      },
      orderBy: { transferTime: 'desc' },
      take: 50
    });

    return NextResponse.json(transfers);

  } catch (error) {
    console.error("Transfers fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
