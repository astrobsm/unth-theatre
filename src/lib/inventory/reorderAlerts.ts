// ============================================================
// Telling somebody the stock is running out, before it does
// ------------------------------------------------------------
// ORM has known its reorder levels all along. InventoryItem.reorderLevel has
// existed since the beginning, summariseAvailability() already computes
// belowReorderLevel, and eight screens display it. Nothing has ever SAID it to
// anybody — a store keeper had to open a page and look, which is the same
// reason nobody looked at their surgical blockers.
//
// WHAT THIS IS NOT. It is not a second opinion about stock levels. The
// arithmetic belongs to lib/stock/quantities.ts and lib/stock/allocate.ts:
//
//   onHand    = received + returned − issued − expired − disposed
//   available = onHand − reserved
//
// and summariseAvailability() already excludes expired and disposed batches
// before counting. This file classifies that number and works out who should
// hear about it. A second definition of "available" that drifted from the
// first would be worse than no alert at all, because the message and the
// screen would disagree and neither would be trusted.
//
// ONE MESSAGE PER PERSON PER DAY. A store with forty low items must not send
// forty messages. The same lesson as the six o'clock surgical digest: a sender
// that floods gets muted, and a muted sender does not deliver the message that
// mattered either.
//
// AND IT SAYS NOTHING WHEN THERE IS NOTHING TO SAY. No daily "all stock is
// fine" message. A reminder that arrives every day whatever the state is one
// nobody reads by the end of the month.
// ============================================================

import prisma from '@/lib/prisma';
import { summariseAvailability } from '@/lib/stock/allocate';
import { queueMessage } from '@/lib/comms/send';

/**
 * How far above the reorder level still counts as worth warning about.
 *
 * At exactly the reorder level it is already too late to be comfortable — a
 * reorder takes days and theatre keeps consuming. Half as much again gives
 * enough warning to raise an order without the list being at risk, and is
 * close enough that the warning still means something.
 */
export const APPROACHING_MULTIPLIER = 1.5;

/** Usable stock expiring within this many days is worth naming separately. */
export const EXPIRING_WITHIN_DAYS = 30;

export type StockLevel = 'OUT' | 'CRITICAL' | 'APPROACHING' | 'OK';

/**
 * Where one item stands against its reorder level.
 *
 * An item with no reorder level returns OK rather than a guess. Inventing a
 * threshold for it would produce alerts nobody configured and cannot act on,
 * and the first response to an alert you did not ask for is to ignore the
 * next one.
 */
export function classify(available: number, reorderLevel: number | null | undefined): StockLevel {
  if (reorderLevel == null || reorderLevel <= 0) return 'OK';
  if (available <= 0) return 'OUT';
  if (available <= reorderLevel) return 'CRITICAL';
  if (available <= Math.ceil(reorderLevel * APPROACHING_MULTIPLIER)) return 'APPROACHING';
  return 'OK';
}

export interface ItemPosition {
  itemId: string;
  name: string;
  category: string;
  available: number;
  reorderLevel: number | null;
  level: StockLevel;
  expiringSoon: number;
}

/** Only the levels worth sending a message about. */
export const ALERTING_LEVELS: StockLevel[] = ['OUT', 'CRITICAL', 'APPROACHING'];

export const needsAttention = (p: ItemPosition): boolean =>
  ALERTING_LEVELS.indexOf(p.level) !== -1 || p.expiringSoon > 0;

/**
 * The sentence that goes in the message.
 *
 * Built here rather than in the template because Meta approves a fixed body
 * with positional variables, so the whole variable part has to arrive as one
 * finished phrase. Reads as English at every combination, which matters: a
 * message saying "0 items are out of stock" is one nobody reads twice.
 */
