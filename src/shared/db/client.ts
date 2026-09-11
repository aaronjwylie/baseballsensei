/**
 * The one database connection.
 *
 * A single postgres.js pool, wrapped by Drizzle. Cached on `globalThis` in dev
 * so Next's hot reload doesn't open a new pool on every edit. `casing:
 * "snake_case"` matches the mapping declared in `drizzle.config.ts`.
 *
 * Server-only. Nothing in `app/` or a client component imports this directly —
 * the domains do (see structure.md §3b).
 *
 * **No `schema` argument, deliberately.** Drizzle only wants one to power the
 * relational query API (`db.query.x.findMany`), which this codebase has never
 * used — every read is an explicit `select`. Passing it would drag every domain
 * into `shared/`, which is the one thing this floor may not know about.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/shared/config/env";

const globalForDb = globalThis as unknown as {
  _pgClient?: ReturnType<typeof postgres>;
};

/**
 * Built on first use, not at import.
 *
 * `env.databaseUrl` throws when unset — deliberately, so a misconfiguration
 * fails loudly at the point of use. The point of use for a database is the
 * first *query*, not the first *import*: a unit test that renders a server
 * component pulls this module in through a domain barrel and never queries,
 * and until 2026-09-10 that made CI's unit job — which has no database by
 * design — fail on a test that touched no data. The seam failed for rendering
 * what it should only fail for asking.
 *
 * `prepare: false` is required for a transaction-mode pooler (Supabase's pooled
 * URL, port 6543) and harmless against the local/direct connection.
 */
function createDb() {
  const client =
    globalForDb._pgClient ?? postgres(env.databaseUrl, { max: 10, prepare: false });
  if (process.env.NODE_ENV !== "production") {
    globalForDb._pgClient = client;
  }
  return drizzle(client, { casing: "snake_case" });
}

type RealDb = ReturnType<typeof createDb>;
let real: RealDb | undefined;

export const db: RealDb = new Proxy({} as RealDb, {
  get(_target, prop) {
    real ??= createDb();
    const value = Reflect.get(real, prop);
    // Prototype methods (`select`, `transaction`, …) need `this` to be the real
    // instance, so they are bound. Own properties are returned as they are —
    // `$client` is a callable postgres.js object carrying `.end()`, and
    // binding it would strip that.
    const own = Object.prototype.hasOwnProperty.call(real, prop);
    return typeof value === "function" && !own ? value.bind(real) : value;
  },
});

/**
 * The connection, or a transaction handle on it.
 *
 * Any function that may be called both standalone and inside a
 * `db.transaction(...)` takes one of these. It lived privately in
 * `submissionEventApi` until a second file needed it — a type describing the
 * database belongs with the database, not with the first domain to want it.
 */
export type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
