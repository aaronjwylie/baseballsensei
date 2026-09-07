import { describe, it, expect } from "vitest";
import {
  needsTranslation,
  languagesForChoice,
  readLanguageChoice,
  choiceForLanguages,
} from "@/domains/submission/model/submission";

describe("needsTranslation — intersect the two sets, empty means translate", () => {
  it("a shared language is enough only when the source has nothing else", () => {
    expect(needsTranslation(["Japanese"], ["Japanese"])).toBe(false);
    expect(needsTranslation(["English"], ["English", "Japanese"])).toBe(false);
  });

  /*
    A bilingual customer against a monolingual coach DOES need translating, even
    though the two overlap: the customer may well have written in the language
    the coach can't read. The rule was a plain intersection until QA 5.9 walked
    the matrix and found this corner returning "no translation needed" for a
    submission nobody could read (Ben, 2026-09-02).
  */
  it("a bilingual source against a monolingual target still needs it", () => {
    expect(needsTranslation(["English", "Japanese"], ["English"])).toBe(true);
  });

  it("disjoint sets need translation", () => {
    expect(needsTranslation(["English"], ["Japanese"])).toBe(true);
  });

  it("compares case-insensitively and trims", () => {
    expect(needsTranslation([" english "], ["ENGLISH"])).toBe(false);
  });

  it("is null — not false — when either side has declared nothing", () => {
    expect(needsTranslation([], ["English"])).toBeNull();
    expect(needsTranslation(["English"], undefined)).toBeNull();
    expect(needsTranslation(undefined, undefined)).toBeNull();
  });
});

describe("language choice round-trips", () => {
  it("languagesForChoice expands 'both' and passes a single through", () => {
    expect(languagesForChoice("both")).toEqual(["English", "Japanese"]);
    expect(languagesForChoice("English")).toEqual(["English"]);
    expect(languagesForChoice("Japanese")).toEqual(["Japanese"]);
  });

  it("choiceForLanguages inverts it, case-insensitively", () => {
    expect(choiceForLanguages(["english", "japanese"], "English")).toBe("both");
    expect(choiceForLanguages(["Japanese"], "English")).toBe("Japanese");
    expect(choiceForLanguages(["English"], "Japanese")).toBe("English");
  });

  it("readLanguageChoice falls back on anything unrecognised", () => {
    expect(readLanguageChoice("both", "English")).toBe("both");
    expect(readLanguageChoice("klingon", "English")).toBe("English");
    expect(readLanguageChoice(undefined, "Japanese")).toBe("Japanese");
  });

  it("choiceForLanguages falls back on an empty or unknown set", () => {
    expect(choiceForLanguages([], "English")).toBe("English");
    expect(choiceForLanguages(["martian"], "Japanese")).toBe("Japanese");
  });
});
