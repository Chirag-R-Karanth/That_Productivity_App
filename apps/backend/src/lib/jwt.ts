import { SignJWT, jwtVerify } from "jose";
import type { User } from "@prodapp/shared-types";
import { env } from "./env.js";

const secret = new TextEncoder().encode(env.jwtSecret);

export interface JwtPayload {
  sub: string;
  email: string;
}

export async function signToken(user: Pick<User, "id" | "email">): Promise<string> {
  const secretKey = new TextEncoder().encode(env.jwtSecret);
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(env.jwtExpiresIn)
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret);
  if (!payload.sub) throw new Error("Token missing subject");
  return { sub: payload.sub, email: String(payload.email ?? "") };
}