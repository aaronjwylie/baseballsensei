/**
 * Centralized, lazy access to **server-only** environment variables.
 *
 * Browser-visible config lives in `publicEnv.ts`. Never import this file from a
 * client component — it exists to hold secrets, and that split is the boundary.
 *
 * Server-only values throw if read at runtime while missing, so a
 * misconfiguration fails loudly at the point of use rather than silently.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  // Public base URL for absolute links in emails and Stripe return URLs, e.g.
  // https://baseball-sensei.com. `NEXT_PUBLIC_SITE_URL` is the source of truth
  // (set it to the live domain, Production env). It's inlined at build time,
  // so if a build lacks it we fall back to Vercel's own runtime host rather
  // than shipping `localhost` links to real customers and coaches.
  get siteUrl(): string {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL;
    if (explicit) return explicit.replace(/\/$/, "");
    const vercelHost =
      process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    if (vercelHost) return `https://${vercelHost}`;
    return "http://localhost:3000";
  },

  // Postgres — the system of record. Dockerized locally; in prod, Supabase's
  // integration provides POSTGRES_URL (pooled), so accept either name.
  get databaseUrl() {
    return (
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      required("DATABASE_URL")
    );
  },

  // Auth.js session/JWT secret for the operator portal.
  get authSecret() {
    return required("AUTH_SECRET");
  },

  /**
   * Optional QA instrumentation token.
   *
   * **Unset is off, completely.** Every `/api/qa/*` route answers 404 when this
   * is missing, and the probe is never rendered — so the instrumentation does
   * not exist in any deploy that has not deliberately switched it on, and is
   * turned off again by deleting one variable.
   *
   * It gates a production endpoint, so it needs the length of a real secret,
   * not a word.
   */
  get qaToken() {
    return optional("QA_TOKEN");
  },

  // Optional site-wide HTTP Basic Auth — hides the whole site behind a browser
  // username/password prompt while it's being built. Active only when BOTH are
  // set; clear them (and redeploy) to lift the gate.
  get basicAuthUser() {
    return optional("BASIC_AUTH_USER");
  },
  get basicAuthPassword() {
    return optional("BASIC_AUTH_PASSWORD");
  },

  // Object storage. In dev, files live on local disk under this dir; in prod
  // the Blob driver uses BLOB_READ_WRITE_TOKEN instead.
  get storageDir() {
    return process.env.STORAGE_DIR || "./.storage";
  },
  get blobToken() {
    return optional("BLOB_READ_WRITE_TOKEN");
  },

  /**
   * Whether we're running on Vercel's serverless platform.
   *
   * Matters for one thing only: the local-disk storage driver cannot work
   * there. The filesystem is read-only outside `/tmp`, and `/tmp` doesn't
   * survive between invocations — so "fall back to local disk" silently becomes
   * "lose the customer's file". The upload route uses this to refuse loudly
   * instead. Vercel sets `VERCEL=1` on every deployment.
   */
  get isServerless() {
    return process.env.VERCEL === "1";
  },

  /**
   * Whether this process is a Playwright end-to-end run.
   *
   * The **only** thing it changes is that the verification code becomes a fixed
   * constant, so a browser test can type the one input it cannot read from an
   * inbox. Set exclusively by the `e2e.yml` workflow and never in any deployed
   * environment — a unit test asserts it is false by default, so the fixed code
   * can never be reachable in production.
   *
   * **Belt and braces: it is force-off on Vercel.** `E2E_TEST=1` is a GitHub
   * Actions flag; the e2e workflow never runs on Vercel, so `VERCEL=1` and
   * `E2E_TEST=1` never legitimately coexist. Requiring `VERCEL !== "1"` here
   * means that even if someone pastes `E2E_TEST=1` into a Vercel env by mistake,
   * the fixed code and the non-Secure cookie stay off — a single fat-fingered
   * variable can't turn every customer's verification code into `000000`.
   */
  get isE2E() {
    return process.env.E2E_TEST === "1" && process.env.VERCEL !== "1";
  },

  // Stripe
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  // Optional: use a pre-created Stripe Price. If unset, checkout builds
  // inline price_data from the pricing in `site.ts` — one less thing to
  // configure for the validation build.
  get stripePriceId() {
    return optional("STRIPE_PRICE_ID");
  },

  /**
   * Shared secret Vercel Cron presents when invoking the retention sweep.
   *
   * Optional to *read*, but the sweep route refuses to run without it rather
   * than degrading — an unguarded endpoint that deletes customer files is worse
   * than a sweep that never runs.
   */
  get cronSecret() {
    return optional("CRON_SECRET");
  },

  /**
   * How long a password-reset link stays valid, in seconds. Defaults to one
   * hour; overridable **only** so a spent/expired link can be walked through by
   * hand without waiting the hour (QA 4.12) — set it to e.g. `15` in a test env,
   * then remove it. A malformed or non-positive value falls back to the default,
   * so a fat-fingered override can't accidentally make every real operator's
   * link expire in zero seconds.
   */
  get passwordResetTtlS(): number {
    const raw = optional("PASSWORD_RESET_TTL_S");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60 * 60;
  },

  // Email (Resend). Optional — email failures should never break the flow.
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return process.env.EMAIL_FROM || "Baseball Sensei <onboarding@resend.dev>";
  },
  /**
   * Signing secret for Resend's delivery webhooks.
   *
   * Optional: without it the webhook route refuses every delivery rather than
   * trusting an unsigned one. Losing delivery tracking is a degraded trail; an
   * open endpoint that writes to it is a forgeable one.
   */
  get resendWebhookSecret() {
    return optional("RESEND_WEBHOOK_SECRET");
  },
} as const;
