import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { SubmissionFolders } from "@/domains/submission/ui/SubmissionFolders";
import { FeedbackFiles } from "@/domains/feedback/ui/FeedbackFiles";
import type { FileKind, SubmissionFile } from "@/domains/submission/model/submissionFile";

/**
 * What these lists actually render — the half of a UI check a query cannot
 * answer.
 *
 * Every component here is a plain synchronous function returning JSX, so it can
 * be rendered to markup and read. That is deliberately not a claim about how the
 * page *looks*: spacing, wrapping and hover states still need eyes on a browser.
 * It settles the questions that are about **content and order** — which is what
 * QA 8.9.25–28, 6.15.1 and 7.13 are actually asking (Ben, 2026-09-08).
 */
const file = (over: Partial<SubmissionFile>): SubmissionFile =>
  ({
    id: Math.random().toString(36).slice(2),
    submissionId: "s",
    filename: "f.mp4",
    contentType: "video/mp4",
    sizeBytes: 2048,
    kind: "feedback",
    uploadedAt: "2026-01-01T00:00:00.000Z",
    fileUrl: "store/f.mp4",
    ...over,
  }) as SubmissionFile;

const render = (el: unknown) => renderToStaticMarkup(el as ReactElement);

const folders = (
  over: Partial<Record<FileKind, SubmissionFile[]>>,
): Record<FileKind, SubmissionFile[]> => ({
  intake: [],
  intake_translation: [],
  feedback: [],
  feedback_translation: [],
  ...over,
});

describe("6.15.1 / 7.13 — a list whose bytes the sweep has taken", () => {
  it("still names every file, struck through and marked deleted", () => {
    const html = render(
      SubmissionFolders({
        folders: folders({
          intake: [file({ filename: "clip.mp4", fileUrl: undefined })],
          feedback: [file({ filename: "review.mp4", fileUrl: undefined })],
        }),
      }),
    );
    // The names survive — a shorter list would read as data loss.
    expect(html).toContain("clip.mp4");
    expect(html).toContain("review.mp4");
    expect(html).toContain("line-through");
    expect(html).toContain("deleted");
    // And nothing offers a download that would 410.
    expect(html).not.toContain("/api/files/");
  });

  it("links a file that still has its bytes", () => {
    const html = render(
      SubmissionFolders({ folders: folders({ feedback: [file({ id: "abc" })] }) }),
    );
    expect(html).toContain("/api/files/abc");
    expect(html).not.toContain("line-through");
  });

  /* An empty folder earns no heading — four headings, three saying nothing, is
     noise on a card meant to be glanced at. */
  it("heads only the folders that have something in them", () => {
    const html = render(
      SubmissionFolders({ folders: folders({ feedback: [file({})] }) }),
    );
    expect(html).toContain("Coach");
    expect(html).not.toContain("Client (translated)");
  });
});

describe("8.9.25–28 — the customer's download card", () => {
  const group = (files: SubmissionFile[]) =>
    files as unknown as Parameters<typeof FeedbackFiles>[0]["files"];

  it("8.9.25 heads each group when both folders were released", () => {
    const html = render(
      FeedbackFiles({ files: group([
          file({ kind: "feedback", filename: "coach.mp4" }),
          file({ kind: "feedback_translation", filename: "translated.mp4" }),
        ]),
      }),
    );
    expect(html).toContain("From your coach");
    expect(html).toContain("Translated for you");
  });

  it("8.9.26 stays flat when there is only one folder", () => {
    const html = render(
      FeedbackFiles({ files: group([file({ kind: "feedback", filename: "only.mp4" })]) }),
    );
    expect(html).toContain("only.mp4");
    expect(html).not.toContain("From your coach");
    expect(html).not.toContain("Translated for you");
  });

  /*
    8.9.27 — ordered by folder, not by upload time. The translation is uploaded
    later in the real flow, so an upload-ordered list would put the coach's own
    work second on their own review.
  */
  it("8.9.27 puts the coach's own file first, whatever the upload order", () => {
    const html = render(
      FeedbackFiles({ files: group([
          file({
            kind: "feedback_translation",
            filename: "translated.mp4",
            uploadedAt: "2026-01-01T00:00:00.000Z",
          }),
          file({
            kind: "feedback",
            filename: "coach.mp4",
            uploadedAt: "2026-06-01T00:00:00.000Z",
          }),
        ]),
      }),
    );
    expect(html.indexOf("coach.mp4")).toBeLessThan(html.indexOf("translated.mp4"));
  });

  /*
    8.9.28 — nothing records what language a file is in, so no label may claim
    one. The send radio and the folder hints stopped claiming a language for the
    same reason; this is the customer-facing half of that rule.
  */
  it("8.9.28 never names a language", () => {
    const html = render(
      FeedbackFiles({ files: group([
          file({ kind: "feedback", filename: "a.mp4" }),
          file({ kind: "feedback_translation", filename: "b.mp4" }),
        ]),
      }),
    );
    for (const language of ["English", "Japanese", "japanese", "english"]) {
      expect(html).not.toContain(language);
    }
  });
});

/**
 * 8.9.3 — the two customer download pages show the same rows.
 *
 * `/feedback/[token]` (the link inside the ⑥ email) hand-rolled a flat list
 * because `FeedbackFiles` demanded a whole `FeedbackGroup` while reading only
 * its `files`. Both pages pass the same array through the same component now,
 * so the grouping cannot land on one and not the other again.
 */
describe("8.9.3 — one row shape for both customer pages", () => {
  it("groups a both-folder release wherever it is rendered", () => {
    const files = [
      file({ kind: "feedback", filename: "coach.mp4" }),
      file({ kind: "feedback_translation", filename: "translated.mp4" }),
    ];
    const html = render(FeedbackFiles({ files: files as never }));
    expect(html).toContain("From your coach");
    expect(html).toContain("Translated for you");
    // And the row itself is the shared one, with its plain anchor.
    expect(html).toContain("/api/feedback/");
    expect(html).not.toContain("_blank");
  });
});
