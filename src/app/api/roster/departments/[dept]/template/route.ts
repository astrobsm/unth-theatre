import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRosterDept, canManageRosterDept, LOCATIONS, getShiftOptions } from '@/lib/rosterDepartments';
import { canManageRosterDeptFor } from '@/lib/rosterSupervisors';
import { getSubRoleOptions } from '@/lib/rosterAssignments';
import { rosterTemplateHeaders } from '@/lib/rosterUploadColumns';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATA_ROWS = 300;
const DATE_SPAN_DAYS = 28; // exact dates offered in the Date dropdown (4 weeks)

// Fallback option list so EVERY column has a dropdown, even for a department that
// doesn't define sub-roles. Validation is lenient, so anything can also be typed.
const NOTE_OPTIONS = ['On-call cover', 'Trauma cover', 'Standby', 'Swap', 'Leave cover', 'Late arrival', 'Half day'];
const SUBROLE_FALLBACK = ['General'];

/** 1 -> A. Only ever needs A..G, but doing it properly costs one line. */
const colLetter = (n: number) => String.fromCharCode(64 + n);

function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// GET /api/roster/departments/[dept]/template?weekStart=YYYY-MM-DD
// Department-specific .xlsx: EVERY column is a dropdown — staff names for this
// department, EXACT DATES (from the chosen week), Shift, Sub-role, Location and
// Notes, plus Seniority for the departments that actually have grades.
export async function GET(request: NextRequest, { params }: { params: { dept: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dept = getRosterDept(params.dept);
  if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });

  if (!(await canManageRosterDeptFor(dept, { id: (session.user as any).id, role: (session.user as any).role }))) {
    return NextResponse.json({ error: 'Not allowed to manage this department roster' }, { status: 403 });
  }

  const weekParam = new URL(request.url).searchParams.get('weekStart');
  const base = weekParam && !isNaN(new Date(weekParam).getTime()) ? new Date(weekParam) : new Date();
  const monday = mondayOf(base);
  const dates = Array.from({ length: DATE_SPAN_DAYS }, (_, i) => addDays(monday, i));

  const staff = await prisma.user.findMany({
    where: { role: { in: dept.userRoles as any }, status: 'APPROVED' },
    select: { fullName: true },
    orderBy: { fullName: 'asc' },
  });
  const names = staff.map((s) => s.fullName).filter(Boolean);

  // Anaesthetists AND anaesthetic technicians are both rostered by surgical
  // specialty, read live from the database. The same resolver feeds the web
  // form, so the spreadsheet can't offer a different list.
  const isSpecialty = dept.subRoleSource === 'SURGICAL_SPECIALTY';

  // Built from the department's own declaration rather than from its slug, so
  // the cell's help text cannot go stale the way it just did — this said
  // "Theatre covered" for the technicians for as long as they were rostered by
  // theatre, and would have gone on saying it afterwards.
  const assignmentPrompt = isSpecialty
    ? [
        'Surgical specialty covered',
        dept.onCallSubRole ? `${dept.onCallSubRole} for the on-call consultant` : null,
        dept.extraSubRoles?.length ? `or ${dept.extraSubRoles.join(' / ')}` : null,
      ].filter(Boolean).join(' — ')
    : dept.subRoleSource === 'THEATRE'
      ? 'Theatre covered'
      : 'Sub-role (optional)';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'UNTH Theatre ORM';
  const ws = wb.addWorksheet('Roster');
  const lists = wb.addWorksheet('Lists');
  lists.state = 'veryHidden';

  const resolvedSubRoles = await getSubRoleOptions(dept);
  const subRoles = resolvedSubRoles.length ? resolvedSubRoles : SUBROLE_FALLBACK;
  const locations = [...LOCATIONS];
  // Offer the shift wording this department uses on its own roster page, so the
  // spreadsheet and the web form can't drift apart. normaliseShift() on the upload
  // side maps these labels back onto the stored DutyShift values.
  const shiftLabels = getShiftOptions(dept).map((s) => s.label);

  // THE SHEET IS BUILT FROM THIS LIST, not from a fixed seven columns.
  //
  // A department that declares no seniority now gets no Seniority column at all.
  // It used to get one regardless, filled from an invented ['Senior', 'Junior']
  // fallback — so the anaesthetic technicians were asked for a grade that does
  // not exist in their cadre, and whoever filled the sheet had to answer it with
  // a guess. All 506 of their roster rows have it NULL.
  //
  // Dropping a column is safe because the upload parser reads the header row BY
  // NAME (it looks for 'senior' / 'level' / 'grade'), so Location and Notes are
  // still found where they now sit.
  const columns: { header: string; options: string[]; prompt: string; width: number }[] = [
    {
      header: 'Name',
      options: names.length ? names : ['(no staff found — type the name)'],
      prompt: 'Choose a staff member',
      width: 26,
    },
    { header: 'Date', options: dates, prompt: 'Choose the exact date', width: 14 },
    { header: 'Shift', options: shiftLabels, prompt: shiftLabels.join(' / '), width: 22 },
    {
      header: dept.subRoleLabel ?? 'Sub-role',
      options: subRoles,
      prompt: assignmentPrompt,
      width: 24,
    },
  ];
  if (dept.seniorityLevels?.length) {
    columns.push({
      header: 'Seniority',
      options: dept.seniorityLevels,
      prompt: isSpecialty
        ? 'CONSULTANT for consultants, REGISTRAR/SENIOR_REGISTRAR for residents'
        : 'Seniority (optional)',
      width: 16,
    });
  }
  columns.push({ header: 'Location', options: locations, prompt: 'Location', width: 16 });
  columns.push({ header: 'Notes', options: NOTE_OPTIONS, prompt: 'Notes (optional)', width: 26 });

  const dateCol = columns.findIndex((c) => c.header === 'Date') + 1;

  // Lists sheet — one column per option set. Dates are stored as TEXT so Excel
  // can't silently reformat them.
  lists.getColumn(dateCol).numFmt = '@';
  columns.forEach((c, i) => {
    c.options.forEach((v, r) => { lists.getCell(r + 1, i + 1).value = v; });
  });

  const ref = (col: string, n: number) => `Lists!$${col}$1:$${col}$${Math.max(n, 1)}`;

  // The header row comes from the shared helper, NOT from columns[].header, so
  // that what this sheet says and what the parser looks for cannot drift apart
  // again. If they disagree, that is a bug worth failing loudly for rather than
  // shipping a sheet whose assignment column silently imports as blank.
  const headerRow = rosterTemplateHeaders(dept);
  const built = columns.map((c) => c.header);
  // Element-wise, not just the count. The whole failure being fixed here was two
  // sides that agreed on the SHAPE of the sheet and disagreed on one word in it.
  if (headerRow.length !== built.length || headerRow.some((h, i) => h !== built[i])) {
    throw new Error(
      `roster template columns out of step for ${dept.slug}: ` +
      `sheet builds [${built.join(', ')}] ` +
      `but the parser expects [${headerRow.join(', ')}]`,
    );
  }

  // Roster sheet — header + validated data rows.
  ws.addRow(headerRow);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
  ws.columns = columns.map((c) => ({ width: c.width }));
  ws.getColumn(dateCol).numFmt = '@'; // Date column stays text -> uploads as YYYY-MM-DD
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const listVal = (formula: string, prompt: string) => ({
    type: 'list' as const,
    allowBlank: true,
    formulae: [formula],
    showErrorMessage: false, // lenient: a value outside the list can still be typed
    promptTitle: 'Pick or type',
    prompt,
  });

  for (let r = 2; r <= DATA_ROWS + 1; r++) {
    columns.forEach((c, i) => {
      ws.getCell(r, i + 1).dataValidation = listVal(ref(colLetter(i + 1), c.options.length), c.prompt);
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="roster-template-${dept.slug}-${monday}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
