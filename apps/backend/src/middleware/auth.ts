import type { Request, Response, NextFunction } from "express";
import type { JwtPayload } from "../lib/jwt.js";
import { verifyToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // `timezone` rides along so downstream day arithmetic can resolve the
      // user's day without a second lookup of the user row.
      user: { id: string; email: string; timezone: string | null };
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Missing bearer token");
    }

    const payload: JwtPayload = await verifyToken(header.slice("Bearer ".length));

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw ApiError.unauthorized("User no longer exists");

    req.user = { id: user.id, email: user.email, timezone: user.timezone };
    next();
  } catch (err) {
    if (err instanceof ApiError) {
      next(err);
      return;
    }
    // Token expired / malformed → jose throws its own errors.
    next(ApiError.unauthorized("Invalid or expired token"));
  }
}