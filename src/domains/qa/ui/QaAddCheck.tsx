"use client";

import { useState } from "react";
import { isCheckId } from "../model/qaMark";

/**
 * Add a check, anywhere.
 *
 * **The id is the placement**, which is why it is typed rather than issued.
 * The first version put a "+" on every row and inserted beneath it, and that
 * quietly restricted what could be written down to things adjacent to a check
 * that already existed — no use for the finding that belongs in a phase you
 * have not reached, or in a group nobody thought of.
 *
 * Typing the id hands back the collision a server-issued number prevented, so
 * the guarantee moved rather than vanishing: the server refuses an id that is
 * already spent, withdrawn ones included, and says so here.
 */
export function QaAddCheck({
  onAdd,
}: {
  onAdd: (
    id: string,
    what: string,
    expect: string,
  ) => Promise<{ ok: boolean; id?: string; error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [what, setWhat] = useState("");
  const [expect, setExpect] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const malformed = id.trim() !== "" && !isCheckId(id.trim());

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await onAdd(id.trim(), what, expect);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Could not add it.");
      return;
    }
    setAdded(res.id ?? id.trim());
    setId("");
    setWhat("");
    setExpect("");
  }

  return (
    <div className="border-2 border-dashed border-line">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setAdded(null);
          setError(null);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted hover:text-accent"
      >
        <span className="grid h-5 w-5 place-items-center border-2 border-current text-[13px] leading-none">
          +
        </span>
        Add a check
        {added && (
          <span className="ml-auto normal-case tracking-normal text-success">
            Added {added} — it is in position now
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t-2 border-dashed border-line p-3">
          <div className="flex flex-wrap items-start gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-display text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                Id
              </span>
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="1.1.15"
                aria-label="Id for the new check"
                aria-invalid={malformed}
                className={`w-28 border-2 bg-paper px-2 py-1 text-[13px] tabular-nums text-ink outline-none ${
                  malformed ? "border-rose-700" : "border-line focus:border-accent"
                }`}
              />
            </label>
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
              <span className="font-display text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                What to do
              </span>
              <input
                value={what}
                onChange={(e) => setWhat(e.target.value)}
                placeholder="Resize to 320px and open the menu"
                aria-label="What the new check tests"
                className="border-2 border-line bg-paper px-2 py-1 text-[13px] text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
              <span className="font-display text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                What should happen
              </span>
              <input
                value={expect}
                onChange={(e) => setExpect(e.target.value)}
                placeholder="The button stays fully on screen"
                aria-label="What the new check expects"
                className="border-2 border-line bg-paper px-2 py-1 text-[13px] text-ink outline-none focus:border-accent"
              />
            </label>
            <button
              type="button"
              disabled={!what.trim() || !isCheckId(id.trim()) || saving}
              onClick={() => void submit()}
              className="mt-[18px] border-2 border-accent bg-accent px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-paper disabled:opacity-40"
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </div>

          {error && <p className="text-[12px] text-rose-700">{error}</p>}

          <p className="text-[11px] text-ink-muted">
            The id decides where it lands — <span className="tabular-nums">1.1.15</span>{" "}
            goes at the end of 1.1, <span className="tabular-nums">1.1.3.1</span> between
            1.1.3 and 1.1.4. An id in a group that does not exist yet collects at the
            end of the board rather than being refused. Ids are never reused.
          </p>
        </div>
      )}
    </div>
  );
}
