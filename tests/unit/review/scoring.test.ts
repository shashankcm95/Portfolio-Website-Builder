/**
 * @jest-environment node
 *
 * Unit tests for the layout-review scoring + grouping helpers.
 */

import {
  computeScore,
  groupBySeverity,
  scoreBand,
} from "@/lib/review/scoring";
import type { LayoutIssue } from "@/lib/review/types";

function issue(severity: LayoutIssue["severity"], rule = "Rx"): LayoutIssue {
  return {
    rule,
    tier: "static",
    severity,
    message: `synthetic ${severity}`,
  };
}

describe("computeScore", () => {
  it("returns 100 with no issues", () => {
    expect(computeScore([])).toBe(100);
  });

  it("subtracts 3 per warning", () => {
    expect(computeScore([issue("warning")])).toBe(97);
    expect(computeScore([issue("warning"), issue("warning")])).toBe(94);
  });

  it("subtracts 15 per critical", () => {
    expect(computeScore([issue("critical")])).toBe(85);
    expect(computeScore([issue("critical"), issue("critical")])).toBe(70);
  });

  it("ignores info-level issues", () => {
    expect(
      computeScore([issue("info"), issue("info"), issue("info")])
    ).toBe(100);
  });

  it("clamps to [0, 100]", () => {
    const ten = Array.from({ length: 10 }, () => issue("critical"));
    expect(computeScore(ten)).toBe(0);
  });

  it("mixed example: 1 critical + 2 warnings = 79", () => {
    expect(
      computeScore([issue("critical"), issue("warning"), issue("warning")])
    ).toBe(79);
  });

  it("returns an integer", () => {
    expect(Number.isInteger(computeScore([issue("warning")]))).toBe(true);
  });
});

describe("groupBySeverity", () => {
  it("partitions an issue list into critical/warning/info buckets", () => {
    const list: LayoutIssue[] = [
      issue("critical", "A"),
      issue("warning", "B"),
      issue("warning", "C"),
      issue("info", "D"),
    ];
    const grouped = groupBySeverity(list);
    expect(grouped.critical.map((i) => i.rule)).toEqual(["A"]);
    expect(grouped.warning.map((i) => i.rule)).toEqual(["B", "C"]);
    expect(grouped.info.map((i) => i.rule)).toEqual(["D"]);
  });

  it("handles an empty list", () => {
    const g = groupBySeverity([]);
    expect(g.critical).toEqual([]);
    expect(g.warning).toEqual([]);
    expect(g.info).toEqual([]);
  });
});

describe("scoreBand", () => {
  it("maps perfect score to Excellent", () => {
    expect(scoreBand(100)).toEqual({ label: "Excellent", tone: "green" });
  });
  it("maps 80 to Good", () => {
    expect(scoreBand(80)).toEqual({ label: "Good", tone: "green" });
  });
  it("maps 65 to Needs polish", () => {
    expect(scoreBand(65)).toEqual({ label: "Needs polish", tone: "amber" });
  });
  it("maps 50 to Several issues", () => {
    expect(scoreBand(50)).toEqual({ label: "Several issues", tone: "amber" });
  });
  it("maps 20 to Major issues", () => {
    expect(scoreBand(20)).toEqual({ label: "Major issues", tone: "red" });
  });
  it("returns neutral for null score (still running)", () => {
    expect(scoreBand(null)).toEqual({ label: "—", tone: "neutral" });
  });
});
