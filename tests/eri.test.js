import assert from "node:assert/strict";
import test from "node:test";
import {
  getEriClassification,
  formatEriDisplay,
} from "../src/services/eri.js";

test("getEriClassification maps scores to the correct Android application scale tiers", () => {
  // Highly Job Ready (>= 85%)
  assert.equal(getEriClassification(100).level, "highly_ready");
  assert.equal(getEriClassification(85).level, "highly_ready");
  assert.equal(getEriClassification(85).label, "Highly Job Ready");

  // Job Ready (70% - 84%)
  assert.equal(getEriClassification(84).level, "ready");
  assert.equal(getEriClassification(70).level, "ready");
  assert.equal(getEriClassification(75).label, "Job Ready");

  // Developing (50% - 69%)
  assert.equal(getEriClassification(69).level, "developing");
  assert.equal(getEriClassification(50).level, "developing");
  assert.equal(getEriClassification(55).label, "Developing");

  // Needs Practice (1% - 49%)
  assert.equal(getEriClassification(49).level, "needs_practice");
  assert.equal(getEriClassification(37).level, "needs_practice");
  assert.equal(getEriClassification(8).level, "needs_practice");
  assert.equal(getEriClassification(1).level, "needs_practice");
  assert.equal(getEriClassification(37).label, "Needs Practice");
});

test("getEriClassification gracefully handles unassessed candidates without defaulting to 0%", () => {
  assert.equal(getEriClassification(null).level, "none");
  assert.equal(getEriClassification(null).label, "Not Yet Available");

  assert.equal(getEriClassification(undefined).level, "none");
  assert.equal(getEriClassification(NaN).level, "none");
  assert.equal(getEriClassification("invalid").level, "none");
});

test("formatEriDisplay outputs 'Not Yet Available' for candidates without an evaluation", () => {
  assert.equal(formatEriDisplay(null), "Not Yet Available");
  assert.equal(formatEriDisplay(undefined), "Not Yet Available");
  assert.equal(formatEriDisplay(NaN), "Not Yet Available");

  // Formats score
  assert.equal(formatEriDisplay(43), "43%");
  assert.equal(formatEriDisplay(43, true), "43% • Needs Practice");
  assert.equal(formatEriDisplay(72, true), "72% • Job Ready");
  assert.equal(formatEriDisplay(90, true), "90% • Highly Job Ready");
});
