import { describe, it, expect } from "vitest";
import {
  FILE_KINDS,
  INTAKE_KINDS,
  FEEDBACK_KINDS,
  kindsForSet,
  availableSets,
  isIntake,
  isFeedback,
  formatFileSize,
} from "@/domains/submission/model/submissionFile";

describe("intake / feedback partition the file kinds", () => {
  it("every kind is on exactly one side — no overlap, no gap", () => {
    const feedback = new Set(FEEDBACK_KINDS);
    for (const k of INTAKE_KINDS) expect(feedback.has(k)).toBe(false);
    expect(new Set([...INTAKE_KINDS, ...FEEDBACK_KINDS])).toEqual(new Set(FILE_KINDS));
    expect(INTAKE_KINDS.length + FEEDBACK_KINDS.length).toBe(FILE_KINDS.length);
  });

  it("isIntake / isFeedback classify by side", () => {
    expect(isIntake({ kind: "intake" })).toBe(true);
    expect(isIntake({ kind: "intake_translation" })).toBe(true);
    expect(isIntake({ kind: "feedback" })).toBe(false);
    expect(isFeedback({ kind: "feedback_translation" })).toBe(true);
  });
});

describe("kindsForSet maps a side + choice onto folders", () => {
  it("intake", () => {
    expect(kindsForSet("intake", "original")).toEqual(["intake"]);
    expect(kindsForSet("intake", "translation")).toEqual(["intake_translation"]);
    expect(kindsForSet("intake", "both")).toEqual(["intake", "intake_translation"]);
  });
  it("feedback", () => {
    expect(kindsForSet("feedback", "original")).toEqual(["feedback"]);
    expect(kindsForSet("feedback", "both")).toEqual(["feedback", "feedback_translation"]);
  });
});

describe("availableSets offers only what exists", () => {
  it("'both' only when there are genuinely two", () => {
    expect(availableSets(["intake"])).toEqual(["original"]);
    expect(availableSets(["intake_translation"])).toEqual(["translation"]);
    expect(availableSets(["intake", "intake_translation"])).toEqual([
      "original",
      "translation",
      "both",
    ]);
    expect(availableSets([])).toEqual([]);
  });
});

describe("formatFileSize", () => {
  it("formats across unit boundaries with one decimal below 10", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(50 * 1024 * 1024)).toBe("50 MB");
  });
});
