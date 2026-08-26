/**
 * Seed the two operators the Playwright golden path signs in as: a known admin
 * and a known English-reading coach.
 *
 * A tsx script rather than a Playwright global-setup because it reaches the app's
 * `@/` imports (Playwright's transpiler doesn't). Idempotent — clears any prior
 * E2E operators first, so a re-run against a shared dev DB starts clean.
 *
 *     npm run seed:e2e          # DATABASE_URL from .env.local, or the CI env
 */
import "./loadEnv";
import { eq, or } from "drizzle-orm";
import { db } from "@/shared/db";
import { operatorTable } from "@/domains/operator/model/operatorTable";
import { createOperator } from "@/domains/account/api/loginApi";
import { grantRole } from "@/domains/operator/api/operatorRoleApi";
import { createProfiledOperator } from "@/domains/operator/api/operatorProfileApi";
import { ADMIN, COACH } from "../e2e/actors";

async function main() {
  await db
    .delete(operatorTable)
    .where(
      or(eq(operatorTable.email, ADMIN.email), eq(operatorTable.email, COACH.email)),
    );

  const admin = await createOperator(ADMIN.email, ADMIN.password, ADMIN.name);
  await grantRole(admin.id, "admin", null);

  await createProfiledOperator("coach", {
    name: COACH.name,
    email: COACH.email,
    password: COACH.password,
    specialties: ["Hitting"],
    languages: ["English"],
  });

  console.log(
    `[seed:e2e] ${ADMIN.email} (admin) + ${COACH.email} (coach) ready`,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
