/**
 * GET /api/version — which release this instance is (_ReleaseLaw P13).
 *
 * The same two facts the footer shows, as JSON for a script: the version from
 * package.json and the commit the bundle was built from. Public on purpose —
 * a version is not a secret, and "is this the fix or the one before?" should
 * be answerable by anyone looking, on every rung.
 */
import { appVersion, buildSha } from "@/shared/config/publicEnv";

export function GET() {
  return Response.json({ version: appVersion, commit: buildSha });
}
