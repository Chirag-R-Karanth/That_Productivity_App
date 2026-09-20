import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiError } from "../lib/errors.js";

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound("Route not found"));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // Express identifies error middleware by the 4-arg signature.
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    const details: Record<string, string> = {};
    for (const issue of err.issues) {
      details[issue.path.join(".")] = issue.message;
    }
    res.status(400).json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid request body", details },
    });
    return;
  }

  console.error("[error]", err);
  res.status(500).json({
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}