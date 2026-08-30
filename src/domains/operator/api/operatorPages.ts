import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Invalidate the operator pages after a write.
 *
 * **The route patterns, not concrete URLs** — and that distinction is the whole
 * reason this file exists.
 *
 * `/admin/operators/[kind]` and `/admin/operators/[kind]/[id]` are dynamic
 * routes. `revalidatePath` matches a *route*, so handing it a filled-in path
 * like `/admin/operators/coaches/abc-123` matches nothing and silently
 * invalidates nothing — no error, no warning, just a cache that never clears.
 * Two callers did exactly that, and every read-after-write on those pages had
 * been stale since they were written (QA 4.7).
 *
 * The visible symptom was checkboxes: a correct save, then the boxes re-ticking
 * roles the database no longer held, because the component re-seeded from a
 * payload the cache had never let go of. The damage arrived on the next save,
 * since `setGrants` deletes any role absent from what is submitted.
 *
 * Both patterns are invalidated together on every operator write. That is
 * broader than strictly needed — it drops the cached list as well as the one
 * person — but the alternative is per-instance invalidation on a route where
 * getting it subtly wrong is invisible, which is what happened here.
 */
export function revalidateOperatorPages(): void {
  revalidatePath("/admin/operators", "page");
  revalidatePath("/admin/operators/[kind]", "page");
  revalidatePath("/admin/operators/[kind]/[id]", "page");
}
