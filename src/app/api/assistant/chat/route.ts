import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const askSchema = z.object({
  question: z.string().min(1),
  contextPath: z.string().optional(),
  channel: z.enum(['TEXT', 'VOICE']).optional(),
});

interface KbEntry {
  keywords: string[]; // lowercased tokens / phrases
  answer: string;
  followups?: string[];
}

// A pragmatic, role-aware knowledge base. Easy to extend as the system grows.
const KB: KbEntry[] = [
  {
    keywords: ['emergency', 'book emergency', 'urgent case'],
    answer:
      'To book an emergency case: open the dashboard menu, choose Emergency Cases, click "New Emergency", select the patient and theatre, set urgency to EMERGENCY, then submit. The Theatre Manager and on-call team will be notified automatically.',
  },
  {
    keywords: ['available theatres', 'free theatre', 'theatre available', 'show theatres'],
    answer:
      'Open Operating Theatres from the menu. Theatres marked AVAILABLE in green can accept the next case. Use the Theatre Allocation Schedule to see current bookings.',
  },
  {
    keywords: ['report delay', 'delay'],
    answer:
      'To report a delay: open the active surgery in Theatre Operations, click Report Delay, choose category, add a brief description, and submit. The system records the timestamp and notifies the Theatre Manager.',
  },
  {
    keywords: ['fault', 'broken', 'faulty', 'biomedical'],
    answer:
      'To report a faulty item: open Sub-Stores, find the item, click "Report Fault", choose severity, describe the fault, and submit. Biomedical engineers, the Theatre Manager and admins will be notified automatically.',
  },
  {
    keywords: ['radio', 'announcement', 'broadcast', 'speak'],
    answer:
      'The Theatre Radio plays announcements automatically. To trigger a manual announcement, open Radio Service from the menu, click New Announcement, select category and priority, and click Broadcast. Emergency announcements override music and routine playback.',
  },
  {
    keywords: ['acknowledge', 'ack', 'porter call', 'cleaner call'],
    answer:
      'When the radio repeats a porter or cleaner call, click the green Acknowledge button on the radio bar at the bottom of the screen and confirm. Your identity and response time are logged.',
  },
  {
    keywords: ['sub store', 'substore', 'sub-store'],
    answer:
      'Each theatre has two sub-stores: Scrub Nurse and Anaesthetic Technician. Open Sub-Stores → choose the theatre → choose the owner. Use AM and EOD buttons to log daily check-in/out, and Report Fault for any faulty item.',
  },
  {
    keywords: ['knife on skin', 'start surgery'],
    answer:
      'Open the active surgery, click "Knife on Skin" in the timing panel. The radio will announce the start of surgery and the system records the timestamp.',
  },
  {
    keywords: ['end of surgery', 'finish surgery', 'close case'],
    answer:
      'In the timing panel click "End of Surgery". The radio will announce completion with the procedure duration and automatically call porters and cleaners until acknowledged.',
  },
  {
    keywords: ['help', 'what can you do', 'capabilities'],
    answer:
      'I can help with: booking emergencies, finding available theatres, reporting delays and faults, using sub-stores, triggering radio announcements, and walking you through the surgical workflow. Try asking "how do I report a delay?" or "show available theatres".',
  },
];

function score(question: string, entry: KbEntry): number {
  const q = question.toLowerCase();
  let s = 0;
  for (const k of entry.keywords) {
    if (q.includes(k)) s += k.length; // longer match wins
  }
  return s;
}

async function dynamicAnswer(question: string): Promise<string | null> {
  const q = question.toLowerCase();

  if (q.includes('how many') && (q.includes('theatre') || q.includes('suite'))) {
    const n = await prisma.theatreSuite.count();
    return `There are ${n} theatre suites configured in the system.`;
  }
  if ((q.includes('available') || q.includes('free')) && q.includes('theatre')) {
    const list = await prisma.theatreSuite.findMany({
      where: { status: 'AVAILABLE' as any },
      select: { name: true, location: true },
      take: 20,
    });
    if (list.length === 0) return 'No theatres are currently marked as available.';
    return `Currently available theatres: ${list.map((t) => t.name).join(', ')}.`;
  }
  if (q.includes('today') && q.includes('surger')) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const n = await prisma.surgery.count({
      where: { scheduledDate: { gte: start, lt: end } },
    });
    return `${n} surgeries are scheduled for today.`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = askSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 400 });

  const { question, contextPath, channel } = parsed.data;

  let answer = await dynamicAnswer(question);
  if (!answer) {
    const ranked = KB.map((e) => ({ e, s: score(question, e) })).sort((a, b) => b.s - a.s);
    if (ranked[0] && ranked[0].s > 0) {
      answer = ranked[0].e.answer;
    } else {
      answer =
        "I can help with theatre operations: emergencies, available theatres, sub-stores, fault reports, radio announcements, and the surgical workflow. Try asking 'how do I book an emergency case?' or 'how do I report a fault?'";
    }
  }

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  await prisma.assistantInteraction.create({
    data: {
      userId,
      userRole,
      question,
      answer,
      channel: channel ?? 'TEXT',
      contextPath,
    },
  });

  return NextResponse.json({ answer });
}
