// ============================================================
// Sending a greeting
// ------------------------------------------------------------
//   POST { kind: 'occasion', occasionKey, on, note?, personIds?, preview? }
//   POST { kind: 'personal', celebrationId, on, note?, preview? }
//   POST { kind: 'custom',   title, on, roles?, note?, personIds?, preview? }
//
// A PERSON PRESSES THIS. There is no cron, and that is deliberate: a greeting
// that arrives automatically at 00:01 is a greeting from a database, and
// everyone can tell. The screen shows what there is to mark, somebody in
// theatre management reads it, and then it goes.
//
// THE CUSTOM FORM IS THERE FOR EID. Eid al-Fitr and Eid al-Adha move with the
// lunar calendar and are announced by the Federal Government a few days out,
// so the fixed calendar deliberately does not guess at them. This is how they
// are sent on the day the hospital is actually told, and it works for anything
// else the calendar cannot know — a departmental jubilee, a national day of
// mourning, a visit.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiMiddleware';
import { occasionsOn, parseDay, type Occasion } from '@/lib/celebrations/calendar';
import {
  buildCelebrationMessage, buildPersonalCelebrationMessage, personalTitle,
} from '@/lib/celebrations/messages';
import {
  sendOccasion, sendPersonal, recipientsFor, greetedOn, SEND_BATCH,
} from '@/lib/celebrations/dispatch';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

const ACT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR',
  'CMAC',
  'DC_MAC',
] as const;

/** Every role the system actually has, from the generated enum. */
const KNOWN_ROLES: string[] = Object.keys(UserRole);

/** A key a custom occasion can be deduplicated on. */
function slug(title: string): string {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `custom-${s.slice(0, 40) || 'occasion'}`;
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireRole(ACT_ROLES as never);
  if (error) return error;

  const user = session!.user as { id?: string; name?: string | null; fullName?: string | null };
  const actor = {
    id: user.id ?? null,
    name: user.fullName || user.name || 'Theatre Management',
  };

  try {
    const body = await request.json();
    const kind = String(body?.kind ?? 'occasion');
    const on = String(body?.on ?? '');
    const note = typeof body?.note === 'string' ? body.note.slice(0, 600) : null;
    const preview = body?.preview === true;

    if (!parseDay(on)) {
      return NextResponse.json({ error: 'Which day is this for?' }, { status: 400 });
    }

    // ── One person's own day ─────────────────────────────────────────
    if (kind === 'personal') {
      const celebrationId = String(body?.celebrationId ?? '');
      if (!celebrationId) return NextResponse.json({ error: 'Which day?' }, { status: 400 });

      if (preview) {
        const row = await prisma.staffCelebration.findUnique({
          where: { id: celebrationId },
          select: {
            kind: true, label: true, sinceYear: true,
            user: { select: { fullName: true, role: true } },
          },
        });
        if (!row) return NextResponse.json({ error: 'No such day.' }, { status: 404 });
        return NextResponse.json({
          preview: true,
          text: buildPersonalCelebrationMessage({
            kind: row.kind as never,
            label: row.label,
            date: on,
            personName: row.user.fullName,
            role: row.user.role ? String(row.user.role) : null,
            sinceYear: row.sinceYear,
            note,
          }),
          title: personalTitle(row.kind as never, row.label),
        });
      }

      const res = await sendPersonal({ celebrationId, date: on, note, actor });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json({
        sent: true,
        personName: res.personName,
        message: `Sent to ${res.personName}.`,
        outcome: res.outcome,
      });
    }

    // ── A calendar occasion, or one the calendar cannot know about ───
    let occasion: Occasion | null = null;

    if (kind === 'custom') {
      const title = String(body?.title ?? '').trim().slice(0, 80);
      if (!title) {
        return NextResponse.json(
          { error: 'Give the occasion a name — it goes in the heading of the message.' },
          { status: 400 },
        );
      }
      // Checked against the enum, not merely stringified. An unknown role
      // reaches Prisma as an invalid enum value and fails the whole send with
      // a 500 that says nothing; a role nobody holds would instead silently
      // address the greeting to nobody. Both are better caught here.
      const asked: string[] = Array.isArray(body?.roles)
        ? body.roles.map((r: unknown) => String(r)).filter(Boolean)
        : [];
      const roles = asked.filter((r) => KNOWN_ROLES.indexOf(r) !== -1);
      if (asked.length && !roles.length) {
        return NextResponse.json(
          { error: 'None of those roles exist. Leave the roles out to write to all staff.' },
          { status: 400 },
        );
      }
      occasion = {
        key: slug(title),
        kind: 'PUBLIC',
        title,
        date: on,
        audience: roles.length ? 'ROLES' : 'ALL',
        roles: roles.length ? roles : undefined,
      };
    } else {
      const occasionKey = String(body?.occasionKey ?? '');
      occasion = occasionsOn(on).find((o) => o.key === occasionKey) ?? null;
      if (!occasion) {
        return NextResponse.json(
          { error: 'That is not an occasion on that date.' },
          { status: 400 },
        );
      }
    }

    const personIds: string[] = Array.isArray(body?.personIds)
      ? body.personIds.map((p: unknown) => String(p)).filter(Boolean)
      : [];

    if (preview) {
      const people = await recipientsFor(occasion);
      const already = await greetedOn(on);
      const one = (personIds.length
        ? people.find((p) => p.id === personIds[0])
        : people.find((p) => !already.has(p.id))) ?? people[0] ?? null;
      return NextResponse.json({
        preview: true,
        title: occasion.title,
        recipientCount: people.length,
        remaining: people.filter((p) => !already.has(p.id)).length,
        // Shown with a real colleague's name and role, because the whole
        // question the reader has is "what will this actually say to them".
        text: one
          ? buildCelebrationMessage({
            occasion, personName: one.fullName, role: one.role, note,
          })
          : buildCelebrationMessage({
            occasion, personName: 'Colleague', role: null, note,
          }),
        sampleFor: one ? { name: one.fullName, role: one.role } : null,
      });
    }

    const outcome = await sendOccasion({
      occasion,
      note,
      actor,
      personIds,
      limit: SEND_BATCH,
    });

    return NextResponse.json({
      sent: true,
      title: occasion.title,
      outcome,
      message: outcome.sent === 0 && outcome.remaining === 0
        ? 'Everybody this was for has already had a greeting for this date — one a day each, so nothing was sent again.'
        : `Sent to ${outcome.sent} ${outcome.sent === 1 ? 'colleague' : 'colleagues'}`
          + (outcome.remaining > 0
            ? `, ${outcome.remaining} still to go — press again to continue.`
            : '.'),
      batchSize: SEND_BATCH,
    });
  } catch (err) {
    console.error('[celebrations/send] failed:', err);
    return NextResponse.json({ error: 'Could not send it' }, { status: 500 });
  }
}
