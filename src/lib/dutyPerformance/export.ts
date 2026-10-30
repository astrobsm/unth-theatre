// ============================================================
// The board as something you can paste into WhatsApp
// ------------------------------------------------------------
// The whole point of measuring this is that the figures get seen. A report
// that lives behind a login and a date picker is read by the person who
// already knew; one pasted into the departmental group is read by everybody
// it is about.
//
// PLAIN TEXT, NOT A SCREENSHOT. A screenshot of a table is unreadable on a
// phone, cannot be searched, and loses the names at the bottom. WhatsApp's own
// *bold* is used and nothing else, because every other markup renders as
// literal asterisks and underscores on somebody's handset.
//
// NAMES THAT ARE PRAISED ARE NAMED. NAMES THAT ARE CHASED ARE NOT.
//
// This is the one judgement in this file and it is deliberate. A group message
// listing who is failing is a public reprimand delivered to an audience, and
// it produces humiliation and silence rather than packed trolleys — and it
// reaches people with no standing to act on it. The shortfall is reported as a
// COUNT so the department sees the scale honestly, and the individual
// conversation happens through the chase message, which goes to one person.
// Anyone who needs the names can open the board.
// ============================================================

import { DUTIES, type DutyKey, type DutyReport } from './types';
import { formatRate } from './report';

/** "1–31 October 2026" */
export function periodLabel(from: string, to: string): string {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
    return { y, m: m || 1, d: d || 1 };
  };
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const a = parse(from);
  const b = parse(to);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${months[a.m - 1]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${months[a.m - 1]} – ${b.d} ${months[b.m - 1]} ${a.y}`;
  return `${a.d} ${months[a.m - 1]} ${a.y} – ${b.d} ${months[b.m - 1]} ${b.y}`;
}

const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`);

/**
 * The whole board as a WhatsApp message.
 *
 * @param topN how many names to praise. Ten is about where a group message
 *             stops being read; beyond that it scrolls and nobody reaches the
 *             end, including the people near it.
 */
export function buildWhatsAppSummary(
  report: DutyReport,
  options: { topN?: number } = {},
): string {
  const d = DUTIES[report.duty];
  const topN = options.topN ?? 10;
  const period = periodLabel(report.from, report.to);
  const onTimeShare = report.total > 0 ? report.onTime / report.total : null;

  const lines: string[] = [
    `*UNTH THEATRE — ${d.label.toUpperCase()}*`,
    `${period}`,
    ``,
    `*How we did*`,
    `• ${report.total} due, ${report.done} ${d.verb}`,
    `• On time: ${report.onTime} (${formatRate(onTimeShare)})`,
  ];

  if (report.late > 0) lines.push(`• Done late: ${report.late}`);
  if (report.outstanding > 0) lines.push(`• Not done at all: ${report.outstanding}`);

  if (report.total === 0) {
    lines.push(``, `Nothing was due in this period.`);
    return lines.join('\n');
  }

  // ── The people worth naming ────────────────────────────────────────
  const praise = report.commendable.slice(0, topN);
  if (praise.length > 0) {
    lines.push(``, `*Thank you — on time, every time or nearly*`);
    praise.forEach((p, i) => {
      const share = p.total > 0 ? (p.done - p.late) / p.total : null;
      lines.push(
        `${medal(i)} ${p.name} — ${p.done - p.late}/${p.total} (${formatRate(share)})`
        + (p.perfect ? ' ✅' : ''),
      );
    });
  } else {
    lines.push(
      ``,
      `No individual record reached the ${Math.round(0.9 * 100)}% mark this period. `
      + `That is a target worth having rather than a judgement on anybody.`,
    );
  }

  // ── Units, which are fair to name in either direction ──────────────
  const rankedUnits = report.units.filter((u) => u.ranked);
  if (rankedUnits.length > 1) {
    lines.push(``, `*By unit*`);
    rankedUnits.slice(0, topN).forEach((u, i) => {
      const share = u.total > 0 ? u.onTime / u.total : null;
      lines.push(`${i + 1}. ${u.unit} — ${u.onTime}/${u.total} on time (${formatRate(share)})`);
    });
  }

  // ── The shortfall, as a number and not a list of names ─────────────
  if (report.chaseable.length > 0) {
    lines.push(
      ``,
      `${report.chaseable.length} colleague${report.chaseable.length === 1 ? ' is' : 's are'} `
      + `below ${Math.round(0.7 * 100)}%. They are being written to individually — `
      + `this is not the place for names.`,
    );
  }

  lines.push(
    ``,
    `*Why this matters.* ${d.why}`,
    ``,
    `Deadline: ${d.deadline}.`,
    ``,
    `Theatre Management, UNTH Ituku-Ozalla`,
  );

  return lines.join('\n');
}

/** A wa.me link that opens WhatsApp with the summary ready to send. */
export function whatsAppShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** The detail, as a CSV somebody can open in Excel and keep. */
export function buildCsv(report: DutyReport): string {
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows: string[] = [
    ['Person', 'Unit', 'What', 'Due', 'Done', 'State', 'Minutes early (negative = late)']
      .map(esc).join(','),
  ];
  report.cases.forEach((c) => {
    rows.push([
      esc(c.personName), esc(c.unit), esc(c.label),
      esc(c.dueAtLabel), esc(c.doneAtLabel), esc(c.state),
      esc(c.marginMinutes),
    ].join(','));
  });
  return rows.join('\n');
}
