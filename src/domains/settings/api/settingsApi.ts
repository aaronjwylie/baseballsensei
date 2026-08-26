/**
 * Reading and writing the one settings row.
 *
 * The only place the app touches the `settings` table. `SETTINGS_ID` is fixed,
 * so "the settings" is always one row and the table cannot grow a second.
 */
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { settingTable, type SettingRow } from "../model/settingTable";
import {
  DEFAULT_SETTINGS,
  type PlatformSettings,
} from "../model/settings";

const SETTINGS_ID = "default";

function fromRow(row: SettingRow): PlatformSettings {
  return {
    priceCents: row.priceCents,
    maxFileSizeMb: row.maxFileSizeMb,
    maxFilesPerSubmission: row.maxFilesPerSubmission,
    retainCollectedDays: row.retainCollectedDays,
    retainDeliveredDays: row.retainDeliveredDays,
    warnBeforeDeletionDays: row.warnBeforeDeletionDays,
    retainUnpaidHours: row.retainUnpaidHours,
  };
}

/**
 * The current settings, creating the row on first read.
 *
 * Wrapped in React's `cache` so the several places that need a limit during one
 * request — the upload route validating a file, the flow rendering its hint
 * text — share a single query rather than each making their own.
 */
export const getSettings = cache(async function getSettings(): Promise<PlatformSettings> {
  const [row] = await db
    .select()
    .from(settingTable)
    .where(eq(settingTable.id, SETTINGS_ID))
    .limit(1);

  if (row) return fromRow(row);

  /*
    First read on a fresh database. Insert the defaults rather than returning
    them, so the admin form has something to edit. `onConflictDoNothing` covers
    two requests racing to be first.

    Loud about it, because this branch silently reprices the product. Reaching
    here means no settings row existed, so the charge, the landing card and the
    terms page all fall back to DEFAULT_SETTINGS together — they agree with each
    other and disagree with the operator, which is the one failure that looks
    like nothing is wrong. Expected on a fresh install and on every local test
    run; on production it means the row was lost and the price needs re-setting.
  */
  console.warn(
    `[settings] no settings row — seeding defaults, price falls back to ` +
      `$${(DEFAULT_SETTINGS.priceCents / 100).toFixed(2)}. ` +
      `If this is production, re-set the price at /admin/settings.`,
  );

  const [created] = await db
    .insert(settingTable)
    .values({ id: SETTINGS_ID, ...DEFAULT_SETTINGS })
    .onConflictDoNothing()
    .returning();

  return created ? fromRow(created) : DEFAULT_SETTINGS;
});

export async function updateSettings(
  next: PlatformSettings,
): Promise<PlatformSettings> {
  const [row] = await db
    .insert(settingTable)
    .values({ id: SETTINGS_ID, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingTable.id,
      set: { ...next, updatedAt: new Date() },
    })
    .returning();

  return fromRow(row);
}
