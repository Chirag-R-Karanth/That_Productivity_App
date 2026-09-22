import { prisma } from "../lib/prisma.js";
import { Prisma, type EventType } from "../generated/prisma/client.js";

/**
 * Appends one immutable event to the analytics log.
 *
 * Contracts:
 *  - Events are append-only: never updated or deleted after insert.
 *  - Best-effort by design: a failure here logs a warning but never breaks the
 *    originating request, so the primary write always succeeds.
 *  - Idempotent replays are de-duplicated by the idempotency middleware before
 *    a route runs, so replaying an intent will not double-log an event.
 */
export async function recordEvent(
  userId: string,
  type: EventType,
  payload: Prisma.InputJsonValue = {},
): Promise<void> {
  try {
    await prisma.event.create({
      data: {
        userId,
        type,
        occurredAt: new Date(),
        payload,
      },
    });
  } catch (err) {
    console.warn(
      `[event] failed to record ${type} for user ${userId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}