export interface DailyEntryInput {
  sleepHours?: number | null;
  workoutCompleted?: boolean | null;
  sportsTrainingMinutes?: number | null;
  deepWorkHours?: number | null;
  screenTimeHours?: number | null;
  tasksPlanned?: number | null;
  tasksCompleted?: number | null;
  taskDifficultyRating?: number | null;
  moneySpent?: number | null;
  moneySaved?: number | null;
  overallDayRating?: number | null;
}

export interface ProjectStats {
  completedThisWeek: number;
  overdueCount: number;
  totalActive: number;
}

export interface ScoreParams {
  entry: DailyEntryInput;
  habitCompletionRate: number; // 0-1
  projectStats: ProjectStats;
  recentStreak: number; // days
}

export interface CategoryScores {
  physical: number;
  focus: number;
  consistency: number;
  financial: number;
  responsibility: number;
  overall: number;
}

function clamp(value: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, value));
}

function calcPhysical(entry: DailyEntryInput): number {
  let score = 0;

  // Sleep: 7-9 hours = 4 points (peak), scale from 0-6 linearly
  const sleep = entry.sleepHours ?? 0;
  if (sleep >= 7 && sleep <= 9) {
    score += 4;
  } else if (sleep > 0 && sleep < 7) {
    score += (sleep / 7) * 3;
  } else if (sleep > 9) {
    score += Math.max(0, 4 - (sleep - 9) * 0.5);
  }

  // Workout: 2 point bonus
  if (entry.workoutCompleted) {
    score += 2;
  }

  // Sports training: up to 4 points (60+ min = full 4 pts)
  const trainingMins = entry.sportsTrainingMinutes ?? 0;
  if (trainingMins > 0) {
    score += clamp((trainingMins / 60) * 4, 0, 4);
  }

  return clamp(score);
}

function calcFocus(entry: DailyEntryInput): number {
  let score = 0;

  // Deep work: 8h = 10 points, linear scale
  const deepWork = entry.deepWorkHours ?? 0;
  score += clamp((deepWork / 8) * 6, 0, 6);

  // Screen time penalty: >6h heavily penalised
  const screenTime = entry.screenTimeHours ?? 0;
  if (screenTime <= 2) {
    score += 2;
  } else if (screenTime <= 4) {
    score += 2 - ((screenTime - 2) / 2) * 1;
  } else if (screenTime <= 6) {
    score += 1 - ((screenTime - 4) / 2) * 1;
  }
  // >6h: 0 bonus

  // Task completion rate bonus: up to 2 points
  const planned = entry.tasksPlanned ?? 0;
  const completed = entry.tasksCompleted ?? 0;
  if (planned > 0) {
    const rate = completed / planned;
    score += clamp(rate * 2, 0, 2);
  }

  return clamp(score);
}

function calcConsistency(
  entry: DailyEntryInput,
  habitCompletionRate: number,
  recentStreak: number
): number {
  let score = 0;

  // Habit completion rate: up to 5 points
  score += habitCompletionRate * 5;

  // Streak bonus: up to 3 points (30-day streak = full)
  score += clamp((recentStreak / 30) * 3, 0, 3);

  // Task consistency: up to 2 points
  const planned = entry.tasksPlanned ?? 0;
  const completed = entry.tasksCompleted ?? 0;
  if (planned > 0) {
    score += clamp((completed / planned) * 2, 0, 2);
  }

  return clamp(score);
}

function calcFinancial(entry: DailyEntryInput): number {
  const spent = entry.moneySpent ?? 0;
  const saved = entry.moneySaved ?? 0;

  // If no financial data at all, return neutral 5
  if (spent === 0 && saved === 0) return 5;

  const total = spent + saved;
  if (total === 0) return 5;

  // Savings ratio: saved/total, scaled 0-10
  const savingsRatio = saved / total;
  let score = savingsRatio * 8;

  // Bonus: if saved > spent, +2 pts
  if (saved > spent) {
    score += 2;
  }

  return clamp(score);
}

function calcResponsibility(
  entry: DailyEntryInput,
  projectStats: ProjectStats
): number {
  let score = 0;

  // Task completion rate: up to 5 points
  const planned = entry.tasksPlanned ?? 0;
  const completed = entry.tasksCompleted ?? 0;
  if (planned > 0) {
    score += clamp((completed / planned) * 5, 0, 5);
  } else {
    score += 3; // neutral if no tasks planned
  }

  // Task difficulty rating bonus: up to 2 pts (rating 1-5 -> 0-2)
  const difficulty = entry.taskDifficultyRating ?? 0;
  if (difficulty > 0) {
    score += clamp(((difficulty - 1) / 4) * 2, 0, 2);
  }

  // Project completion this week: up to 2 pts (1+ completed = full)
  if (projectStats.completedThisWeek > 0) {
    score += Math.min(2, projectStats.completedThisWeek * 0.5);
  }

  // Overdue penalty: -1 per overdue project, max -3
  const overduePenalty = Math.min(3, projectStats.overdueCount);
  score -= overduePenalty;

  // Overall day rating bonus: up to 1 pt
  const dayRating = entry.overallDayRating ?? 0;
  if (dayRating > 0) {
    score += clamp(((dayRating - 1) / 4) * 1, 0, 1);
  }

  return clamp(score);
}

export function calculateScores(params: ScoreParams): CategoryScores {
  const { entry, habitCompletionRate, projectStats, recentStreak } = params;

  const physical = calcPhysical(entry);
  const focus = calcFocus(entry);
  const consistency = calcConsistency(entry, habitCompletionRate, recentStreak);
  const financial = calcFinancial(entry);
  const responsibility = calcResponsibility(entry, projectStats);

  // Weighted overall score
  const overall = clamp(
    physical * 0.25 +
      focus * 0.25 +
      consistency * 0.2 +
      financial * 0.15 +
      responsibility * 0.15
  );

  return {
    physical: Math.round(physical * 10) / 10,
    focus: Math.round(focus * 10) / 10,
    consistency: Math.round(consistency * 10) / 10,
    financial: Math.round(financial * 10) / 10,
    responsibility: Math.round(responsibility * 10) / 10,
    overall: Math.round(overall * 10) / 10,
  };
}
