import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRosterDept, canManageRosterDept } from '@/lib/rosterDepartments';
import { canManageRosterDeptFor } from '@/lib/rosterSupervisors';
import { normaliseShift } from '@/lib/rosterShifts';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Deliberately lenient bulk draft upload. The goal is a SEAMLESS import: accept
// flexible input, insert everything we can, and REPORT (never hard-fail) the few
// rows that need a human's eye (name not found, ambiguous name, bad date/shift).
const bulkSchema = z.object({
  weekStart: z.string().optional(),
  rows: z
    .array(
      z.object({
        name: z.string(),
        date: z.string(),
        shift: z.string(),
        subRole: z.string().nullish(),
        seniorityLevel: z.string().nullish(),
        location: z.string().nullish(),
        notes: z.string().nullish(),
      })
    )
    .max(5000),
});

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z').getTime());

// POST /api/roster/departments/[dept]/bulk
export async function POST(request: NextRequest, { params }: { params: { dept: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dept = getRosterDept(params.dept);
    if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });

    const role = (session.user as any).role;
    if (!(await canManageRosterDeptFor(dept, { id: (session.user as any).id, role }))) {
      return NextResponse.json({ error: 'You are not allowed to manage this department roster' }, { status: 403 });
    }

    const body = bulkSchema.parse(await request.json());
    const incoming = body.rows || [];
    if (incoming.length === 0) {
      return NextResponse.json({ error: 'No rows to upload' }, { status: 400 });
    }

    // Candidate staff for this department (so a typed surname resolves within the
    // right team, not across the whole hospital).
    const candidates = await prisma.user.findMany({
      where: { role: { in: dept.userRoles as any }, status: 'APPROVED' },
      select: { id: true, fullName: true, staffCode: true },
    });

    const byCode = new Map<string, { id: string; fullName: string }>();
    const byName = new Map<string, { id: string; fullName: string }[]>();
    for (const u of candidates) {
      if (u.staffCode) byCode.set(norm(u.staffCode), { id: u.id, fullName: u.fullName });
      const key = norm(u.fullName);
      const arr = byName.get(key) || [];
      arr.push({ id: u.id, fullName: u.fullName });
      byName.set(key, arr);
    }

    type Resolved =
      | { kind: 'match'; id: string; fullName: string }
      | { kind: 'ambiguous'; options: { id: string; fullName: string }[] }
      | { kind: 'unmatched' };

    const resolveName = (typed: string): Resolved => {
      const t = norm(typed);
      if (!t) return { kind: 'unmatched' };
      // 1) staff code exact
      const code = byCode.get(t);
      if (code) return { kind: 'match', id: code.id, fullName: code.fullName };
      // 2) exact full name (case-insensitive)
      const exact = byName.get(t);
      if (exact && exact.length === 1) return { kind: 'match', ...exact[0] };
      if (exact && exact.length > 1) return { kind: 'ambiguous', options: exact };
      // 3) partial (either direction) — surname / partial spelling
      const partial = candidates.filter((u) => {
        const f = norm(u.fullName);
        return f.includes(t) || t.includes(f);
      });
      if (partial.length === 1) return { kind: 'match', id: partial[0].id, fullName: partial[0].fullName };
      if (partial.length > 1) return { kind: 'ambiguous', options: partial.map((u) => ({ id: u.id, fullName: u.fullName })) };
      return { kind: 'unmatched' };
    };

    const toCreate: any[] = [];
    const batchSeen = new Set<string>(); // userId|date|shift within THIS upload
    const unmatched: { name: string; date: string; shift: string }[] = [];
    const ambiguous: { name: string; options: { id: string; fullName: string }[] }[] = [];
    const invalid: { name: string; reason: string }[] = [];
    const wantDates = new Set<string>();

    for (const r of incoming) {
      const name = (r.name || '').trim();
      const shift = normaliseShift(r.shift || '');
      const date = (r.date || '').trim();
      if (!name) { invalid.push({ name: name || '(blank)', reason: 'missing name' }); continue; }
      if (!isIsoDate(date)) { invalid.push({ name, reason: `bad date "${r.date}"` }); continue; }
      if (!shift) { invalid.push({ name, reason: `bad shift "${r.shift}"` }); continue; }

      const res = resolveName(name);
      if (res.kind === 'unmatched') { unmatched.push({ name, date, shift }); continue; }
      if (res.kind === 'ambiguous') {
        if (!ambiguous.some((a) => norm(a.name) === norm(name))) ambiguous.push({ name, options: res.options });
        continue;
      }

      const key = `${res.id}|${date}|${shift}`;
      if (batchSeen.has(key)) continue; // duplicate line in the same sheet
      batchSeen.add(key);
      wantDates.add(date);

      toCreate.push({
        userId: res.id,
        staffName: res.fullName,
        staffCategory: dept.category,
        // A department with no grades stores none, whatever the sheet says.
        // Technicians used to have a Seniority column, so an old template is
        // still lying around on people's laptops; re-using one must not put
        // CONSULTANT back on a technician row after the field was removed.
        seniorityLevel: dept.seniorityLevels?.length
          ? r.seniorityLevel?.toString().trim() || null
          : null,
        subRole: r.subRole?.toString().trim() || null,
        location: r.location?.toString().trim() || 'MAIN_THEATRE',
        date: new Date(date + 'T00:00:00Z'),
        shift,
        uploadedBy: session.user.id,
        notes: r.notes?.toString().trim() || null,
        status: 'DRAFT',
        _key: key,
      });
    }

    // Skip rows that already exist (draft OR published) for the same person/day/shift.
    let duplicates = 0;
    if (toCreate.length && wantDates.size) {
      const dateObjs = Array.from(wantDates).map((d) => new Date(d + 'T00:00:00Z'));
      const existing = await prisma.roster.findMany({
        where: { staffCategory: dept.category as any, date: { in: dateObjs } },
        select: { userId: true, date: true, shift: true },
      });
      const existingSet = new Set(
        existing.map((e) => `${e.userId}|${new Date(e.date).toISOString().slice(0, 10)}|${e.shift}`)
      );
      const filtered = toCreate.filter((c) => {
        if (existingSet.has(c._key)) { duplicates += 1; return false; }
        return true;
      });
      toCreate.length = 0;
      toCreate.push(...filtered);
    }

    let created = 0;
    if (toCreate.length) {
      const data = toCreate.map(({ _key, ...rest }) => rest);
      const result = await prisma.roster.createMany({ data: data as any });
      created = result.count;
    }

    return NextResponse.json({
      ok: true,
      totalReceived: incoming.length,
      created,
      duplicates,
      unmatched,
      ambiguous,
      invalid,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', details: error.errors }, { status: 400 });
    }
    console.error('Roster bulk upload failed:', error);
    return NextResponse.json({ error: 'Bulk upload failed' }, { status: 500 });
  }
}
