// ============================================================
// "Not assigned" was not true
// ------------------------------------------------------------
// Reported on 6 November, looking at My Theatre Team:
//
//   "the information here is not correct, the anaesthetic technicians are
//    assigned but it shows not assigned"
//
// They were right, and the data says exactly how. For 6 November 2026 the
// live database held:
//
//   theatre allocations for the day ....... 4
//     with an anaesthetic technician ...... 0
//     with any anaesthetist ............... 0
//     with a scrub nurse .................. 4   <- which is why only nurses showed
//   surgeries for the day ................. 23
//     with an anaesthetist on the case .... 23  <- every single one
//   published roster rows for the morning
//     anaesthetists ....................... 15
//     anaesthetic technicians ............. 16
//
// So three different parts of the hospital record who is working, in three
// different places, and the card read exactly one of them. The nurses fill
// in the theatre allocation, so scrub nurses appeared. The anaesthetists are
// named on each case. The technicians are on the published duty roster. The
// card said "Not assigned" about sixteen technicians who were on duty and
// twenty-three anaesthetists who were named on the day's cases.
//
// WHAT THIS FILE REFUSES TO DO. It does not fill the empty allocation
// columns in from the roster. Not one of those 37 roster rows names a
// theatre — the anaesthesia department publishes a shift, not a room — so
// writing "Theatre 1: John" from a roster row would be inventing a fact
// nobody recorded, and the first time somebody went to Theatre 1 expecting
// John the screen would have lied to them.
//
// WHAT IT DOES INSTEAD. It answers with the best thing actually known, and
// says which it is. A name allocated to the theatre, a name taken from the
// day's cases in that theatre, or a list of who is on duty with no room
// against them — three different claims, labelled as three different
// claims. "On duty, not allocated to a theatre" is a useful sentence. "Not
// assigned" was a false one.
// ============================================================

export type TeamSource = 'allocation' | 'cases' | 'roster' | 'none';

export interface NamedPerson {
  id?: string | null;
  name: string;
  /** Consultant / Senior Registrar / Registrar, where it is known. */
  tier?: string | null;
}

export interface TeamLine {
  source: TeamSource;
  people: NamedPerson[];
  /**
   * What the screen says about where this came from. Null for an
   * allocation, which needs no explanation — it is the thing the card has
   * always claimed to show.
   */
  note: string | null;
}

/**
 * Drop blanks and the same person twice, keeping the first mention.
 *
 * MATCHED ON THE ID *AND* ON THE NAME, not on whichever is present. The
 * same anaesthetist arrives here from different places — a case with the
 * user relation loaded carries an id, a roster row whose user was deleted
 * carries only a name — and keying on "id, or else name" let one person
 * through twice under two different keys. A card listing the same
 * consultant twice is how a reader concludes two of them are covering the
 * room.
 */
export function dedupe(people: readonly NamedPerson[]): NamedPerson[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const out: NamedPerson[] = [];
  for (const p of people) {
    const name = (p?.name ?? '').trim();
    if (!name) continue;
    const id = (p.id ?? '').trim();
    const nameKey = name.toLowerCase();
    if ((id && seenIds.has(id)) || seenNames.has(nameKey)) continue;
    if (id) seenIds.add(id);
    seenNames.add(nameKey);
    out.push({ ...p, name });
  }
  return out;
}

/**
 * The best answer available, and where it came from.
 *
 * Order is by how specific the claim is, not by how full the list is: one
 * name allocated to this theatre beats sixteen on the morning roster, every
 * time, because the question the card asks is "who is in this room".
 */
export function resolveTeamLine(opts: {
  allocation?: readonly NamedPerson[] | null;
  fromCases?: readonly NamedPerson[] | null;
  onDuty?: readonly NamedPerson[] | null;
  /** MORNING / CALL / NIGHT, for the wording of the roster note. */
  shift?: string | null;
  /** "anaesthetist" / "anaesthetic technician", for the wording. */
  what: string;
}): TeamLine {
  const allocated = dedupe(opts.allocation ?? []);
  if (allocated.length > 0) return { source: 'allocation', people: allocated, note: null };

  const fromCases = dedupe(opts.fromCases ?? []);
  if (fromCases.length > 0) {
    return {
      source: 'cases',
      people: fromCases,
      note: fromCases.length === 1
        ? 'Named on this theatre’s case today, not on the theatre allocation.'
        : 'Named on this theatre’s cases today, not on the theatre allocation.',
    };
  }

  const onDuty = dedupe(opts.onDuty ?? []);
  if (onDuty.length > 0) {
    const shift = (opts.shift || '').toLowerCase();
    return {
      source: 'roster',
      people: onDuty,
      // Said carefully. These people are on duty; none of them has been put
      // in this room by anybody, and the card must not imply otherwise.
      note: `On the published ${shift ? `${shift} ` : ''}roster today — `
        + `not allocated to a named theatre. Ask the ${opts.what} in charge who is covering this room.`,
    };
  }

  return { source: 'none', people: [], note: null };
}

/** How the card prints a line: the names, then the count it hid. */
export function summariseLine(line: TeamLine, maxNamed = 3): string {
  if (line.people.length === 0) return 'Not assigned';
  const named = line.people.slice(0, maxNamed).map((p) => p.name);
  const rest = line.people.length - named.length;
  return rest > 0 ? `${named.join(', ')} +${rest} more` : named.join(', ');
}

/**
 * Is anybody at all accounted for on this theatre?
 *
 * Used for the card's "team assigned" flag, which was previously false
 * whenever the allocation row was empty — on a day when every case had an
 * anaesthetist and sixteen technicians were on duty.
 */
export function anyoneKnown(lines: readonly TeamLine[]): boolean {
  return lines.some((l) => l.people.length > 0);
}
