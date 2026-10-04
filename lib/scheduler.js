const DAY = 86_400_000;

export const REVIEW_GRADES = {
  again: 0,
  hard: 1,
  good: 2,
  easy: 3
};

export function scheduleReview(card, grade, now = Date.now()) {
  if (!Number.isInteger(grade) || grade < 0 || grade > 3) {
    throw new RangeError("Review grade must be an integer from 0 to 3.");
  }

  const repetitions = Number(card.repetitions || 0);
  const oldInterval = Number(card.intervalDays || 0);
  const oldEase = Number(card.ease || 2.5);
  let intervalDays;
  let ease = oldEase;
  let nextRepetitions = repetitions;
  let lapses = Number(card.lapses || 0);

  if (grade === REVIEW_GRADES.again) {
    intervalDays = 10 / (24 * 60); // ten minutes
    nextRepetitions = 0;
    lapses += 1;
    ease = Math.max(1.3, oldEase - 0.2);
  } else if (grade === REVIEW_GRADES.hard) {
    intervalDays = Math.max(1, oldInterval ? oldInterval * 1.2 : 1);
    ease = Math.max(1.3, oldEase - 0.15);
    nextRepetitions += 1;
  } else if (grade === REVIEW_GRADES.good) {
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 3;
    else intervalDays = Math.max(1, oldInterval * oldEase);
    nextRepetitions += 1;
  } else {
    if (repetitions === 0) intervalDays = 3;
    else intervalDays = Math.max(4, oldInterval * oldEase * 1.3);
    ease = Math.min(3, oldEase + 0.15);
    nextRepetitions += 1;
  }

  if (grade !== REVIEW_GRADES.again) intervalDays = Math.round(intervalDays * 100) / 100;
  return {
    ...card,
    intervalDays,
    ease,
    repetitions: nextRepetitions,
    lapses,
    lastReviewedAt: now,
    dueAt: now + intervalDays * DAY
  };
}

export function isDue(card, now = Date.now()) {
  return !card.dueAt || card.dueAt <= now;
}

export function calculateAccuracy(history = []) {
  if (!history.length) return 0;
  const recalled = history.filter((item) => item.grade > 0).length;
  return Math.round((recalled / history.length) * 100);
}

export function calculateStreak(reviewDates = [], now = new Date()) {
  const days = new Set(reviewDates.map((value) => new Date(value).toISOString().slice(0, 10)));
  let cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const today = cursor.toISOString().slice(0, 10);
  if (!days.has(today)) cursor = new Date(cursor.getTime() - DAY);

  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY);
  }
  return streak;
}
