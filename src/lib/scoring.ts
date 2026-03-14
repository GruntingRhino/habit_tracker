export interface DailyEntryInput {
  sleepHours?: number | null;
  workoutCompleted?: boolean | null;
  workoutRoutineName?: string | null;
  sportsTrainingMinutes?: number | null;
  steps?: number | null;
  deepWorkHours?: number | null;
  screenTimeHours?: number | null;
  tasksPlanned?: number | null;
  tasksCompleted?: number | null;
  taskDifficultyRating?: number | null;
  moneySpent?: number | null;
  moneySaved?: number | null;
  overallDayRating?: number | null;
  incomeActivity?: boolean | null;
  caloriesEaten?: number | null;
}

export interface ProjectStats {
  completedThisWeek: number;
  overdueCount: number;
  totalActive: number;
}

export interface ScoreParams {
  entry: DailyEntryInput;
  habitCompletionRate: number; // 0–1
  projectStats: ProjectStats;
  recentStreak: number; // days
}

export interface CategoryScores {
  physical: number;
  financial: number;
  discipline: number;
  focus: number;
  mental: number;
  appearance: number;
  overall: number;
}

function clamp(value: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, value));
}

// Physical: strict sleep windows, requires real training for high scores
function calcPhysical(entry: DailyEntryInput): number {
  let score = 0;
  const sleep = entry.sleepHours ?? 0;

  // Sleep scoring — strict window, <6h = 0
  if (sleep >= 7.5 && sleep <= 8.5) score += 4;
  else if (sleep >= 6.5 && sleep < 7.5) score += 2.5;
  else if (sleep > 8.5 && sleep <= 9.5) score += 2.5;
  else if (sleep >= 6 && sleep < 6.5) score += 1;
  else if (sleep > 9.5) score += 1;
  // sleep < 6 = 0 pts (no sleep, no score)

  // Workout — must have done a named routine for full points
  const didWorkout = entry.workoutRoutineName
    ? true
    : (entry.workoutCompleted ?? false);
  if (didWorkout) score += 3;

  // Training — 90min = full 3pts, below that proportional
  const training = entry.sportsTrainingMinutes ?? 0;
  if (training >= 90) score += 3;
  else score += clamp((training / 90) * 3, 0, 3);

  return clamp(score);
}

// Financial: income activity is the primary driver — missing it is a hard cap
function calcFinancial(entry: DailyEntryInput): number {
  let score = 0;

  // Did you do something to make money today? This is THE question.
  // Without it you're just spending, not building — caps effective score at ~5
  if (entry.incomeActivity) {
    score += 4;
  }

  const spent = entry.moneySpent ?? 0;
  const saved = entry.moneySaved ?? 0;

  if (spent === 0 && saved === 0) {
    // No financial data — base 2pts if income activity done, else 1pt
    score += entry.incomeActivity ? 2 : 1;
  } else {
    const total = spent + saved;
    const ratio = total > 0 ? saved / total : 0;
    // Savings ratio: up to 4pts
    score += clamp(ratio * 4, 0, 4);
    // Bonus: actually saved money (not just zero spend)
    if (saved > 0) score += clamp((saved / 100) * 2, 0, 2);
  }

  return clamp(score);
}

// Discipline: <50% habit completion = 0 from habits (harsh threshold)
function calcDiscipline(
  entry: DailyEntryInput,
  habitCompletionRate: number,
  recentStreak: number
): number {
  let score = 0;

  // Habit completion — strict thresholds
  if (habitCompletionRate >= 0.9) score += 5;
  else if (habitCompletionRate >= 0.75) score += 3.5;
  else if (habitCompletionRate >= 0.5) score += 2;
  else score += 0; // below 50% = zero — no participation trophy

  // Streak: consistency over time
  if (recentStreak >= 30) score += 3;
  else if (recentStreak >= 14) score += 2;
  else if (recentStreak >= 7) score += 1.5;
  else if (recentStreak >= 3) score += 0.5;

  // Task completion
  const planned = entry.tasksPlanned ?? 0;
  const completed = entry.tasksCompleted ?? 0;
  if (planned > 0) {
    const ratio = completed / planned;
    if (ratio >= 1) score += 2;
    else if (ratio >= 0.75) score += 1.5;
    else if (ratio >= 0.5) score += 0.75;
    // below 50% task completion = 0 pts here too
  }

  return clamp(score);
}

