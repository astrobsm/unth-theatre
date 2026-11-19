// ============================================================
// Telling somebody the sync has stopped
// ------------------------------------------------------------
// THE RULE, as the hospital set it on 19 November: when the sync fails,
// report it, and ask the person looking at it to take a screenshot and send
// it on WhatsApp to the number held in SYNC_ALERT_WHATSAPP.
//
// WHY A HUMAN STEP AND NOT AN AUTOMATIC MESSAGE. The failure this exists for
// is the one where the machine cannot reach the other side. A system that
// tries to report its own outage over the link that is down reports nothing;
// the person standing in front of the screen can always take a photograph of
// it. The screenshot also carries what no automatic alert would have thought
// to include — whatever else is on the screen at the time.
//
// THE NUMBER IS NOT IN THIS REPOSITORY. It is a personal mobile number, and
// personal numbers live in the server's environment here, as Ayogu's does. A
// number committed to a repository is a number in every clone, every fork and
// every backup of it, for as long as the repository exists.
//
// WHEN IT FIRES. Only when the queue has stopped MOVING — not merely when it
// is non-empty. A backlog that is draining needs nobody, and an alert that
// cries at every transient backlog is one people turn off, which is how the
// 8 September strandings sat unreported for ten weeks.
// ============================================================

/** Where the screenshot goes. Absent is not an error — the alert still shows. */
export function alertNumber(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.SYNC_ALERT_WHATSAPP ?? '').trim();
  return raw || null;
}

export interface QueueHealth {
  /** Entries waiting to go to the cloud. */
  unsent: number;
  /** The oldest of them, or null when nothing is waiting. */
  oldestUnsent?: Date | string | null;
  /** Entries this node could not apply. */
  deferred?: number;
  /** When the last push succeeded. */
  lastPushOkAt?: Date | string | null;
}

export interface SyncAlert {
  /** Whether anything should be shown at all. */
  raise: boolean;
  /** One line, for a banner. */
  headline: string;
  /** What has gone wrong, in words a ward clerk can repeat down a phone. */
  detail: string;
  /** What to do about it. Null when there is nothing to do. */
  action: string | null;
}

const hoursSince = (v: Date | string | null | undefined, now: Date): number | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / 3_600_000;
};

/** A backlog older than this has stopped being a backlog and become a fault. */
export const STALE_AFTER_HOURS = 2;

/**
 * Whether to raise the alarm, and what to say.
 *
 * Deliberately quiet about a queue that is simply busy. The test is the AGE of
 * the oldest waiting entry and the time since the last successful push — both
 * of which keep rising when the sync is stuck and both of which fall back on
 * their own when it is merely slow.
 */
export function syncAlert(
  health: QueueHealth,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): SyncAlert {
  const number = alertNumber(env);
  const sendTo = number
    ? `take a screenshot of this screen and send it on WhatsApp to ${number}.`
    : 'take a screenshot of this screen and send it to the theatre IT contact. '
      + '(No alert number is configured on this server — set SYNC_ALERT_WHATSAPP.)';

  const oldest = hoursSince(health.oldestUnsent, now);
  const sincePush = hoursSince(health.lastPushOkAt, now);

  if (health.unsent === 0) {
    return {
      raise: false,
      headline: 'Everything written here has reached the cloud.',
      detail: '',
      action: null,
    };
  }

  const stuck = (oldest !== null && oldest >= STALE_AFTER_HOURS)
    || (sincePush !== null && sincePush >= STALE_AFTER_HOURS);

  if (!stuck) {
    return {
      raise: false,
      headline: `${health.unsent} change${health.unsent === 1 ? '' : 's'} on the way to the cloud.`,
      detail: 'The queue is moving. Nothing needs doing.',
      action: null,
    };
  }

  const age = oldest === null
    ? 'some time'
    : oldest >= 48 ? `${Math.round(oldest / 24)} days`
      : `${Math.round(oldest)} hours`;

  return {
    raise: true,
    headline: 'Changes made here are not reaching the cloud.',
    detail:
      `${health.unsent} change${health.unsent === 1 ? ' has' : 's have'} been waiting for ${age}. `
      + 'Work on this server is safe and the theatre can carry on using it, but the cloud copy '
      + 'is behind — so a case booked here may not appear on a phone or on another computer.'
      + (health.deferred
        ? ` ${health.deferred} change${health.deferred === 1 ? '' : 's'} from the cloud could `
          + 'not be applied here either.'
        : ''),
    action: `Please ${sendTo}`,
  };
}
