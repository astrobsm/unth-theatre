import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * READINESS DEADLINE CHECKER — Called by Vercel Cron or client-side scheduler
 * 
 * Deadlines:
 * 1. CSSD, Laundry, Power House, Oxygen — must log readiness by 5:00 PM daily
 *    - 4:45 PM: First reminder push notification
 *    - 4:50 PM: Second reminder
 *    - 4:55 PM: Third reminder  
 *    - 5:00 PM: Final warning (last chance)
 *    - 6:00 PM: Auto-generate disciplinary query from CMD office
 * 
 * 2. Theatre Technicians — must log theatre setup by 8:00 AM daily
 *    - 7:45 AM: Reminder
 *    - 8:00 AM: Final warning
 *    - 8:15 AM: Auto-generate disciplinary query (escalates to CMD)
 * 
 * GET ?action=check-reminders  — Check and send reminders
 * GET ?action=check-deadlines  — Check deadlines and issue queries
 */

function generateRefNumber(): string {
  const date = new Date();
  const yy = date.getFullYear().toString().slice(-2);
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `DQ-${yy}${mm}${dd}-${rand}`;
}

function getTodayDateRange() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { startOfDay, endOfDay, now };
}

// Check if a unit has submitted their readiness report today
async function hasSubmittedToday(unit: string, startOfDay: Date, endOfDay: Date): Promise<{ submitted: boolean; staffIds: string[] }> {
  const dateFilter = { gte: startOfDay, lte: endOfDay };

  switch (unit) {
    case 'CSSD': {
      const reports = await prisma.cssdReadinessReport.findMany({
        where: { reportDate: dateFilter },
        select: { reportedById: true },
      });
      return { submitted: reports.length > 0, staffIds: reports.map(r => r.reportedById) };
    }
    case 'LAUNDRY': {
      const reports = await prisma.laundryReadiness.findMany({
        where: { reportDate: dateFilter },
        select: { reportedById: true },
      });
      return { submitted: reports.length > 0, staffIds: reports.map(r => r.reportedById) };
    }
    case 'POWER_HOUSE': {
      const reports = await prisma.powerReadinessReport.findMany({
        where: { reportDate: dateFilter },
        select: { reportedById: true },
      });
      return { submitted: reports.length > 0, staffIds: reports.map(r => r.reportedById) };
    }
    case 'OXYGEN': {
      const reports = await prisma.oxygenReadinessReport.findMany({
        where: { reportDate: dateFilter },
        select: { reportedById: true },
      });
      return { submitted: reports.length > 0, staffIds: reports.map(r => r.reportedById) };
    }
    case 'WATER_SUPPLY': {
      const reports = await prisma.waterSupplyReadiness.findMany({
        where: { readinessDate: dateFilter },
        select: { loggedById: true },
      });
      return { submitted: reports.length > 0, staffIds: reports.map(r => r.loggedById) };
    }
    default:
      return { submitted: true, staffIds: [] };
  }
}

// Get responsible staff for a unit
async function getResponsibleStaff(unit: string): Promise<Array<{ id: string; fullName: string; role: string }>> {
  const roleMap: Record<string, string[]> = {
    CSSD: ['CSSD_SUPERVISOR', 'CSSD_STAFF'],
    LAUNDRY: ['LAUNDRY_SUPERVISOR', 'LAUNDRY_STAFF'],
    POWER_HOUSE: ['WORKS_SUPERVISOR', 'POWER_PLANT_OPERATOR'],
    OXYGEN: ['OXYGEN_UNIT_SUPERVISOR'],
    WATER_SUPPLY: ['WATER_SUPPLY_SUPERVISOR', 'WORKS_SUPERVISOR'],
  };

  const roles = roleMap[unit] || [];
  if (roles.length === 0) return [];

  return prisma.user.findMany({
    where: {
      role: { in: roles as any },
      status: 'APPROVED',
    },
    select: { id: true, fullName: true, role: true },
  });
}

