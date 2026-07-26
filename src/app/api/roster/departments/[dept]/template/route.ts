import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRosterDept, canManageRosterDept, LOCATIONS } from '@/lib/rosterDepartments';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHIFTS = ['MORNING', 'CALL', 'NIGHT'];
const HEADERS = ['Name', 'Day', 'Shift', 'Sub-role', 'Seniority', 'Location', 'Notes'];
const DATA_ROWS = 300;

// GET /api/roster/departments/[dept]/template
// Returns a department-specific .xlsx with dropdown (data-validation) lists —
// staff names for THIS department, plus Day/Shift/Sub-role/Seniority/Location —
// so a manager just picks from menus and re-uploads.
export async function GET(_request: NextRequest, { params }: { params: { dept: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dept = getRosterDept(params.dept);
  if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });

  if (!canManageRosterDept(dept, (session.user as any).role)) {
    return NextResponse.json({ error: 'Not allowed to manage this department roster' }, { status: 403 });
  }

  const staff = await prisma.user.findMany({
    where: { role: { in: dept.userRoles as any }, status: 'APPROVED' },
    select: { fullName: true },
    orderBy: { fullName: 'asc' },
  });
  const names = staff.map((s) => s.fullName).filter(Boolean);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'UNTH Theatre ORM';
  const ws = wb.addWorksheet('Roster');
  const lists = wb.addWorksheet('Lists');
  lists.state = 'veryHidden'; // keep the option lists out of the way

  // --- Lists sheet: one column per option set --------------------------------
  const putCol = (col: number, arr: string[]) => arr.forEach((v, i) => { lists.getCell(i + 1, col).value = v; });
  const subRoles = dept.subRoles || [];
  const seniority = dept.seniorityLevels || [];
  const locations = [...LOCATIONS];
  putCol(1, names.length ? names : ['(no staff found — type the name)']);
  putCol(2, DAYS);
  putCol(3, SHIFTS);
  putCol(4, subRoles);
  putCol(5, seniority);
  putCol(6, locations);

  const ref = (col: string, n: number) => `Lists!$${col}$1:$${col}$${Math.max(n, 1)}`;

  // --- Roster sheet: header + validated data rows ----------------------------
  ws.addRow(HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
  ws.columns = [
    { width: 26 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 30 },
  ];
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const listVal = (formula: string, prompt: string) => ({
    type: 'list' as const,
    allowBlank: true,
    formulae: [formula],
    showErrorMessage: false, // lenient: allow typing a value that isn't in the list
    promptTitle: 'Pick or type',
    prompt,
  });

  for (let r = 2; r <= DATA_ROWS + 1; r++) {
    ws.getCell(r, 1).dataValidation = listVal(ref('A', names.length), 'Choose a staff member');
    ws.getCell(r, 2).dataValidation = listVal(ref('B', DAYS.length), 'Choose a day (or type a date like 2026-07-29)');
    ws.getCell(r, 3).dataValidation = listVal(ref('C', SHIFTS.length), 'MORNING / CALL / NIGHT');
    if (subRoles.length) ws.getCell(r, 4).dataValidation = listVal(ref('D', subRoles.length), 'Optional sub-role');
    if (seniority.length) ws.getCell(r, 5).dataValidation = listVal(ref('E', seniority.length), 'Optional seniority');
    ws.getCell(r, 6).dataValidation = listVal(ref('F', locations.length), 'Location');
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="roster-template-${dept.slug}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
