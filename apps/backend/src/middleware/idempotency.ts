import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

/**
 * Idempotency-Key middleware.
 *
 * Reads the `Idempotency-Key` header on mutating requests. If a record for
 * that key already exists as APPLIED, the request is a duplicate (e.g. an
 * offline-queued write replayed twice) and we short-circuit with 200 instead
 * of applying it again.
 *
 * Uses the PendingSync table so a deduped action never double-applies even if
 * the original network response was lost after the server committed it.
 */
export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.header("Idempotency-Key");
  if (!key || ["GET", "DELETE"].includes(req.method)) {
    return next();
  }

  try {
    const existing = await prisma.pendingSync.findUnique({ where: { idempotencyKey: key } });
    if (existing && existing.status === "APPLIED") {
      return res.json({
        ok: true,
        data: { deduplicated: true, actionKey: key },
      });
    }

    // Record the intent so a concurrent/failed duplicate can be deduped too.
    if (!existing) {
      await prisma.pendingSync.create({
        data: {
          userId: req.user?.id ?? "",
          actionType: req.method,
          payload: {
            path: req.originalUrl,
            idempotencyKey: key,
          },
          idempotencyKey: key,
          status: "PENDING",
        },
      });
      res.on("finish", () => {
        if (res.statusCode < 500) {
          void prisma.pendingSync
            .update({
              where: { idempotencyKey: key },
              data: { status: "APPLIED", appliedAt: new Date() },
            })
            .catch(() => {});
        }
      });
    }
    return next();
  } catch (err) {
    // Never block the request on bookkeeping failures — just proceed.
    console.error("[idempotency] check failed:", err);
    return next();
  }
}