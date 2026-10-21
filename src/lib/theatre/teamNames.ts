// ============================================================
// One person, one line on the unit card
// ------------------------------------------------------------
// The card showed the same person twice, in two roles and two spellings:
//
//   GS Unit I   Surgeon        Nwosu EvanTherese        07038369904
//               Snr registrar  Dr Nwosu evantherese     no number
//
//   PS Unit 2   House officer  Praise Nzubechukwu Oko   no number
//               House officer  Praise Nzubechukwu oko   08141981079
//
// The card de-duplicated on an exact string match, so "Oko" and "oko" were
// two people, and a "Dr " prefix made a third. The second pair is the worse
// of the two: the same house officer listed twice, once with a number and
// once without, which is a card that makes somebody choose.
//
// WHY THIS HAPPENS AT ALL, and why it will keep happening. The team picker
// has a free-text fallback — deliberately, because a house officer who has
// no account yet must still be nameable on the case. A typed name carries no
// user id, so the only thing linking it to the account of the same person is
// the spelling, and nobody types a name the same way twice.
//
// So names are compared after normalising, and where two entries are the
// same person the one that can actually be RUNG wins. A card exists to be
// read at seven in the morning by somebody who needs a number.
// ============================================================

/** Titles people type in front of a name. Not part of the name. */
const TITLES = /^(?:dr|doctor|prof|professor|mr|mrs|ms|miss|sr|snr|consultant)\.?\s+/i;

/**
 * The comparison form of a staff name.
 *
 * Lower case, titles removed, punctuation dropped, whitespace collapsed. Not
 * for display — only for deciding whether two entries are one person.
 *
 * Deliberately conservative: it collapses spelling noise, not real
 * differences. Two genuinely different people with similar names stay two
 * people, because merging them would hide somebody from the card entirely,
 * which is worse than listing one person twice.
 */
export function normaliseStaffName(raw: string | null | undefined): string {
  let s = (raw ?? '').trim().toLowerCase();
  if (!s) return '';
  // Repeatedly, because "Dr Prof X" and "dr. dr x" both occur.
  let before = '';
  while (before !== s) { before = s; s = s.replace(TITLES, ''); }
  return s
    .replace(/[.,'`’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TeamEntry {
  name: string;
  phone: string | null;
  role: string;
}

/**
 * How good an entry is, when two describe the same person.
 *
 * A number beats no number, by a long way: it is the only reason anybody
 * opens the card. After that, prefer the more senior-sounding role, so a
 * person who is both the operating surgeon and a registrar on the same list
 * reads as the surgeon.
 */
function rank(e: TeamEntry, roleOrder: readonly string[]): number {
  const seniority = roleOrder.indexOf(e.role);
  return (e.phone ? 1000 : 0) + (seniority < 0 ? 0 : roleOrder.length - seniority);
}

/**
 * Collapse a unit's team to one line per person.
 *
 * Keeps the first spelling seen for display — it is as likely to be right as
 * any other — but takes the phone number and the best role from whichever
 * entry has them.
 */
export function dedupeTeam(
  entries: readonly TeamEntry[],
  roleOrder: readonly string[] = [],
): TeamEntry[] {
  const byPerson = new Map<string, TeamEntry>();
  const order: string[] = [];

  for (const e of entries) {
    const key = normaliseStaffName(e.name);
    // A nameless entry is not a person; drop it rather than show a blank row.
    if (!key) continue;

    const seen = byPerson.get(key);
    if (!seen) {
      byPerson.set(key, { ...e });
      order.push(key);
      continue;
    }
    // Same person. Take whatever the better entry has, without losing the
    // number or the role the other one carried.
    const winner = rank(e, roleOrder) > rank(seen, roleOrder) ? e : seen;
    byPerson.set(key, {
      name: seen.name,
      phone: seen.phone ?? e.phone,
      role: winner.role,
    });
  }

  return order.map((k) => byPerson.get(k)!);
}
