import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * The public suggestion box.
 *
 * Deliberately UNAUTHENTICATED, because the whole point is a link that can be
 * pasted into a departmental WhatsApp group and answered from a phone in a
 * corridor. Asking a surgeon to sign in before telling us what is wrong with
 * the signing-in is how feedback stops arriving.
 *
 * It writes into the same staff_feedback table the dashboard module reads, so
 * suggestions land in one place with everything else and can be triaged
 * OPEN → IN_REVIEW → ACTIONED → CLOSED. There is no GET: this endpoint can be
 * written to by anybody and read by nobody.
 */

const schema = z.object({
  category: z.enum(['APPLICATION', 'THEATRE_MANAGEMENT']).default('APPLICATION'),
  /** The change they want. The reason this form exists. */
  change: z.string().trim().min(5, 'Please describe the change you would like').max(4000),
  /** Which screen it concerns — the single most useful field for triage. */
  area: z.string().trim().max(120).optional(),
  /** What happens today, which is what makes the change understandable. */
  current: z.string().trim().max(4000).optional(),
  /** How much it costs them. Drives the order of the to-do list. */
  impact: z.enum(['BLOCKS', 'SLOWS', 'MINOR', 'IDEA']).optional(),
  name: z.string().trim().max(120).optional(),
  role: z.string().trim().max(120).optional(),
  unit: z.string().trim().max(120).optional(),
  /**
   * Honeypot. A real person never sees this field, so anything in it came from
   * something automated filling every input on the page.
   *
   * Accepts any short string ON PURPOSE. It was `.max(0)`, which made zod
   * reject it with "String must contain at most 0 character(s)" — a 400 that
   * announces exactly which field is the trap and teaches whoever wrote the bot
   * to skip it. The rejection has to happen quietly, below, with a 201.
   */
  website: z.string().max(200).optional(),
});

const IMPACT_LABEL: Record<string, string> = {
  BLOCKS: 'Blocks my work',
  SLOWS: 'Slows me down',
  MINOR: 'Minor annoyance',
  IDEA: 'Idea for improvement',
};

/**
 * Best-effort throttle, per IP, in memory.
 *
 * Honest about what it is: serverless instances do not share this map, so it
 * slows a nuisance down rather than stopping a determined one. The endpoint
 * writes nothing that can be read back and nothing that can be forged into an
 * identity, so the worst case is noise in a triage list — annoying, not
 * dangerous. A real limiter belongs in front of the whole application, not
 * bolted onto one route.
 */
const recent = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 12;

function throttled(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  // Keep the map from growing without bound on a long-lived instance.
  // forEach rather than for..of: this project's TS target does not allow
  // iterating a Map directly, and a build flag is a heavy price for one sweep.
  if (recent.size > 5_000) {
    const stale: string[] = [];
    recent.forEach((v, k) => {
      if (v.every((t: number) => now - t >= WINDOW_MS)) stale.push(k);
    });
    stale.forEach((k) => recent.delete(k));
  }
  return hits.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  if (throttled(ip)) {
    return NextResponse.json(
      { error: 'That is a lot of suggestions at once. Please try again shortly.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Could not read the form.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // Silently accepted, never stored. Telling a bot it was detected only teaches
  // whoever wrote it to fix the bot.
  if (d.website) return NextResponse.json({ ok: true }, { status: 201 });

  // Composed into one message rather than spread across columns the module
  // does not display. The headings are fixed so a triage list stays skimmable
  // and so the same suggestion from twenty people looks the same twenty times.
  const parts = [
    'DESIRED CHANGE',
    d.change,
    '',
    ...(d.area ? ['WHERE IN THE APP', d.area, ''] : []),
    ...(d.current ? ['WHAT HAPPENS NOW', d.current, ''] : []),
    ...(d.impact ? ['IMPACT', IMPACT_LABEL[d.impact] ?? d.impact, ''] : []),
    'FROM',
    [d.name || 'Anonymous', d.role, d.unit].filter(Boolean).join(' · '),
    '',
    'Submitted through the service-improvement link.',
  ];

  const title = [d.area, d.change.split('\n')[0]].filter(Boolean).join(' — ').slice(0, 200);

  try {
    const created = await prisma.staffFeedback.create({
      data: {
        category: d.category,
        title: title || null,
        message: parts.join('\n'),
        authorName: d.name || 'Anonymous',
        authorRole: [d.role, d.unit].filter(Boolean).join(' · ') || null,
        status: 'OPEN',
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch {
    // Never show a database error to somebody who has just taken the trouble
    // to write out a suggestion.
    return NextResponse.json(
      { error: 'Your suggestion could not be saved just now. Please try again in a moment.' },
      { status: 500 },
    );
  }
}
