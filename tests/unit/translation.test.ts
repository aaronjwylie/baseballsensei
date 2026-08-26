import { describe, it, expect } from "vitest";
import {
  needsTranslation,
  languagesForChoice,
  readLanguageChoice,
  choiceForLanguages,
} from "@/domains/submission/model/submission";

describe("needsTranslation — intersect the two sets, empty means translate", () => {
  it("overlap of any size means no translation", () => {
    expect(needsTranslation(["English", "Japanese"], ["English"])).toBe(false);
    expect(needsTranslation(["Japanese"], ["Japanese"])).toBe(false);
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
