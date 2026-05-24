import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Public, no-auth, read-only view of the surgical catalog.
 * Returns only active items and excludes internal-only fields (notes).
 *
 * Powers the shareable page at /public/surgical-catalog so external
 * collaborators (e.g. chief residents, pack providers, vendors) can
 * see what's curated without needing a login.
 */
export async function GET() {
  try {
    const [consumables, drugs] = await Promise.all([
      prisma.surgicalConsumableTemplate.findMany({
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          category: true,
          size: true,
          unit: true,
          specialty: true,
          defaultQuantity: true,
        },
      }),
      prisma.surgicalDrugDressingTemplate.findMany({
        where: { isActive: true },
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          type: true,
          defaultDosage: true,
          defaultRoute: true,
          defaultQuantity: true,
          unit: true,
          specialty: true,
          isControlled: true,
        },
      }),
    ]);

    return NextResponse.json(
      { consumables, drugs, generatedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to load catalog", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