// Check if theatre setup was done today for specific theatre/technician
async function getTheatreSetupStatus(startOfDay: Date, endOfDay: Date) {
  // Get today's roster for theatre technicians
  const techRoster = await prisma.roster.findMany({
    where: {
      date: { gte: startOfDay, lte: endOfDay },
      user: {
        role: { in: ['ANAESTHETIC_TECHNICIAN', 'BIOMEDICAL_ENGINEER'] as any },
      },
    },
    include: {
      user: { select: { id: true, fullName: true, role: true } },
    },
  });

  // Get today's theatre setups
  const setups = await prisma.theatreSetup.findMany({
    where: {
      setupDate: { gte: startOfDay, lte: endOfDay },
    },
    select: { collectedBy: true, theatreId: true },
  });

  const setupByUser = new Set(setups.map(s => s.collectedBy));

  // Find techs who have NOT done their setup
  const delinquent = techRoster.filter(r => !setupByUser.has(r.userId));

  return { delinquent, totalOnRoster: techRoster.length, totalCompleted: setups.length };
}

// ============================================================
// WEEKLY DUTY ROSTER (Saturday 5:00 PM deadline)
// ============================================================

// Staff categories that must have a weekly roster uploaded.
const ROSTER_CATEGORIES = [
  'NURSES',
  'ANAESTHETISTS',
  'PORTERS',
  'CLEANERS',
  'ANAESTHETIC_TECHNICIANS',
  'PHARMACISTS',
  'RECOVERY_NURSES',
] as const;

// Department heads / officers responsible for each roster category, used as a
// fallback when no previous uploader can be identified.
const ROSTER_CATEGORY_ROLES: Record<string, string[]> = {
  ANAESTHETISTS: ['CONSULTANT_ANAESTHETIST'],
  NURSES: ['THEATRE_MANAGER'],
  RECOVERY_NURSES: ['THEATRE_MANAGER'],
  PHARMACISTS: ['PHARMACIST'],
  ANAESTHETIC_TECHNICIANS: ['ANAESTHETIC_TECHNICIAN'],
  PORTERS: ['THEATRE_MANAGER'],
  CLEANERS: ['THEATRE_MANAGER'],
};

// Monday 00:00 of the week that follows the given date (the upcoming roster week).
function upcomingWeekStart(from: Date): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const daysUntilMonday = ((8 - day) % 7) || 7; // always the NEXT Monday
  d.setDate(d.getDate() + daysUntilMonday);
  return d;
}

