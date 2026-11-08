// ============================================================
// Who may read this board, and who may send from it
// ------------------------------------------------------------
// TWO LEVELS, DELIBERATELY. Any perioperative nurse may READ the board: a
// supervisor who can see their own day closes the gap without anybody writing
// to them, and that is the outcome worth having. SENDING is theatre
// management's, because a message carrying a medicolegal warning is not
// something one nurse should be able to send another.
//
// IN A LIB, NOT IN THE ROUTE. A Next.js route file may export only its HTTP
// handlers; an extra named export fails the build with
// "OmitWithTag<...> does not satisfy the constraint '{ [x: string]: never; }'".
// Both routes read these from here, so the board and the send button cannot
// drift apart on who is allowed to do what.
// ============================================================

/** Who may read the board. Every nurse who could hold a supervising post. */
export const RECOVERY_VIEW_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
  'HEAD_OF_ANAESTHESIA', 'HEAD_OF_SURGERY', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST',
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'INFECTION_CONTROL_NURSE',
] as const;

/** Who may send one. */
export const RECOVERY_SEND_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC', 'HEAD_OF_ANAESTHESIA',
] as const;

/** The default window: the fortnight that has just gone. */
export const RECOVERY_WINDOW_DAYS = 14;

/** A YYYY-MM-DD shifted by whole days. Noon, so no offset can cross a date. */
export function shiftDay(day: string, by: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  t.setUTCDate(t.getUTCDate() + by);
  return t.toISOString().slice(0, 10);
}

export const isDayString = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
