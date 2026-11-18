// ============================================================
// Writing to the celebrant yourself, from your own WhatsApp
// ------------------------------------------------------------
// The Send button queues the hospital's message through the dispatcher: it
// goes out under the hospital's number, it is recorded, and the row then says
// "Sent". That is the right thing for a greeting the institution owes.
//
// It is not the same thing as the Theatre Manager writing to somebody on
// their birthday. A message that arrives from a person, on a day when they
// could have said nothing, is the one that is remembered -- and until now the
// screen that KNOWS whose birthday it is could not do that, so whoever wanted
// to had to go and look the number up.
//
// So: one button that opens WhatsApp with the number filled in and the
// hospital's own words already written, which the sender can then say in
// their own. The message is built by buildPersonalCelebrationMessage -- the
// same function the dispatcher uses -- so the two cannot drift apart.
//
// NOTHING IS SENT FROM HERE. It opens a chat; a person presses send, on their
// own phone, under their own name. That is also why this does not mark the
// celebration as sent: the hospital's message has not gone out, and a row
// that claimed otherwise would stop the real one being sent.
// ============================================================

import { whatsappLink } from '@/lib/whatsapp';
import { buildPersonalCelebrationMessage, type PersonalKind } from './messages';

export interface CelebrantForLink {
  kind: string;
  label?: string | null;
  sinceYear?: number | null;
  person: {
    fullName: string;
    role: string | null;
    /** Null when nobody has recorded one. */
    phone?: string | null;
    /** Set when this colleague asked not to be written to on WhatsApp. */
    whatsappOptOut?: boolean;
  };
}

export type CelebrantLink =
  | { ok: true; href: string; message: string }
  | { ok: false; why: string };

const KINDS: PersonalKind[] = ['BIRTHDAY', 'WEDDING_ANNIVERSARY', 'WORK_ANNIVERSARY', 'OTHER'];

function asKind(kind: string): PersonalKind {
  const upper = (kind ?? '').toUpperCase() as PersonalKind;
  return KINDS.includes(upper) ? upper : 'OTHER';
}

/**
 * The chat to open for this celebrant, or why there is not one.
 *
 * The refusals are sentences rather than flags because they are shown where
 * the button would have been. "No phone number on file" is a thing somebody
 * can go and fix; a greyed-out button is not.
 */
export function celebrantWhatsAppLink(c: CelebrantForLink, on: string): CelebrantLink {
  // An opt-out covers this as much as it covers the automatic send. The
  // dispatcher honours it in queueMessage(); a button beside it that did not
  // would make the setting a matter of which screen you were standing on.
  if (c.person.whatsappOptOut) {
    return { ok: false, why: 'Asked not to be written to on WhatsApp.' };
  }

  const message = buildPersonalCelebrationMessage({
    kind: asKind(c.kind),
    label: c.label ?? null,
    date: on,
    personName: c.person.fullName,
    role: c.person.role,
    sinceYear: c.sinceYear ?? null,
  });

  const href = whatsappLink(c.person.phone ?? null, message);
  if (!href) return { ok: false, why: 'No phone number on file.' };

  return { ok: true, href, message };
}
