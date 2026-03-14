export interface DailyEntryInput {
  sleepHours?: number | null;
  workoutCompleted?: boolean | null;
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

// Physical: how well you're training and recovering
// Max 10 = great sleep + workout + heavy sports training
function calcPhysical(entry: DailyEntryInput): number {
  let score = 0;
  const sleep = entry.sleepHours ?? 0;
  if (sleep >= 7 && sleep <= 9) score += 3;
  else if (sleep > 0 && sleep < 7) score += (sleep / 7) * 2;
  else if (sleep > 9) score += Math.max(0, 3 - (sleep - 9) * 0.5);

  if (entry.workoutCompleted) score += 3;

  const training = entry.sportsTrainingMinutes ?? 0;
  score += clamp((training / 60) * 4, 0, 4);

  return clamp(score);
}

// Financial: savings discipline
function calcFinancial(entry: DailyEntryInput): number {
  const spent = entry.moneySpent ?? 0;
  const saved = entry.moneySaved ?? 0;
  if (spent === 0 && saved === 0) return 5;
  const total = spent + saved;
  if (total === 0) return 5;
  const ratio = saved / total;
  return clamp(ratio * 8 + (saved > spent ? 2 : 0));
}

// Discipline: how consistent and structured you are
function calcDiscipline(
  entry: DailyEntryInput,
  habitCompletionRate: number,
  recentStreak: number
): number {
  let score = 0;
  score += habitCompletionRate * 5;
  score += clamp((recentStreak / 30) * 3, 0, 3);
  const planned = entry.tasksPlanned ?? 0;
  const completed = entry.tasksCompleted ?? 0;
  if (planned > 0) score += clamp((completed / planned) * 2, 0, 2);
  return clamp(score);
}

// Focus: deep work output vs distractions
function calcFocus(entry: DailyEntryInput): number {
  let score = 0;
  const dw = entry.deepWorkHours ?? 0;
  score += clamp((dw / 8) * 6, 0, 6);

  const screen = entry.screenTimeHours ?? 0;
  if (screen <= 2) score += 2;
  else if (screen <= 4) score += 2 - ((screen - 2) / 2);
  else if (screen <= 6) score += Math.max(0, 1 - ((screen - 4) / 2));

  const planned = entry.tasksPlanned ?? 0;
  const completed = entry.tasksCompleted ?? 0;
  if (planned > 0) score += clamp((completed / planned) * 2, 0, 2);

  return clamp(score);
}

// Mental: wellbeing indicators — sleep, day rating, screen balance
// Scored on objective self-reported metrics, not diagnoses
function calcMental(entry: DailyEntryInput): number {
  let score = 0;

  // Day rating (1-5 scale → 0-5 points)
  const rating = entry.overallDayRating ?? 0;
  if (rating > 0) score += clamp(((rating - 1) / 4) * 5, 0, 5);
  else score += 2.5; // neutral if not rated

  // Quality sleep = mental recovery (7-9h = 3pts)
  const sleep = entry.sleepHours ?? 0;
  if (sleep >= 7 && sleep <= 9) score += 3;
  else if (sleep > 0) score += Math.max(0, 3 - Math.abs(sleep - 8) * 0.8);

  // Low screen time = better mental focus/mood (≤2h = 2pts)
  const screen = entry.screenTimeHours ?? 0;
  if (screen <= 2) score += 2;
  else if (screen <= 5) score += Math.max(0, 2 - ((screen - 2) / 3) * 2);

  return clamp(score);
}

// Appearance: physical presence maintenance
function calcAppearance(entry: DailyEntryInput): number {
  let score = 0;
  if (entry.workoutCompleted) score += 3;

  const training = entry.sportsTrainingMinutes ?? 0;
  score += clamp((training / 60) * 3, 0, 3);

  const steps = entry.steps ?? 0;
  if (steps >= 10000) score += 2;
  else if (steps > 0) score += (steps / 10000) * 2;

  const sleep = entry.sleepHours ?? 0;
  if (sleep >= 7 && sleep <= 9) score += 2;
  else if (sleep > 0) score += Math.max(0, 2 - Math.abs(sleep - 8) * 0.5);

  return clamp(score);
}

export function calculateScores(params: ScoreParams): CategoryScores {
  const { entry, habitCompletionRate, projectStats, recentStreak } = params;
  void projectStats; // reserved for future use

  const physical   = calcPhysical(entry);
  const financial  = calcFinancial(entry);
  const discipline = calcDiscipline(entry, habitCompletionRate, recentStreak);
  const focus      = calcFocus(entry);
  const mental     = calcMental(entry);
  const appearance = calcAppearance(entry);

  const overall = clamp(
    physical   * 0.2 +
    financial  * 0.15 +
    discipline * 0.2 +
    focus      * 0.2 +
    mental     * 0.15 +
    appearance * 0.1
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
