// ============================================================
// GET/POST /api/comms/templates — the message catalogue and its Meta status
// ------------------------------------------------------------
// Templates live in code (lib/comms/templates.ts) because their wording is
// reviewed like code and has to match what was submitted to Meta. The database
// row exists to record ONE thing the code cannot know: whether Meta has
// approved it, and under what name.
//
// So GET reconciles the two and says, per template, exactly what an
// administrator has to do next. That list is the setup screen.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { WHATSAPP_TEMPLATES, validateTemplate, templateByCode } from '@/lib/comms/templates';

export const dynamic = 'force-dynamic';

const MAY_MANAGE = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

async function gate() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: 'Unauthorized', status: 401 as const };
  if (!MAY_MANAGE.includes((session.user.role ?? '').toUpperCase())) {
    return { error: 'Only an administrator may manage message templates.', status: 403 as const };
  }
  return { session };
}

export async function GET() {
  const g = await gate();
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const rows = await prisma.communicationTemplate.findMany({
      where: { channel: 'WHATSAPP' },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
      select: {
        code: true, providerTemplateId: true, providerStatus: true,
        providerLanguage: true, isActive: true, updatedAt: true,
      },
    });
    const byCode = new Map(rows.map((r) => [r.code, r]));

    const templates = WHATSAPP_TEMPLATES.map((t) => {
      const row = byCode.get(t.code);
      const problems = validateTemplate(t);
      const approved = row?.providerStatus === 'APPROVED';

      return {
        code: t.code,
        metaName: t.metaName,
        category: t.category,
        language: t.language,
        when: t.when,
        buttonLabel: t.buttonLabel ?? null,
        variables: t.variables,
        // The exact string to paste into Meta's console, so nobody retypes it
        // and introduces a difference between what was approved and what is
        // sent.
        metaBody: t.metaBody,
        installed: Boolean(row),
        providerStatus: row?.providerStatus ?? null,
        approved,
        problems,
        // One sentence saying what to do next, in order.
        nextStep: problems.length
          ? 'Fix the template in code — it would be rejected as written.'
          : !row
            ? 'Install it, then submit it to Meta for approval.'
            : !row.providerTemplateId
              ? 'Submit it to Meta, then record the approved name here.'
              : !approved
                ? `Meta has it as ${row.providerStatus ?? 'not submitted'}. It cannot send until APPROVED.`
                : 'Ready.',
      };
    });

    return NextResponse.json({
      templates,
      readyToSend: templates.filter((t) => t.approved).length,
      total: templates.length,
    });
  } catch (error) {
    return apiError('comms/templates GET', error);
  }
}

/**
 * Install the catalogue, or record what Meta decided about one template.
 *
 * Installing writes the wording into the database so a message sent today can
 * still be shown exactly as it was worded next year, even after the code moves
 * on. Recording approval is the one fact that has to come from outside.
 */
export async function POST(request: NextRequest) {
  const g = await gate();
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const body = await request.json().catch(() => ({}));

    // ── Record Meta's decision about one template ──────────────────────────
    if (body.action === 'record-approval') {
      const spec = templateByCode(String(body.code ?? ''));
      if (!spec) return NextResponse.json({ error: 'No such template.' }, { status: 400 });

      const status = String(body.providerStatus ?? '').toUpperCase();
      if (!['APPROVED', 'PENDING', 'REJECTED'].includes(status)) {
        return NextResponse.json(
          { error: 'Status must be APPROVED, PENDING or REJECTED.' }, { status: 400 });
      }

      const existing = await prisma.communicationTemplate.findFirst({
        where: { code: spec.code, channel: 'WHATSAPP' },
        orderBy: { version: 'desc' },
      });
      if (!existing) {
        return NextResponse.json(
          { error: 'Install the catalogue before recording an approval.' }, { status: 400 });
      }

      const updated = await prisma.communicationTemplate.update({
        where: { id: existing.id },
        data: {
          providerStatus: status,
          providerTemplateId: String(body.metaName ?? spec.metaName),
          providerLanguage: String(body.language ?? spec.language),
        },
        select: { code: true, providerStatus: true, providerTemplateId: true },
      });
      return NextResponse.json({ updated });
    }

    // ── Install or refresh the catalogue ───────────────────────────────────
    const installed: string[] = [];
    const refused: Array<{ code: string; problems: string[] }> = [];

    for (const t of WHATSAPP_TEMPLATES) {
      const problems = validateTemplate(t);
      if (problems.length) {
        // Not installed. A template Meta would reject should not be sitting in
        // the database looking available.
        refused.push({ code: t.code, problems });
        continue;
      }

      const existing = await prisma.communicationTemplate.findFirst({
        where: { code: t.code, channel: 'WHATSAPP' },
        orderBy: { version: 'desc' },
      });

      if (!existing) {
        await prisma.communicationTemplate.create({
          data: {
            code: t.code, channel: 'WHATSAPP', version: 1,
            body: t.body, variables: t.variables as never,
            sensitivity: 'OPERATIONAL',
            providerTemplateId: t.metaName,
            providerLanguage: t.language,
            // Never assumed. Approval is Meta's to give and is recorded only
            // when somebody has actually seen it in the console.
            providerStatus: 'NOT_SUBMITTED',
            isActive: true,
          },
        });
        installed.push(t.code);
        continue;
      }

      // Wording changed? A new VERSION, never an edit: a message sent last month
      // must still be readable exactly as it was worded, and Meta treats a
      // changed body as a new submission anyway.
      if (existing.body !== t.body) {
        await prisma.communicationTemplate.update({
          where: { id: existing.id }, data: { isActive: false },
        });
        await prisma.communicationTemplate.create({
          data: {
            code: t.code, channel: 'WHATSAPP', version: existing.version + 1,
            body: t.body, variables: t.variables as never,
            sensitivity: 'OPERATIONAL',
            providerTemplateId: t.metaName,
            providerLanguage: t.language,
            // Deliberately NOT carried over. The wording changed, so whatever
            // Meta approved was something else.
            providerStatus: 'NOT_SUBMITTED',
            isActive: true,
          },
        });
        installed.push(`${t.code} (v${existing.version + 1})`);
      }
    }

    return NextResponse.json({ installed, refused });
  } catch (error) {
    return apiError('comms/templates POST', error);
  }
}
