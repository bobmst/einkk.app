import { describe, expect, it } from "vitest";
import { digitCheck, groupDigits, raidProgress, regroup, valueAt } from "./numbers";

describe("regroup", () => {
  it("keeps the caret after the digit typed mid-number", () => {
    // "2,763,553,744" with a 9 typed after the 2nd digit; the caret sits after it
    expect(regroup("2,9763,553,744", 3, "2,763,553,744")).toEqual({ value: "29,763,553,744", caret: 2 });
  });

  it("keeps the caret when a new comma lands before it", () => {
    expect(regroup("9999", 4, "999")).toEqual({ value: "9,999", caret: 5 });
    expect(regroup("1999", 1, "999")).toEqual({ value: "1,999", caret: 1 });
  });

  it("keeps the caret where a digit was deleted mid-number", () => {
    expect(regroup("27,65,537,449", 4, "27,635,537,449")).toEqual({ value: "2,765,537,449", caret: 4 });
  });

  it("deletes the digit before a comma backspaced over", () => {
    expect(regroup("27635,537,449", 2, "27,635,537,449", "deleteContentBackward"))
      .toEqual({ value: "2,635,537,449", caret: 1 });
  });

  it("deletes the digit after a comma deleted forward", () => {
    expect(regroup("27635,537,449", 2, "27,635,537,449", "deleteContentForward"))
      .toEqual({ value: "2,735,537,449", caret: 3 });
  });

  it("drops non-digits and leading zeros without losing the caret", () => {
    expect(regroup("12a3", 3, "123")).toEqual({ value: "123", caret: 2 });
    expect(regroup("0123", 1, "123")).toEqual({ value: "123", caret: 0 });
  });

  it("puts the caret at the end when typing at the end", () => {
    const raw = "27,635,537,4499";
    expect(regroup(raw, raw.length, "27,635,537,449")).toEqual({ value: "276,355,374,499", caret: 15 });
  });

  it("agrees with groupDigits on the value", () => {
    expect(regroup("27635537449", 0, "").value).toBe(groupDigits("27635537449"));
  });
});

describe("digitCheck", () => {
  const cells = [
    { percentile: 0.5, value: 300 }, { percentile: 1, value: 260 }, { percentile: 3, value: 220 },
    { percentile: 10, value: 150 },
  ];

  it("flags a score a digit short once the line has grown, never early on day 1", () => {
    const day2 = raidProgress(2, 0.25);
    expect(digitCheck(cells, 2.33, 22.33, day2)).toBe("low");          // 2,233,445,566 for ~22B
    expect(digitCheck(cells, 2.33, 223.3, day2)).toBeNull();
    expect(digitCheck(cells, 3, 6, raidProgress(1, 0.1))).toBeNull();   // a first attempt on day 1
    expect(digitCheck(cells, 3, 6, raidProgress(6, 0))).toBe("low");    // the same as a final result
  });

  it("flags a score a digit long", () => {
    expect(digitCheck(cells, 3, 2200, 1)).toBe("high");
    expect(digitCheck(cells, 0.2, 400, 1)).toBeNull();                  // a top player above the top cell
  });

  it("leaves a rank past the last cell unchecked", () => {
    expect(digitCheck(cells, 40, 30, 1)).toBeNull();                    // under a third of the 10% cell
    expect(digitCheck(cells, 10, 30, 1)).toBe("low");                   // at the last cell it still counts
  });

  it("reads the curve between cells in log rank", () => {
    expect(valueAt(cells, 3)).toBe(220);
    expect(valueAt(cells, 0.1)).toBe(300);
    expect(valueAt(cells, 2)!).toBeGreaterThan(220);
    expect(valueAt(cells, 2)!).toBeLessThan(260);
  });
});
