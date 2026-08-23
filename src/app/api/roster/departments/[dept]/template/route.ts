import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  getRosterDept, canManageRosterDept, LOCATIONS, getShiftOptions, ON_CALL_ALL_SPECIALTIES,
} from '@/lib/rosterDepartments';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEADERS = ['Name', 'Date', 'Shift', 'Sub-role', 'Seniority', 'Location', 'Notes'];
const DATA_ROWS = 300;
const DATE_SPAN_DAYS = 28; // exact dates offered in the Date dropdown (4 weeks)

// Fallback option lists so EVERY column has a dropdown, even for departments that
// don't define sub-roles / seniority. Validation is lenient, so anything can also
// be typed.
const NOTE_OPTIONS = ['On-call cover', 'Trauma cover', 'Standby', 'Swap', 'Leave cover', 'Late arrival', 'Half day'];
const SUBROLE_FALLBACK = ['General'];
const SENIORITY_FALLBACK = ['Senior', 'Junior'];

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
// department, EXACT DATES (from the chosen week), Shift, Sub-role, Seniority,
// Location and Notes.
export async function GET(request: NextRequest, { params }: { params: { dept: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dept = getRosterDept(params.dept);
  if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });

  if (!canManageRosterDept(dept, (session.user as any).role)) {
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

  // Anaesthetists work by SURGICAL SUBSPECIALTY: on elective days each anaesthetist
  // covers one or more surgical subspecialties; the CALL consultant covers ALL
  // emergencies. So for this department the "Sub-role" column becomes a dropdown
  // of real surgical subspecialties (+ an ALL EMERGENCIES option for on-call).
  const isAnaes = dept.slug === 'anaesthetists';
  const ON_CALL_ALL = ON_CALL_ALL_SPECIALTIES;
  let subspecialties: string[] = [];
  if (isAnaes) {
    const units = await prisma.surgicalUnit.findMany({
      where: { active: true },
      select: { subspecialty: true },
      orderBy: { subspecialty: 'asc' },
    });
    subspecialties = Array.from(new Set(units.map((u) => u.subspecialty).filter(Boolean)));
  }

  // Anaesthetic technicians are assigned to a THEATRE, or to day-call / night-call
  // emergency cover, or ICU. So for this department the "Sub-role" column becomes
  // an "Assignment" dropdown of real theatres + those call/ICU options — the app
  // later matches a case's theatre to the technician assigned to it.
  const isTech = dept.slug === 'anaesthetic-technicians';
  const TECH_SPECIALS = ['DAY CALL (emergency cover)', 'NIGHT CALL (emergency cover)', 'ICU'];
  let theatreNames: string[] = [];
  if (isTech) {
    const theatres = await prisma.theatreSuite.findMany({ select: { name: true }, orderBy: { name: 'asc' } });
    theatreNames = theatres.map((t) => t.name).filter(Boolean);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'UNTH Theatre ORM';
  const ws = wb.addWorksheet('Roster');
  const lists = wb.addWorksheet('Lists');
  lists.state = 'veryHidden';

  const subRoles = isAnaes
    ? [ON_CALL_ALL, ...subspecialties]
    : isTech
      ? [...theatreNames, ...TECH_SPECIALS]
      : dept.subRoles?.length ? dept.subRoles : SUBROLE_FALLBACK;
  const seniority = dept.seniorityLevels?.length ? dept.seniorityLevels : SENIORITY_FALLBACK;
  const locations = [...LOCATIONS];
  // Offer the shift wording this department uses on its own roster page, so the
  // spreadsheet and the web form can't drift apart. normShift() on the upload
  // side maps these labels back onto the stored DutyShift values.
  const shiftLabels = getShiftOptions(dept).map((s) => s.label);
  const col4Label = isAnaes ? 'Subspecialty' : isTech ? 'Assignment' : 'Sub-role';
  const headers = ['Name', 'Date', 'Shift', col4Label, 'Seniority', 'Location', 'Notes'];

  // Lists sheet — one column per option set (A..G). Dates are stored as TEXT so
  // Excel can't silently reformat them.
  lists.getColumn(2).numFmt = '@';
  const putCol = (col: number, arr: string[]) => arr.forEach((v, i) => { lists.getCell(i + 1, col).value = v; });
  putCol(1, names.length ? names : ['(no staff found — type the name)']);
  putCol(2, dates);
  putCol(3, shiftLabels);
  putCol(4, subRoles);
  putCol(5, seniority);
  putCol(6, locations);
  putCol(7, NOTE_OPTIONS);

  const ref = (col: string, n: number) => `Lists!$${col}$1:$${col}$${Math.max(n, 1)}`;

  // Roster sheet — header + validated data rows.
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
  ws.columns = [
    { width: 26 }, { width: 14 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 26 },
  ];
  ws.getColumn(2).numFmt = '@'; // Date column stays text -> uploads as YYYY-MM-DD
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
    ws.getCell(r, 1).dataValidation = listVal(ref('A', names.length), 'Choose a staff member');
    ws.getCell(r, 2).dataValidation = listVal(ref('B', dates.length), 'Choose the exact date');
    ws.getCell(r, 3).dataValidation = listVal(ref('C', shiftLabels.length), shiftLabels.join(' / '));
    ws.getCell(r, 4).dataValidation = listVal(
      ref('D', subRoles.length),
      isAnaes
        ? 'Surgical subspecialty covered — or ALL EMERGENCIES for the on-call consultant'
        : isTech
          ? 'Theatre covered — or DAY CALL / NIGHT CALL / ICU'
          : 'Sub-role (optional)'
    );
    ws.getCell(r, 5).dataValidation = listVal(
      ref('E', seniority.length),
      isAnaes ? 'CONSULTANT for consultants, REGISTRAR/SENIOR_REGISTRAR for residents' : 'Seniority (optional)'
    );
    ws.getCell(r, 6).dataValidation = listVal(ref('F', locations.length), 'Location');
    ws.getCell(r, 7).dataValidation = listVal(ref('G', NOTE_OPTIONS.length), 'Notes (optional)');
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