export function summarise(positions: ItemPosition[]): string {
  const n = (lvl: StockLevel) => positions.filter((p) => p.level === lvl).length;
  const out = n('OUT');
  const critical = n('CRITICAL');
  const approaching = n('APPROACHING');
  const expiring = positions.filter((p) => p.expiringSoon > 0).length;

  const parts: string[] = [];
  if (out) parts.push(`${out} item${out > 1 ? 's are' : ' is'} out of stock`);
  if (critical) parts.push(`${critical} at or below the reorder level`);
  if (approaching) parts.push(`${approaching} approaching it`);
  if (expiring) parts.push(`${expiring} with stock expiring within ${EXPIRING_WITHIN_DAYS} days`);

  if (!parts.length) return 'nothing needs attention';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Who hears about stock.
 *
 * Everyone here can actually do something about a low item: order it, pack it,
 * or authorise it. Deliberately NOT the whole theatre — a surgeon cannot raise
 * a purchase order, and telling them weekly teaches them that ORM messages are
 * not for them.
 *
 * No category routing, and that is a decision rather than an omission:
 * ItemCategory is CONSUMABLE, MACHINE, DEVICE and OTHER, with no drug
 * category, so a pharmacy-versus-stores split would be invented rather than
 * derived. Everyone gets the same figure and the list behind the link is
 * filterable.
 */
export const STOCK_ALERT_ROLES = [
  'THEATRE_STORE_KEEPER',
  'PROCUREMENT_OFFICER',
  'PHARMACIST',
  'HEAD_OF_PHARMACY',
  'CONSUMABLE_PACK_PROVIDER',
  'THEATRE_MANAGER',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
];

/**
 * Work out where every stocked item stands.
 *
 * Exported separately from the sending so a screen can show exactly what the
 * next message would say, which is the only way somebody can sensibly decide
 * whether to switch the alerts on.
 */
export async function stockPositions(asOf: Date = new Date()): Promise<ItemPosition[]> {
  const items = await prisma.inventoryItem.findMany({
    select: {
      id: true, name: true, category: true, reorderLevel: true,
      stockBatches: {
        where: { deletedAt: null },
        select: {
          id: true, expiryDate: true, status: true,
          quantityReceived: true, quantityReserved: true, quantityIssued: true,
          quantityReturned: true, quantityExpired: true, quantityDisposed: true,
        },
      },
    },
  });

  const out: ItemPosition[] = [];
  for (const item of items) {
    // The shared calculation. Not reimplemented here, deliberately.
    const s = summariseAvailability(item.stockBatches as never, {
      reorderLevel: item.reorderLevel,
      asOf,
      expiringWithinDays: EXPIRING_WITHIN_DAYS,
    });
    out.push({
      itemId: item.id,
      name: item.name,
      category: String(item.category),
      available: s.available,
      reorderLevel: item.reorderLevel ?? null,
      level: classify(s.available, item.reorderLevel),
      expiringSoon: s.expiringSoon,
    });
  }

  // Worst first, so a truncated list still shows what matters.
  const rank: Record<StockLevel, number> = { OUT: 0, CRITICAL: 1, APPROACHING: 2, OK: 3 };
  out.sort((a, b) => rank[a.level] - rank[b.level] || a.name.localeCompare(b.name));
  return out;
}

/** A courteous short form: "Mr Eze" from "Mr Chidi Eze". */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full.trim();
  const title = /^(dr|prof|mr|mrs|ms|miss|pharm)\.?$/i.test(parts[0]) ? parts[0] : null;
  return title ? `${title} ${parts[parts.length - 1]}` : full.trim();
}

export interface StockAlertSummary {
  itemsChecked: number;
  needingAttention: number;
  out: number;
  critical: number;
  approaching: number;
  expiringSoon: number;
  /** The exact sentence each recipient was sent. */
  message: string | null;
  recipients: number;
  queued: number;
  skipped: Array<{ name: string; reason: string }>;
}

/**
 * Send today's stock position to the people who can act on it.
 *
 * @param now injected so the job can be exercised at a chosen time.
 */
export async function sendStockAlerts(now: Date = new Date()): Promise<StockAlertSummary> {
  const positions = await stockPositions(now);
  const flagged = positions.filter(needsAttention);

  const summary: StockAlertSummary = {
    itemsChecked: positions.length,
    needingAttention: flagged.length,
    out: flagged.filter((p) => p.level === 'OUT').length,
    critical: flagged.filter((p) => p.level === 'CRITICAL').length,
    approaching: flagged.filter((p) => p.level === 'APPROACHING').length,
    expiringSoon: flagged.filter((p) => p.expiringSoon > 0).length,
    message: null,
    recipients: 0,
    queued: 0,
    skipped: [],
  };

  // Nothing wrong is not news. Saying so daily is how the next real one gets
  // ignored.
  if (!flagged.length) return summary;

  const sentence = summarise(flagged);
  summary.message = sentence;

  const dateLabel = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos',
  });

  const people = await prisma.user.findMany({
    where: { status: 'APPROVED', role: { in: STOCK_ALERT_ROLES as never } },
    select: { id: true, fullName: true, phoneNumber: true },
  });
  summary.recipients = people.length;

  for (const p of people) {
    if (!p.phoneNumber) {
      summary.skipped.push({ name: p.fullName ?? p.id, reason: 'No phone number on their ORM account.' });
      continue;
    }

    const res = await queueMessage({
      channel: 'WHATSAPP',
      // Ahead of an ordinary reminder, behind an emergency that has not started.
      priority: flagged.some((f) => f.level === 'OUT') ? 'HIGH' : 'NORMAL',
      recipientUserId: p.id,
      recipientName: p.fullName ?? 'Colleague',
      recipientAddress: p.phoneNumber,
      recipientIsStaff: true,
      templateCode: 'STOCK_REORDER',
      variables: {
        name: shortName(p.fullName ?? 'Colleague'),
        date: dateLabel,
        summary: sentence,
      },
      relatedType: 'stock',
      relatedId: 'reorder',
      trigger: 'STOCK_REORDER',
      // One per person per day. A cron that runs twice cannot double-message,
      // and tomorrow's figure is a different message.
      scope: `${p.id}:${dateLabel}`,
      // Superseded by tomorrow's. A stock figure two days old is misleading
      // rather than merely late.
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });

    if (res.queued) summary.queued += 1;
    else if (!res.duplicate) {
      summary.skipped.push({
        name: p.fullName ?? p.id,
        reason: res.reason ?? 'Refused by the send policy.',
      });
    }
  }

  return summary;
}
