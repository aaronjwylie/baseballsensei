/**
 * Proxy (Next 16's renamed Middleware) — two jobs:
 *
 * 1. **Site gate** (optional): site-wide HTTP Basic Auth to hide the whole thing
 *    while it's being built. Active only when BASIC_AUTH_USER + BASIC_AUTH_PASSWORD
 *    are set; clear them (and redeploy) to lift it. It runs on every page but
 *    NOT on `/api` (the matcher excludes it), so webhooks and uploads still work.
 *
 * 2. **Operator auth gate** (optimistic): bounce anonymous operators off the portal,
 *    bounce signed-in operators off /login, keep each role in its own portal. The
 *    real, secure checks live in the operator DAL, run per page.
 *
 * Imports `shared/auth/token` directly (not the barrel) to avoid pulling
 * `next/headers` into the proxy bundle.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/shared/auth/token";
import { env } from "@/shared/config/env";
import { QA_AUTH_COOKIE, QA_FLAG_COOKIE } from "@/domains/qa/model/qaEvent";
import { HOME_FOR_ROLE, portalsFor, isOperatorSession } from "@/domains/account/model/session";
import type { Role } from "@/domains/operator/model/operatorRoleEnum";

/** HTTP Basic Auth over the whole site. Returns a 401 challenge, or null to pass. */
/**
 * Arm the QA probe for a browser that just proved itself at the front door.
 *
 * The probe posts to `/api/qa/events`, which sits OUTSIDE this gate — `/api`
 * is excluded by the matcher — so the ingest genuinely needs its own key and
 * keeps it. But a person who has already given the site's Basic Auth
 * credentials is on the team by definition, and asking them for a second
 * secret before their clicks are visible produced exactly one outcome: one
 * tester watched and the other invisible, writing to the same record.
 *
 * So the cookie is set for them. It is the same value `/api/qa/session` sets,
 * and everything downstream still validates it — this only removes a step that
 * was asking authenticated people to authenticate again.
 *
 * Does nothing when `QA_TOKEN` is unset: no token, no instrumentation, nothing
 * to arm.
 */
function armProbe(req: NextRequest, res: NextResponse): NextResponse {
  const token = env.qaToken;
  if (!token) return res;
  if (req.cookies.get(QA_AUTH_COOKIE)?.value === token) return res;

  res.cookies.set(QA_AUTH_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    maxAge: 60 * 60 * 8,
  });
  res.cookies.set(QA_FLAG_COOKIE, "1", {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    maxAge: 60 * 60 * 8,
  });
  return res;
}

function siteGate(req: NextRequest): NextResponse | null {
  const user = env.basicAuthUser;
  const pass = env.basicAuthPassword;
  if (!user || !pass) return null; // gate disabled

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const [u, p] = decodeBasic(header);
    if (u === user && p === pass) return null; // authorized
  }
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Baseball Sensei"' },
  });
}

function decodeBasic(header: string): [string, string] {
  try {
    const decoded = atob(header.slice("Basic ".length));
    const i = decoded.indexOf(":");
    return i < 0 ? [decoded, ""] : [decoded.slice(0, i), decoded.slice(i + 1)];
  } catch {
    return ["", ""];
  }
}

export async function proxy(req: NextRequest) {
  const gate = siteGate(req);
  if (gate) return gate;

  const { pathname } = req.nextUrl;
  // Derived, so a new role's portal is gated the day it exists rather than the
  // day someone remembers to add it here.
  const isPortal = Object.values(HOME_FOR_ROLE).some((portal) => pathname.startsWith(portal));

  // Public pages have nothing more to check once the site gate has passed.
  if (!isPortal && pathname !== "/login") return armProbe(req, NextResponse.next());

  const verified = await verifySessionToken<unknown>(
    req.cookies.get(SESSION_COOKIE)?.value,
  );
  // A validly signed cookie of the *previous* shape is not a session. The proxy
  // checks this too rather than trusting the DAL, because it runs first.
  const session = isOperatorSession(verified) ? verified : null;

  if (isPortal && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (session) {
    /*
      Where to send someone who is in the wrong place: their own portal if they
      hold exactly one, the chooser if several. Never a hardcoded other portal —
      an earlier version bounced a non-admin to /coach and a non-coach to
      /admin, which was fine with two roles and became a redirect loop with
      three.
    */
    const mine = portalsFor(session.roles);
    const home = mine.length === 1 ? HOME_FOR_ROLE[mine[0]] : "/portal";

    if (pathname === "/login") {
      return NextResponse.redirect(new URL(home, req.nextUrl));
    }
    /*
      A portal admits anyone **holding** its kind. Holding a second kind is
      never a reason to be turned away from the first.
    */
    for (const [role, portal] of Object.entries(HOME_FOR_ROLE) as [Role, string][]) {
      if (pathname.startsWith(portal) && !session.roles.includes(role)) {
        return NextResponse.redirect(new URL(home, req.nextUrl));
      }
    }
  }

  return armProbe(req, NextResponse.next());
}

export const config = {
  // Run on every page, but not on API routes or static assets — so the site
  // gate never blocks webhooks/uploads or breaks asset loading.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
