/**
 * The signed-cookie store — set, read, clear.
 *
 * Uses Next's async `cookies()` (Next 16), so this is server-only: importable
 * from Server Components, Server Actions, and Route Handlers, but not from
 * `proxy.ts` (use `token.ts` + `req.cookies` there).
 *
 * The generic trio takes a cookie name so more than one session can coexist —
 * an operator can be signed in while also walking the customer flow, and the
 * two must not overwrite each other. The `…SessionCookie` wrappers below are
 * the operator's, kept so callers don't repeat its name and lifetime.
 */
import { cookies } from "next/headers";
import type { JWTPayload } from "jose";
import { env } from "@/shared/config/env";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  signSession,
  verifySessionToken,
} from "./token";

export async function setSignedCookie(
  name: string,
  payload: JWTPayload,
  maxAgeSeconds: number,
): Promise<void> {
  const token = await signSession(payload, maxAgeSeconds);
  const store = await cookies();
  store.set(name, token, {
    httpOnly: true,
    // Secure in production — except a Playwright run, which is a production
    // build served over http://localhost, where a Secure cookie would never be
    // sent back and the flow/session would silently break. `env.isE2E` is the
    // one guard for that seam, and it is force-off on Vercel — so a deployed
    // build always sets Secure, even if `E2E_TEST` leaked into its env.
    secure: process.env.NODE_ENV === "production" && !env.isE2E,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function readSignedCookie<T>(name: string): Promise<T | null> {
  const store = await cookies();
  return verifySessionToken<T>(store.get(name)?.value);
}

export async function clearSignedCookie(name: string): Promise<void> {
  const store = await cookies();
  store.delete(name);
}

/* ---- The operator session ------------------------------------------------ */

export async function setSessionCookie(payload: JWTPayload): Promise<void> {
  return setSignedCookie(SESSION_COOKIE, payload, SESSION_MAX_AGE_S);
}

export async function readSession<T>(): Promise<T | null> {
  return readSignedCookie<T>(SESSION_COOKIE);
}

export async function clearSessionCookie(): Promise<void> {
  return clearSignedCookie(SESSION_COOKIE);
}
