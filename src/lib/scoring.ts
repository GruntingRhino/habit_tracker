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

const HABIT_WEIGHT = 1;
const ENTRY_WEIGHT = 2;

function calcPhysical(
  entry: DailyEntryInput,
  habitRate: number,
  settings: ScoringSettings
): number {
  const workout = assessWorkout(entry);
  const sleepHours = entry.sleepHours ?? 0;
  const steps = entry.steps ?? 0;
  const trainingLoadMinutes = workout.effectiveTrainingMinutes + (entry.sportsTrainingMinutes ?? 0);

  const sleepTarget = 8;
  const stepTarget = 10000;

  const sleepScore = clamp(10 - Math.abs(sleepHours - sleepTarget) * 2.2, 0, 10);
  const movementScore = ratio(steps, stepTarget) * 10;
  const trainingScore = clamp(workout.qualityPoints + calcTrainingLoadPoints(trainingLoadMinutes), 0, 10);
  const calorieAwareness = entry.caloriesEaten && entry.caloriesEaten > 0 ? 7 : 4;

  return clamp(
    weightedAverage([
      { value: habitRate * 10, weight: HABIT_WEIGHT },
      { value: trainingScore, weight: ENTRY_WEIGHT },
      { value: movementScore, weight: ENTRY_WEIGHT },
      { value: sleepScore, weight: ENTRY_WEIGHT },
      { value: calorieAwareness, weight: ENTRY_WEIGHT },
    ])
  );
}

function calcFinancial(
  entry: DailyEntryInput,
  habitRate: number,
  settings: ScoringSettings
): number {
  const incomeSignal = entry.incomeActivity ? 10 : 0;
  const savingsSignal = entry.moneySaved && entry.moneySaved > 0 ? 8 : 4;
  const spendingControl = entry.moneySpent !== null && entry.moneySpent !== undefined
    ? clamp(10 - (entry.moneySpent / 200) * 10, 0, 10)
    : 5;

  return clamp(
    weightedAverage([
      { value: habitRate * 10, weight: HABIT_WEIGHT },
      { value: incomeSignal, weight: ENTRY_WEIGHT },
      { value: savingsSignal, weight: ENTRY_WEIGHT },
      { value: spendingControl, weight: ENTRY_WEIGHT },
    ])
  );
}

function calcDiscipline(
  entry: DailyEntryInput,
  habitRate: number,
  recentStreak: number,
  projectStats: ProjectStats,
  settings: ScoringSettings
): number {
  const taskRatio = getTaskCompletionRatio(entry);
  const taskScore = clamp(taskRatio * 10, 0, 10);
  const deepWorkScore = ratio(entry.deepWorkHours ?? 0, 4) * 10;
  const screenScore = clamp(10 - (entry.screenTimeHours ?? 0) * 1.7, 0, 10);
  const streakScore = ratio(recentStreak, 14) * 10;
  const overduePenalty = Math.min(projectStats.overdueCount * 0.8, 2.5);

  return clamp(
    weightedAverage([
      { value: habitRate * 10, weight: HABIT_WEIGHT },
      { value: taskScore, weight: ENTRY_WEIGHT },
      { value: deepWorkScore, weight: ENTRY_WEIGHT },
      { value: screenScore, weight: ENTRY_WEIGHT },
      { value: streakScore, weight: ENTRY_WEIGHT },
    ]) - overduePenalty
  );
}

function calcFocus(
  entry: DailyEntryInput,
  habitRate: number,
  projectStats: ProjectStats,
  settings: ScoringSettings
): number {
  const deepWorkScore = ratio(entry.deepWorkHours ?? 0, 5) * 10;
  const taskScore = clamp(getTaskCompletionRatio(entry) * 10, 0, 10);
  const screenScore = clamp(10 - (entry.screenTimeHours ?? 0) * 1.7, 0, 10);
  const overduePenalty = Math.min(projectStats.overdueCount * 0.7, 2);

  return clamp(
    weightedAverage([
      { value: habitRate * 10, weight: HABIT_WEIGHT },
      { value: deepWorkScore, weight: ENTRY_WEIGHT },
      { value: taskScore, weight: ENTRY_WEIGHT },
      { value: screenScore, weight: ENTRY_WEIGHT },
    ]) - overduePenalty
  );
}

function calcMental(
  entry: DailyEntryInput,
  habitRate: number,
  settings: ScoringSettings
): number {
  const sleepScore = clamp(10 - Math.abs((entry.sleepHours ?? 0) - 8) * 1.8, 0, 10);
  const reflectionScore = entry.overallDayRating ? entry.overallDayRating : 5;
  const deepWorkScore = ratio(entry.deepWorkHours ?? 0, 4) * 10;
  const screenBalanceScore = clamp(10 - (entry.screenTimeHours ?? 0) * 1.3, 0, 10);

  return clamp(
    weightedAverage([
      { value: habitRate * 10, weight: HABIT_WEIGHT },
      { value: reflectionScore, weight: ENTRY_WEIGHT },
      { value: sleepScore, weight: ENTRY_WEIGHT },
      { value: deepWorkScore, weight: ENTRY_WEIGHT },
      { value: screenBalanceScore, weight: ENTRY_WEIGHT },
    ])
  );
}

export function calculateOverallScore(scores: Pick<CategoryScores, "physical" | "financial" | "discipline" | "focus" | "mental">): number {
  return clamp(
    (scores.physical + scores.financial + scores.discipline + scores.focus + scores.mental) / 5
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

  const physicalHabitRate = categoryHabitRates?.physical ?? habitCompletionRate;
  const financialHabitRate = categoryHabitRates?.financial ?? habitCompletionRate;
  const disciplineHabitRate = categoryHabitRates?.discipline ?? habitCompletionRate;
  const focusHabitRate = categoryHabitRates?.focus ?? habitCompletionRate;
  const mentalHabitRate = categoryHabitRates?.mental ?? habitCompletionRate;

  const physical = calcPhysical(entry, physicalHabitRate, scoringSettings);
  const financial = calcFinancial(entry, financialHabitRate, scoringSettings);
  const discipline = calcDiscipline(entry, disciplineHabitRate, recentStreak, projectStats, scoringSettings);
  const focus = calcFocus(entry, focusHabitRate, projectStats, scoringSettings);
  const mental = calcMental(entry, mentalHabitRate, scoringSettings);

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
