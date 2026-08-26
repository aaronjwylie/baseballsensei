/**
 * The schema manifest — **a barrel. It declares nothing.**
 *
 * Every table and enum lives in the folder of the domain that owns it. This file
 * exists so `drizzle-kit` has one entry point to read, and for no other reason.
 * Don't read it for documentation — the docblocks sit with their declarations.
 * Don't add a declaration to it.
 *
 * **It sits outside the layer cake, at `src/db/`, rather than in `shared/`.**
 * A file that imports every domain cannot be domain-less, and `shared/` never
 * imports a domain (PRINCIPLES §4). This isn't a layer at all — it's an adapter
 * for a build tool that wants one file, and it's the only thing in `src/` that
 * knows the whole map. Nothing in `src/` imports it; only `drizzle.config.ts`
 * and `scripts/` do.
 *
 * **No declaration file may import from here.** A `*Table.ts` or `*Enum.ts`
 * imports other declaration files directly, never a barrel — not this one, not
 * `@/shared/db`, not a slice's `index.ts`. Reaching for a barrel from inside a
 * declaration closes a loop and hands one of the two files a half-initialised
 * module, so a table arrives `undefined` with a stack trace naming neither
 * culprit. The arrows point one way: declarations → this file → drizzle-kit.
 *
 * TypeScript keys are camelCase; `casing: "snake_case"` on both the client and
 * drizzle-kit maps them to snake_case columns, so the app reads camelCase and
 * the database stays idiomatic SQL.
 *
 * Nine tables: `operator` (who exists), `operator_credential` (their
 * ability to sign in), `operator_profile` (what they cover),
 * `submissionTable` (the spine — one row per request), `submissionFileTable` (the files,
 * both directions, discriminated by `kind`), `submissionEventTable` (one row per
 * status transition — the trail), and `settings` (the operator's knobs).
 *
 * Grouped enums-then-tables for reading only. Initialisation order comes from
 * the import graph — each table file imports its own enums — not from the order
 * of these lines.
 */

// Enums.
export * from "@/domains/operator/model/operatorRoleEnum";
export * from "@/domains/submission/model/focusEnum";
export * from "@/domains/submission/model/submissionStatusEnum";
export * from "@/domains/submission/model/fileKindEnum";
export * from "@/domains/submission/model/fileSetEnum";
export * from "@/domains/submission/model/submissionEventKindEnum";
export * from "@/domains/submission/model/emailOutcomeEnum";

// Tables, each with its inferred row types.
export * from "@/domains/operator/model/operatorTable";
export * from "@/domains/operator/model/operatorProfileTable";
export * from "@/domains/operator/model/operatorRoleGrantTable";
export * from "@/domains/account/model/credentialTable";
export * from "@/domains/submission/model/submissionTable";
export * from "@/domains/submission/model/submissionFileTable";
export * from "@/domains/submission/model/submissionEventTable";
export * from "@/domains/submission/model/submissionAssignmentTable";
export * from "@/domains/settings/model/settingTable";
export * from "@/domains/qa/model/qaEventTable";
