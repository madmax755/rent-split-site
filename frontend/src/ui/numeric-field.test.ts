import { describe, expect, test } from "bun:test";
import {
  clampNumber,
  formatNumericValue,
  isNumericDraft,
  normaliseNumericDraft,
  parseNumericDraft,
} from "./numeric-draft";

describe("numeric draft parsing", () => {
  test("accepts a comma as a decimal separator", () => {
    expect(normaliseNumericDraft("3,89")).toBe("3.89");
  });

  test("allows intermediate drafts so backspace stays visible", () => {
    expect(isNumericDraft("", { allowNegative: false })).toBe(true);
    expect(isNumericDraft("3.", { allowNegative: false })).toBe(true);
    expect(isNumericDraft("3.8", { allowNegative: false })).toBe(true);
    expect(isNumericDraft("3.89", { allowNegative: false })).toBe(true);
    expect(isNumericDraft("3.8.9", { allowNegative: false })).toBe(false);
    expect(isNumericDraft("-1", { allowNegative: false })).toBe(false);
    expect(isNumericDraft("12a", { allowNegative: false })).toBe(false);
  });

  test("does not commit incomplete drafts", () => {
    expect(parseNumericDraft("")).toBeNull();
    expect(parseNumericDraft("3.")).toBeNull();
    expect(parseNumericDraft(".")).toBeNull();
    expect(parseNumericDraft("3.89")).toBe(3.89);
    expect(parseNumericDraft("3")).toBe(3);
  });

  test("parses integers without a trailing decimal", () => {
    expect(isNumericDraft("12", { integer: true })).toBe(true);
    expect(isNumericDraft("12.", { integer: true })).toBe(false);
    expect(parseNumericDraft("12", { integer: true })).toBe(12);
  });

  test("clamps and formats committed values", () => {
    expect(clampNumber(-1, 0, 10)).toBe(0);
    expect(clampNumber(99, 1, 31)).toBe(31);
    expect(formatNumericValue(3.89)).toBe("3.89");
    expect(formatNumericValue(null)).toBe("");
  });
});