// Focus: requires substantial deep work, penalizes high screen time
function calcFocus(entry: DailyEntryInput): number {
  let score = 0;
  const dw = entry.deepWorkHours ?? 0;

  // Deep work — 6h = max, steep curve
  if (dw >= 6) score += 6;
  else if (dw >= 4) score += 4.5;
  else if (dw >= 2) score += 3;
  else if (dw >= 1) score += 1.5;
  else score += 0; // no deep work = 0 from this dimension

  const screen = entry.screenTimeHours ?? 0;
  // Screen time penalty/bonus
  if (screen <= 2) score += 2;
  else if (screen <= 4) score += 1;
  else if (screen <= 5) score += 0.5;
  else if (screen > 5) score -= 1; // active penalty for excessive screen time

  const planned = entry.tasksPlanned ?? 0;
  const completed = entry.tasksCompleted ?? 0;
  if (planned > 0) score += clamp((completed / planned) * 2, 0, 2);

  return clamp(score);
}

// Mental: uses objective data — sleep quality, day rating, screen balance
function calcMental(entry: DailyEntryInput): number {
  let score = 0;

  // Day rating (1-10 scale) — strict
  const rating = entry.overallDayRating ?? 0;
  if (rating >= 9) score += 5;
  else if (rating >= 7) score += 3.5;
  else if (rating >= 5) score += 2;
  else if (rating >= 3) score += 1;
  else if (rating > 0) score += 0.5;
  else score += 2.5; // not rated → neutral

  // Sleep — must be in quality range for mental recovery
  const sleep = entry.sleepHours ?? 0;
  if (sleep >= 7.5 && sleep <= 8.5) score += 3;
  else if (sleep >= 6.5) score += 1.5;
  else if (sleep >= 6) score += 0.5;
  // below 6 = no mental recovery points

  // Screen time impact on mental clarity
  const screen = entry.screenTimeHours ?? 0;
  if (screen <= 2) score += 2;
  else if (screen <= 4) score += 1;
  // above 4h = 0 mental pts from screen

  return clamp(score);
}

// Appearance: requires workout + training + movement + sleep all good for 10/10
function calcAppearance(entry: DailyEntryInput): number {
  let score = 0;

  const didWorkout = entry.workoutRoutineName
    ? true
    : (entry.workoutCompleted ?? false);
  if (didWorkout) score += 3;

  const training = entry.sportsTrainingMinutes ?? 0;
  if (training >= 60) score += 2;
  else if (training >= 30) score += 1;

  const steps = entry.steps ?? 0;
  if (steps >= 10000) score += 2;
  else if (steps >= 7000) score += 1.5;
  else if (steps >= 5000) score += 1;
  else if (steps > 0) score += 0.5;

  const sleep = entry.sleepHours ?? 0;
  if (sleep >= 7.5 && sleep <= 8.5) score += 2;
  else if (sleep >= 6.5) score += 1;

  // Calorie awareness bonus (tracking counts, reasonable range = 1pt)
  const cal = entry.caloriesEaten ?? 0;
  if (cal >= 1400 && cal <= 3000) score += 1;

  return clamp(score);
}

export function calculateScores(params: ScoreParams): CategoryScores {
  const { entry, habitCompletionRate, projectStats, recentStreak } = params;
  void projectStats;

  const physical   = calcPhysical(entry);
  const financial  = calcFinancial(entry);
  const discipline = calcDiscipline(entry, habitCompletionRate, recentStreak);
  const focus      = calcFocus(entry);
  const mental     = calcMental(entry);
  const appearance = calcAppearance(entry);

  const overall = clamp(
    physical   * 0.20 +
    financial  * 0.15 +
    discipline * 0.20 +
    focus      * 0.20 +
    mental     * 0.15 +
    appearance * 0.10
  );

  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    physical:   r(physical),
    financial:  r(financial),
    discipline: r(discipline),
    focus:      r(focus),
    mental:     r(mental),
    appearance: r(appearance),
    overall:    r(overall),
  };
}
