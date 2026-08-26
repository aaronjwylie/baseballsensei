import "server-only";
import { cookies } from "next/headers";
import { env } from "@/shared/config/env";
import { QA_AUTH_COOKIE } from "../model/qaEvent";

/**
 * May this request read and write the shared QA record?
 *
 * **The gate matches whatever protection actually exists**, rather than adding
 * one unconditionally.
 *
 * While the site is behind HTTP Basic Auth, everyone who can reach this page
 * already proved who they are at the front door, and a second key is pure
 * friction — it cost the first person who tried to open the record an
 * afternoon. So Basic Auth is accepted as sufficient.
 *
 * When that gate comes off before launch, `/qa` would otherwise be a public
 * page listing every check in the product, so the record falls back to needing
 * `QA_TOKEN` — the same key the probe's ingest uses, which needs its own
 * because `/api` is excluded from the Basic Auth matcher.
 *
 * **With neither, there is no protection at all** and the record must not
 * exist. That is the one case that stays a 404.
 */
export type QaAccess = "granted" | "needs-token" | "absent";

export async function qaAccess(): Promise<QaAccess> {
  const siteIsGated = Boolean(env.basicAuthUser && env.basicAuthPassword);
  if (siteIsGated) return "granted";

  if (!env.qaToken) return "absent";
  const jar = await cookies();
  return jar.get(QA_AUTH_COOKIE)?.value === env.qaToken ? "granted" : "needs-token";
}