// Determine which roster categories have NOT been uploaded for the upcoming week,
// and who is responsible for each.
async function getRosterSubmissionStatus(now: Date) {
  const weekStart = upcomingWeekStart(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Previous week (for identifying the de-facto roster owner per category).
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  const missing: Array<{
    category: string;
    responsible: Array<{ id: string; fullName: string; role: string }>;
  }> = [];

  for (const category of ROSTER_CATEGORIES) {
    const existing = await prisma.roster.count({
      where: {
        staffCategory: category as any,
        date: { gte: weekStart, lt: weekEnd },
      },
    });

    if (existing > 0) continue;

    const responsible: Array<{ id: string; fullName: string; role: string }> = [];

    // Identify responsible person(s): prefer whoever uploaded last week's roster.
    const prevRosters = await prisma.roster.findMany({
      where: {
        staffCategory: category as any,
        date: { gte: prevWeekStart, lt: weekStart },
      },
      select: { uploadedBy: true },
    });
    const uploaderIds = Array.from(new Set(prevRosters.map(r => r.uploadedBy).filter(Boolean)));
    if (uploaderIds.length > 0) {
      const uploaders = await prisma.user.findMany({
        where: { id: { in: uploaderIds }, status: 'APPROVED' },
        select: { id: true, fullName: true, role: true },
      });
      responsible.push(...uploaders);
    }

    // Fallback to the configured department-head roles.
    if (responsible.length === 0) {
      const roles = ROSTER_CATEGORY_ROLES[category] || [];
      if (roles.length > 0) {
        const heads = await prisma.user.findMany({
          where: { role: { in: roles as any }, status: 'APPROVED' },
          select: { id: true, fullName: true, role: true },
        });
        responsible.push(...heads);
      }
    }

    missing.push({ category, responsible });
  }

  return { missing, weekStart };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'check-all';
    const { startOfDay, endOfDay, now } = getTodayDateRange();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const results: any = {
      timestamp: now.toISOString(),
      action,
      reminders: [],
      queries: [],
    };

    // ============================================================
    // READINESS UNITS: CSSD, Laundry, Power House, Oxygen
    // Deadline: 5:00 PM, Reminders from 4:45 PM, Query at 6:00 PM
    // ============================================================
    const readinessUnits = ['CSSD', 'LAUNDRY', 'POWER_HOUSE', 'OXYGEN', 'WATER_SUPPLY'];

    for (const unit of readinessUnits) {
      const { submitted } = await hasSubmittedToday(unit, startOfDay, endOfDay);

      if (!submitted) {
        const staff = await getResponsibleStaff(unit);
        const supervisors = staff.filter(s =>
          s.role.includes('SUPERVISOR') || s.role === 'POWER_PLANT_OPERATOR' || s.role === 'OXYGEN_UNIT_SUPERVISOR'
        );
        const targetStaff = supervisors.length > 0 ? supervisors : staff;

        // REMINDER PHASE: 4:45 PM - 5:00 PM (every 5 min)
        if (action === 'check-reminders' || action === 'check-all') {
          if (currentHour === 16 && currentMinute >= 45) {
            for (const person of targetStaff) {
              // Create notification as reminder
              try {
                await prisma.notification.create({
                  data: {
                    userId: person.id,
                    title: `⚠️ READINESS REMINDER - ${unit.replace(/_/g, ' ')}`,
                    message: `You have NOT submitted your daily readiness report for ${unit.replace(/_/g, ' ')}. Deadline is 5:00 PM today. Failure to submit by 6:00 PM will result in a disciplinary query from the Office of the Chief Medical Director.`,
                    type: 'READINESS_REMINDER',
                  },
                });
              } catch (e) {
                // Notification model may have different fields
              }
              results.reminders.push({
                unit,
                userId: person.id,
                name: person.fullName,
                type: 'READINESS_5PM_REMINDER',
                time: now.toISOString(),
              });
            }
          }

          // 5:00 PM - 6:00 PM FINAL WARNING
          if (currentHour === 17 && currentMinute < 60) {
            for (const person of targetStaff) {
              try {
                await prisma.notification.create({
                  data: {
                    userId: person.id,
                    title: `🚨 FINAL WARNING - ${unit.replace(/_/g, ' ')} Readiness`,
                    message: `URGENT: You still have NOT submitted your daily readiness report for ${unit.replace(/_/g, ' ')}. A DISCIPLINARY QUERY will be automatically issued at 6:00 PM from the Office of the Chief Medical Director, UNTH Ituku Ozalla.`,
                    type: 'READINESS_FINAL_WARNING',
                  },
                });
              } catch (e) {}
              results.reminders.push({
                unit,
                userId: person.id,
                name: person.fullName,
                type: 'READINESS_FINAL_WARNING',
                time: now.toISOString(),
              });
            }
          }
        }

        // QUERY PHASE: 6:00 PM
        if (action === 'check-deadlines' || action === 'check-all') {
          if (currentHour >= 18) {
            // Check if query already issued today for this unit
            const existingQuery = await prisma.disciplinaryQuery.findFirst({
              where: {
                recipientUnit: unit,
                deadlineType: 'READINESS_5PM',
                createdAt: { gte: startOfDay, lte: endOfDay },
              },
            });

            if (!existingQuery) {
              for (const person of targetStaff) {
                const deadlineTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0);
                const query = await prisma.disciplinaryQuery.create({
                  data: {
                    referenceNumber: generateRefNumber(),
                    recipientId: person.id,
                    recipientName: person.fullName,
                    recipientRole: person.role,
                    recipientUnit: unit,
                    queryType: 'READINESS_LATE',
                    subject: `Non-Submission of Daily Readiness Report - ${unit.replace(/_/g, ' ')}`,
                    description: `Dear ${person.fullName},\n\nThis is to formally query you for failure to submit the daily readiness report for the ${unit.replace(/_/g, ' ')} Unit by the stipulated deadline of 5:00 PM on ${now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.\n\nYour non-compliance has the potential to delay surgical operations scheduled for the following day, putting patients at risk.\n\nYou are hereby required to provide a written explanation for this failure within 24 hours of receipt of this query.\n\nSigned,\nOffice of the Chief Medical Director\nUniversity of Nigeria Teaching Hospital, Ituku Ozalla`,
                    deadlineTime,
                    deadlineType: 'READINESS_5PM',
                    evidence: JSON.stringify({
                      expectedAction: `Submit ${unit} readiness report`,
                      deadline: '5:00 PM',
                      queryIssuedAt: '6:00 PM',
                      date: now.toISOString(),
                    }),
                    issuedByName: 'Office of the Chief Medical Director',
                    issuedByTitle: 'University of Nigeria Teaching Hospital, Ituku Ozalla',
                  },
                });

                // Also create a notification
                try {
                  await prisma.notification.create({
                    data: {
                      userId: person.id,
                      title: `📋 DISCIPLINARY QUERY ISSUED - ${unit.replace(/_/g, ' ')}`,
                      message: `A disciplinary query (Ref: ${query.referenceNumber}) has been issued to you by the Office of the Chief Medical Director for failure to submit your daily readiness report. Please respond within 24 hours.`,
                      type: 'DISCIPLINARY_QUERY',
                    },
                  });
                } catch (e) {}

                results.queries.push({
                  unit,
                  userId: person.id,
                  name: person.fullName,
                  queryRef: query.referenceNumber,
                  type: 'READINESS_LATE',
                });
              }
            }
          }
        }
      }
    }

    // ============================================================
    // THEATRE TECHNICIANS: Setup by 8:00 AM, Query at 8:15 AM
    // ============================================================
    if (action === 'check-reminders' || action === 'check-all') {
      // 7:45 AM reminder
      if (currentHour === 7 && currentMinute >= 45) {
        const { delinquent } = await getTheatreSetupStatus(startOfDay, endOfDay);
        for (const roster of delinquent) {
          try {
            await prisma.notification.create({
              data: {
                userId: roster.userId,
                title: '⚠️ THEATRE SETUP REMINDER',
                message: `You have not yet logged your theatre setup for today. The deadline is 8:00 AM. Failure to complete by 8:15 AM will result in a disciplinary query from the Office of the Chief Medical Director.`,
                type: 'THEATRE_SETUP_REMINDER',
              },
            });
          } catch (e) {}
          results.reminders.push({
            unit: 'THEATRE_SETUP',
            userId: roster.userId,
            name: roster.user.fullName,
            type: 'THEATRE_SETUP_REMINDER',
          });
        }
      }

      // 8:00 AM final warning
      if (currentHour === 8 && currentMinute >= 0 && currentMinute < 15) {
        const { delinquent } = await getTheatreSetupStatus(startOfDay, endOfDay);
        for (const roster of delinquent) {
          try {
            await prisma.notification.create({
              data: {
                userId: roster.userId,
                title: '🚨 FINAL WARNING - Theatre Setup',
                message: `URGENT: You have NOT logged your theatre setup. A DISCIPLINARY QUERY will be automatically issued at 8:15 AM from the Office of the Chief Medical Director, UNTH Ituku Ozalla.`,
                type: 'THEATRE_SETUP_WARNING',
              },
            });
          } catch (e) {}
          results.reminders.push({
            unit: 'THEATRE_SETUP',
            userId: roster.userId,
            name: roster.user.fullName,
            type: 'THEATRE_SETUP_FINAL_WARNING',
          });
        }
      }
    }

    if (action === 'check-deadlines' || action === 'check-all') {
      // 8:15 AM — Auto-generate disciplinary query for theatre technicians
      if (currentHour >= 8 && (currentHour > 8 || currentMinute >= 15)) {
        const { delinquent } = await getTheatreSetupStatus(startOfDay, endOfDay);

        for (const roster of delinquent) {
          // Check if query already exists today
          const existing = await prisma.disciplinaryQuery.findFirst({
            where: {
              recipientId: roster.userId,
              deadlineType: 'THEATRE_SETUP_8AM',
              createdAt: { gte: startOfDay, lte: endOfDay },
            },
          });

          if (!existing) {
            const deadlineTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
            const query = await prisma.disciplinaryQuery.create({
              data: {
                referenceNumber: generateRefNumber(),
                recipientId: roster.userId,
                recipientName: roster.user.fullName,
                recipientRole: roster.user.role,
                recipientUnit: 'THEATRE',
                queryType: 'THEATRE_SETUP_LATE',
                subject: `Failure to Complete Theatre Setup by 8:00 AM`,
                description: `Dear ${roster.user.fullName},\n\nThis is to formally query you for failure to complete and log the theatre setup for your assigned theatre by the stipulated deadline of 8:00 AM on ${now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.\n\nYour failure to set up the assigned theatre in a timely manner delays surgical operations and compromises patient safety.\n\nThis query is automatically escalated to the Chief Medical Director.\n\nYou are hereby required to provide a written explanation for this failure within 24 hours of receipt of this query.\n\nSigned,\nOffice of the Chief Medical Director\nUniversity of Nigeria Teaching Hospital, Ituku Ozalla`,
                deadlineTime,
                deadlineType: 'THEATRE_SETUP_8AM',
                escalatedTo: 'CHIEF_MEDICAL_DIRECTOR',
                escalatedAt: new Date(),
                escalationReason: 'Auto-escalated: Theatre setup deadline missed',
                status: 'ESCALATED',
                evidence: JSON.stringify({
                  expectedAction: 'Complete theatre setup',
                  deadline: '8:00 AM',
                  queryIssuedAt: '8:15 AM',
                  date: now.toISOString(),
                  escalated: true,
                }),
                issuedByName: 'Office of the Chief Medical Director',
                issuedByTitle: 'University of Nigeria Teaching Hospital, Ituku Ozalla',
              },
            });

            try {
              await prisma.notification.create({
                data: {
                  userId: roster.userId,
                  title: '📋 DISCIPLINARY QUERY - Theatre Setup',
                  message: `A disciplinary query (Ref: ${query.referenceNumber}) has been issued and ESCALATED TO THE CHIEF MEDICAL DIRECTOR for failure to complete theatre setup by 8:00 AM. Respond within 24 hours.`,
                  type: 'DISCIPLINARY_QUERY',
                },
              });
            } catch (e) {}

            results.queries.push({
              unit: 'THEATRE',
              userId: roster.userId,
              name: roster.user.fullName,
              queryRef: query.referenceNumber,
              type: 'THEATRE_SETUP_LATE',
              escalated: true,
            });
          }
        }
      }
    }

    // ============================================================
    // WEEKLY DUTY ROSTER: Upload next week's roster by Saturday 5:00 PM
    // Reminders from 4:45 PM, Final warning 5:00 PM, Query at 6:00 PM
    // (Saturday only — getDay() === 6)
    // ============================================================
    if (now.getDay() === 6) {
      const rosterDeadline = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0);

      // REMINDER + FINAL WARNING PHASE
      if (action === 'check-reminders' || action === 'check-all') {
        const isReminderWindow = currentHour === 16 && currentMinute >= 45;
        const isFinalWarning = currentHour === 17;

        if (isReminderWindow || isFinalWarning) {
          const { missing } = await getRosterSubmissionStatus(now);
          for (const { category, responsible } of missing) {
            const label = category.replace(/_/g, ' ');
            for (const person of responsible) {
              try {
                await prisma.notification.create({
                  data: {
                    userId: person.id,
                    title: isFinalWarning
                      ? `🚨 FINAL WARNING - ${label} Duty Roster`
                      : `⚠️ ROSTER REMINDER - ${label}`,
                    message: isFinalWarning
                      ? `URGENT: The weekly duty roster for ${label} has NOT been uploaded for next week. The deadline is 5:00 PM today (Saturday). A MANAGEMENT QUERY will be automatically issued at 6:00 PM for non-compliance.`
                      : `Reminder: The weekly duty roster for ${label} must be uploaded on the app for next week by 5:00 PM today (Saturday). Failure to comply is a queriable offence.`,
                    type: isFinalWarning ? 'ROSTER_FINAL_WARNING' : 'ROSTER_REMINDER',
                  },
                });
              } catch (e) {}
              results.reminders.push({
                unit: 'ROSTER',
                category,
                userId: person.id,
                name: person.fullName,
                type: isFinalWarning ? 'ROSTER_FINAL_WARNING' : 'ROSTER_REMINDER',
                time: now.toISOString(),
              });
            }
          }
        }
      }

      // QUERY PHASE: 6:00 PM (1-hour grace after the 5:00 PM deadline)
      if (action === 'check-deadlines' || action === 'check-all') {
        if (currentHour >= 18) {
          const { missing } = await getRosterSubmissionStatus(now);
          for (const { category, responsible } of missing) {
            const label = category.replace(/_/g, ' ');
            for (const person of responsible) {
              // Avoid duplicate query for the same person/category today.
              const existingQuery = await prisma.disciplinaryQuery.findFirst({
                where: {
                  recipientId: person.id,
                  recipientUnit: `ROSTER_${category}`,
                  deadlineType: 'ROSTER_WEEKLY_5PM',
                  createdAt: { gte: startOfDay, lte: endOfDay },
                },
              });
              if (existingQuery) continue;

              const query = await prisma.disciplinaryQuery.create({
                data: {
                  referenceNumber: generateRefNumber(),
                  recipientId: person.id,
                  recipientName: person.fullName,
                  recipientRole: person.role,
                  recipientUnit: `ROSTER_${category}`,
                  queryType: 'ROSTER_NOT_SUBMITTED',
                  subject: `Failure to Upload Weekly Duty Roster - ${label}`,
                  description: `Dear ${person.fullName},\n\nThis is to formally query you for failure to create and upload the weekly duty roster for the ${label} unit on the Theatre Management Application by the stipulated deadline of 5:00 PM on Saturday, ${now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.\n\nAs communicated by Hospital Management, the weekly duty roster must be updated on the Application every Saturday before 5:00 PM. Failure to do so is regarded as an anti-progress action and a queriable offence, as it disrupts the coordination of activities in the Theatre Complex and places patient safety and institutional efficiency at avoidable risk.\n\nYou are hereby required to provide a written explanation for this failure within 24 hours of receipt of this query.\n\nSigned,\nTheatre Management\nUniversity of Nigeria Teaching Hospital, Ituku-Ozalla`,
                  deadlineTime: rosterDeadline,
                  deadlineType: 'ROSTER_WEEKLY_5PM',
                  evidence: JSON.stringify({
                    expectedAction: `Upload ${label} weekly duty roster`,
                    deadline: 'Saturday 5:00 PM',
                    queryIssuedAt: '6:00 PM',
                    date: now.toISOString(),
                  }),
                  issuedByName: 'Theatre Management',
                  issuedByTitle: 'University of Nigeria Teaching Hospital, Ituku-Ozalla',
                },
              });

              try {
                await prisma.notification.create({
                  data: {
                    userId: person.id,
                    title: `📋 MANAGEMENT QUERY ISSUED - ${label} Roster`,
                    message: `A management query (Ref: ${query.referenceNumber}) has been issued to you for failure to upload the weekly duty roster for ${label} by the Saturday 5:00 PM deadline. Please respond within 24 hours.`,
                    type: 'DISCIPLINARY_QUERY',
                  },
                });
              } catch (e) {}

              results.queries.push({
                unit: 'ROSTER',
                category,
                userId: person.id,
                name: person.fullName,
                queryRef: query.referenceNumber,
                type: 'ROSTER_NOT_SUBMITTED',
              });
            }
          }
        }
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error in deadline checker:', error);
    return NextResponse.json({ error: 'Deadline check failed', details: String(error) }, { status: 500 });
  }
}
