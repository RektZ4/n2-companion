import test from "node:test";
import assert from "node:assert/strict";
import { calculateAccuracy, calculateStreak, isDue, scheduleReview } from "../lib/scheduler.js";

const base = { repetitions: 0, intervalDays: 0, ease: 2.5, lapses: 0 };

test("Again schedules a ten-minute relearn and records a lapse", () => {
  const result = scheduleReview(base, 0, 1_000);
  assert.equal(result.lapses, 1);
  assert.equal(result.repetitions, 0);
  assert.equal(result.dueAt, 601_000);
});

test("Good advances a new card by one day", () => {
  const result = scheduleReview(base, 2, 1_000);
  assert.equal(result.intervalDays, 1);
  assert.equal(result.repetitions, 1);
  assert.equal(result.dueAt, 86_401_000);
});

test("Easy advances a new card by three days", () => {
  const result = scheduleReview(base, 3, 1_000);
  assert.equal(result.intervalDays, 3);
  assert.equal(result.repetitions, 1);
});

test("invalid grades are rejected", () => assert.throws(() => scheduleReview(base, 4), RangeError));
test("due cards include cards without a date", () => assert.equal(isDue({}, 100), true));
test("accuracy treats Hard, Good and Easy as recalled", () => assert.equal(calculateAccuracy([{ grade: 0 }, { grade: 1 }, { grade: 2 }, { grade: 3 }]), 75));
test("streak counts consecutive UTC calendar days", () => assert.equal(calculateStreak(["2026-10-02T01:00:00Z", "2026-10-03T01:00:00Z", "2026-10-04T01:00:00Z"], new Date("2026-10-04T12:00:00Z")), 3));
