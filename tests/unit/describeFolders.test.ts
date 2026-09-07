import { describe, expect, it } from "vitest";
import { describeFolders } from "@/domains/submission/ui/SubmissionFolders";
import type { FileKind, SubmissionFile } from "@/domains/submission/model/submissionFile";

/**
 * The count line on a finished card in the coach's and translator's portals.
 *
 * It has to survive the retention sweep saying something true. File rows outlive
 * their bytes on purpose, so the portal can still say what was handed over — but
 * a bare "3 files" beside three struck-through names reads as a broken page
 * rather than a deliberate one (Ben, 2026-09-07).
 */
const file = (fileUrl: string | null): SubmissionFile =>
  ({ id: "x", submissionId: "s", filename: "f.mp4", contentType: "video/mp4",
     sizeBytes: 1, kind: "intake", uploadedAt: "", fileUrl }) as unknown as SubmissionFile;

const folders = (counts: Partial<Record<FileKind, (string | null)[]>>) => ({
  intake: (counts.intake ?? []).map(file),
  intake_translation: (counts.intake_translation ?? []).map(file),
  feedback: (counts.feedback ?? []).map(file),
  feedback_translation: (counts.feedback_translation ?? []).map(file),
});

describe("describeFolders", () => {
  it("says nothing is there when nothing is", () => {
    expect(describeFolders(folders({}))).toBe("no files");
  });

  it("counts across every folder, not just one", () => {
    expect(describeFolders(folders({ intake: ["a"], feedback: ["b"] }))).toBe("2 files");
  });

  it("keeps the singular singular", () => {
    expect(describeFolders(folders({ feedback: ["a"] }))).toBe("1 file");
  });

  it("says so when the sweep has taken all of them", () => {
    expect(describeFolders(folders({ intake: [null], feedback: [null] }))).toBe(
      "2 files, deleted after the retention window",
    );
  });

  it("and how many, when it has taken some", () => {
    expect(describeFolders(folders({ intake: ["a", null], feedback: [null] }))).toBe(
      "3 files, 2 deleted after the retention window",
    );
  });
});
