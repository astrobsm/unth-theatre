/**
 * Store a previewed draft as the document the committee will review.
 *
 * The owner sends back the tree they just looked at — titles they corrected,
 * sections they removed, decision items they dismissed as false positives. This
 * route does not re-parse: re-parsing would discard those corrections, which is
 * the one thing a preview must never do.
 *
 * Written in a single transaction. A half-imported policy is a review whose
 * later sections nobody is asked about, and the committee would have no way to
 * tell: the form would simply end early.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requirePolicyOwner, requirePolicyViewer } from '@/lib/policy/guard';

export const dynamic = 'force-dynamic';

const itemSchema = z.object({
  placeholder: z.string().min(1).max(200),
  currentValue: z.string().max(200),
  surroundingSentence: z.string().max(2000),
  type: z.enum(['TIME', 'PERCENTAGE', 'NUMBER', 'DURATION', 'FREE_TEXT', 'CHOICE']),
  options: z.array(z.string().max(120)).nullish(),
  dismissed: z.boolean().optional(),
});

const sectionSchema = z.object({
  key: z.string().min(1).max(80),
  parentKey: z.string().max(80).nullish(),
  number: z.string().max(40).nullish(),
  title: z.string().min(1).max(400),
  order: z.number().int().min(0).max(10000),
  body: z.string().max(200000),
  isAppendix: z.boolean().optional(),
  decisionItems: z.array(itemSchema).max(200).optional(),
});

const bodySchema = z.object({
  title: z.string().min(3).max(300),
  version: z.string().min(1).max(40),
  sourceFormat: z.enum(['MARKDOWN', 'DOCX', 'PASTED']),
  sourceFileName: z.string().max(300).nullish(),
  sections: z.array(sectionSchema).min(1).max(500),
});

export async function GET() {
  const { error, actor } = await requirePolicyViewer();
  if (error || !actor) return error;

  const documents = await prisma.policyDocument.findMany({
    orderBy: { importedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      version: true,
      status: true,
      importedAt: true,
      importedByName: true,
      sourceFormat: true,
      _count: { select: { sections: true, rounds: true } },
    },
  });

  return NextResponse.json({ documents }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Could not read that import', detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // A parentKey naming a section that is not in the payload would silently
    // orphan it, so it is refused here rather than quietly flattened. The
    // preview is where a tree gets corrected; by this point it should be right.
    const keys = new Set(input.sections.map((s) => s.key));
    const orphans = input.sections
      .filter((s) => s.parentKey && !keys.has(s.parentKey))
      .map((s) => s.title);
    if (orphans.length > 0) {
      return NextResponse.json(
        { error: `These sections name a parent that is not in the import: ${orphans.join(', ')}` },
        { status: 400 },
      );
    }

    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.policyDocument.create({
        data: {
          title: input.title.trim(),
          version: input.version.trim(),
          sourceFormat: input.sourceFormat,
          sourceFileName: input.sourceFileName?.trim() || null,
          importedById: actor.id,
          importedByName: actor.name,
          status: 'DRAFT',
        },
      });

      // Parents before children, so a parentId always exists when it is used.
      // Depth-first over the key graph rather than two passes with an update,
      // which would leave a window where the tree is flat.
      const idByKey = new Map<string, string>();
      const childrenOf = new Map<string | null, typeof input.sections>();
      for (const section of input.sections) {
        const parent = section.parentKey ?? null;
        const list = childrenOf.get(parent) ?? [];
        list.push(section);
        childrenOf.set(parent, list);
      }

      const writeLevel = async (parentKey: string | null) => {
        const level = (childrenOf.get(parentKey) ?? [])
          .slice()
          .sort((a, b) => a.order - b.order);

        for (const section of level) {
          const row = await tx.policySection.create({
            data: {
              documentId: created.id,
              number: section.number?.trim() || null,
              title: section.title.trim(),
              parentId: parentKey ? idByKey.get(parentKey)! : null,
              order: section.order,
              body: section.body,
              isAppendix: section.isAppendix ?? false,
            },
          });
          idByKey.set(section.key, row.id);

          const items = (section.decisionItems ?? []).filter((d) => !d.dismissed);
          if (items.length > 0) {
            await tx.policyDecisionItem.createMany({
              data: items.map((d, i) => ({
                sectionId: row.id,
                placeholder: d.placeholder,
                currentValue: d.currentValue,
                surroundingSentence: d.surroundingSentence,
                type: d.type,
                options: d.options && d.options.length > 0 ? d.options : undefined,
                order: i,
              })),
            });
          }

          await writeLevel(section.key);
        }
      };

      await writeLevel(null);
      return created;
    }, { timeout: 30000 });

    const counts = await prisma.policySection.count({ where: { documentId: document.id } });
    const items = await prisma.policyDecisionItem.count({
      where: { section: { documentId: document.id } },
    });

    return NextResponse.json({
      ok: true,
      documentId: document.id,
      sections: counts,
      decisionItems: items,
    });
  } catch (err) {
    console.error('[policy/documents] POST failed', err);
    return NextResponse.json({ error: 'Could not store the imported policy' }, { status: 500 });
  }
}
