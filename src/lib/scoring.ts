import { assessWorkout, calcTrainingLoadPoints } from "@/lib/workout";
import {
  DEFAULT_SCORING_SETTINGS,
  SCORE_CATEGORY_KEYS,
  type ScoreCategoryKey,
  type ScoringSettings,
} from "@/lib/scoring-settings";

export interface DailyEntryInput {
  sleepHours?: number | null;
  workoutCompleted?: boolean | null;
  workoutRoutineName?: string | null;
  workoutDurationMinutes?: number | null;
  workoutIntensity?: string | null;
  workoutDetails?: string | null;
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
  rightWithGod?: boolean | null;
}

export interface ProjectStats {
  completedThisWeek: number;
  overdueCount: number;
  totalActive: number;
}

export interface ScoreParams {
  entry: DailyEntryInput;
  habitCompletionRate: number;
  projectStats: ProjectStats;
  recentStreak: number;
  scoringSettings?: ScoringSettings;
  categoryHabitRates?: Partial<Record<ScoreCategoryKey, number>>;
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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function ratio(value: number, target: number): number {
  if (target <= 0) return 0;
  return clamp(value / target, 0, 1);
}

function getStrictnessFactor(settings: ScoringSettings): number {
  switch (settings.strictness) {
    case "lenient":
      return 0.9;
    case "strict":
      return 1.12;
    default:
      return 1;
  }
}

function getAdjustedTarget(target: number, settings: ScoringSettings): number {
  return target * getStrictnessFactor(settings);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedAverage(parts: Array<{ value: number; weight: number }>): number {
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight <= 0) return 0;

  return parts.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight;
}

function getTaskCompletionRatio(entry: DailyEntryInput): number {
  const planned = entry.tasksPlanned ?? 0;
  const completed = entry.tasksCompleted ?? 0;
  if (planned <= 0) return completed > 0 ? 1 : 0;
  return clamp(completed / planned, 0, 1.2);
}

function getOverduePenalty(projectStats: ProjectStats, perProject: number, maxPenalty: number): number {
  return Math.min(projectStats.overdueCount * perProject, maxPenalty);
}

function calcPhysical(entry: DailyEntryInput, settings: ScoringSettings): number {
  const workout = assessWorkout(entry);
  const sleepHours = entry.sleepHours ?? 0;
  const steps = entry.steps ?? 0;
  const trainingLoadMinutes = workout.effectiveTrainingMinutes + (entry.sportsTrainingMinutes ?? 0);

  const sleepTarget = getAdjustedTarget(8, settings);
  const stepTarget = getAdjustedTarget(10000, settings);

  const sleepScore = clamp(10 - Math.abs(sleepHours - sleepTarget) * 2.2, 0, 10);
  const movementScore = ratio(steps, stepTarget) * 10;
  const trainingScore = clamp(workout.qualityPoints + calcTrainingLoadPoints(trainingLoadMinutes), 0, 10);
  const calorieAwareness = entry.caloriesEaten && entry.caloriesEaten > 0 ? 7 : 4;

  return clamp(
    weightedAverage([
      { value: trainingScore, weight: 0.45 },
      { value: movementScore, weight: 0.25 },
      { value: sleepScore, weight: 0.2 },
      { value: calorieAwareness, weight: 0.1 },
    ])
  );
}

function calcFinancial(entry: DailyEntryInput, settings: ScoringSettings): number {
  const ageYears = settings.ageYears;
  const incomeSignal = entry.incomeActivity ? 10 : 0;
  const savingsSignal = entry.moneySaved && entry.moneySaved > 0 ? 8 : 4;
  const disciplineSignal =
    ageYears !== null && ageYears <= 22
      ? average([
          ratio(entry.deepWorkHours ?? 0, getAdjustedTarget(4, settings)) * 10,
          clamp(getTaskCompletionRatio(entry) * 10, 0, 10),
        ])
      : savingsSignal;

  return clamp(
    weightedAverage([
      { value: incomeSignal, weight: ageYears !== null && ageYears <= 22 ? 0.45 : 0.65 },
      { value: disciplineSignal, weight: ageYears !== null && ageYears <= 22 ? 0.35 : 0.2 },
      { value: savingsSignal, weight: 0.2 },
    ])
  );
}

function calcDiscipline(
  entry: DailyEntryInput,
  habitCompletionRate: number,
  recentStreak: number,
  projectStats: ProjectStats,
  settings: ScoringSettings,
  categoryHabitRates?: Partial<Record<ScoreCategoryKey, number>>
): number {
  const taskRatio = getTaskCompletionRatio(entry);
  const habitRate = average([
    habitCompletionRate,
    categoryHabitRates?.discipline ?? 0,
  ]);
  const streakScore = ratio(recentStreak, settings.strictness === "strict" ? 21 : 14) * 10;
  const entryScore = average([
    clamp(taskRatio * 10, 0, 10),
    ratio(entry.deepWorkHours ?? 0, getAdjustedTarget(4, settings)) * 10,
    clamp(10 - (entry.screenTimeHours ?? 0) * 1.4, 0, 10),
  ]);

  return clamp(
    weightedAverage([
      { value: entryScore, weight: 0.45 },
      { value: habitRate * 10, weight: 0.4 },
      { value: streakScore, weight: 0.15 },
    ]) - getOverduePenalty(projectStats, 0.8, 2.5)
  );
}

function calcFocus(
  entry: DailyEntryInput,
  projectStats: ProjectStats,
  settings: ScoringSettings,
  categoryHabitRates?: Partial<Record<ScoreCategoryKey, number>>
): number {
  const deepWorkScore = ratio(entry.deepWorkHours ?? 0, getAdjustedTarget(5, settings)) * 10;
  const taskScore = clamp(getTaskCompletionRatio(entry) * 10, 0, 10);
  const junkPenaltyBase = entry.screenTimeHours ?? 0;
  const screenScore = clamp(10 - junkPenaltyBase * (settings.strictness === "strict" ? 2.1 : 1.7), 0, 10);
  const habitScore = average([
    categoryHabitRates?.focus ?? 0,
    categoryHabitRates?.discipline ?? 0,
  ]) * 10;

  return clamp(
    weightedAverage([
      { value: deepWorkScore, weight: 0.4 },
      { value: taskScore, weight: 0.3 },
      { value: screenScore, weight: 0.2 },
      { value: habitScore, weight: 0.1 },
    ]) - getOverduePenalty(projectStats, 0.7, 2)
  );
}

function calcMental(
  entry: DailyEntryInput,
  settings: ScoringSettings,
  categoryHabitRates?: Partial<Record<ScoreCategoryKey, number>>
): number {
  const sleepScore = clamp(10 - Math.abs((entry.sleepHours ?? 0) - getAdjustedTarget(8, settings)) * 1.8, 0, 10);
  const reflectionScore = entry.overallDayRating ? entry.overallDayRating : 5;
  const deepWorkScore = ratio(entry.deepWorkHours ?? 0, getAdjustedTarget(4, settings)) * 10;
  const screenBalanceScore = clamp(10 - (entry.screenTimeHours ?? 0) * 1.3, 0, 10);
  const habitScore = (categoryHabitRates?.mental ?? 0) * 10;

  return clamp(
    weightedAverage([
      { value: reflectionScore, weight: 0.3 },
      { value: sleepScore, weight: 0.25 },
      { value: deepWorkScore, weight: 0.15 },
      { value: screenBalanceScore, weight: 0.15 },
      { value: habitScore, weight: 0.15 },
    ])
  );
}

export function calculateOverallScore(scores: Pick<CategoryScores, "physical" | "financial" | "discipline" | "focus" | "mental">): number {
  return clamp(
    scores.physical * 0.25 +
      scores.financial * 0.15 +
      scores.discipline * 0.2 +
      scores.focus * 0.2 +
      scores.mental * 0.2
  );
}

export function calculateScores(params: ScoreParams): CategoryScores {
  const {
    entry,
    habitCompletionRate,
    projectStats,
    recentStreak,
    categoryHabitRates,
    scoringSettings = DEFAULT_SCORING_SETTINGS,
  } = params;

  const physical = calcPhysical(entry, scoringSettings);
  const financial = calcFinancial(entry, scoringSettings);
  const discipline = calcDiscipline(
    entry,
    habitCompletionRate,
    recentStreak,
    projectStats,
    scoringSettings,
    categoryHabitRates
  );
  const focus = calcFocus(entry, projectStats, scoringSettings, categoryHabitRates);
  const mental = calcMental(entry, scoringSettings, categoryHabitRates);

  const overall = calculateOverallScore({
    physical,
    financial,
    discipline,
    focus,
    mental,
  });

  return {
    physical: round1(physical),
    financial: round1(financial),
    discipline: round1(discipline),
    focus: round1(focus),
    mental: round1(mental),
    appearance: 0,
    overall: round1(overall),
  };
}

export const SCORE_CATEGORIES = SCORE_CATEGORY_KEYS;
