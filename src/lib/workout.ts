export const WORKOUT_INTENSITIES = ["light", "moderate", "hard"] as const;

export type WorkoutIntensity = (typeof WORKOUT_INTENSITIES)[number];

export type WorkoutKind =
  | "strength"
  | "cardio"
  | "sport"
  | "conditioning"
  | "mobility"
  | "recovery"
  | "unknown";

export interface WorkoutAssessmentInput {
  workoutCompleted?: boolean | null;
  workoutRoutineName?: string | null;
  workoutDurationMinutes?: number | null;
  workoutIntensity?: string | null;
  workoutDetails?: string | null;
}

export interface WorkoutAssessment {
  performed: boolean;
  countsAsWorkout: boolean;
  kind: WorkoutKind;
  durationMinutes: number;
  effectiveTrainingMinutes: number;
  intensity: WorkoutIntensity | null;
  qualityPoints: number;
  summary: string;
  strictnessNote: string;
}

const KIND_KEYWORDS: Record<Exclude<WorkoutKind, "unknown">, readonly string[]> = {
  strength: [
    "strength",
    "weights",
    "weightlifting",
    "lift",
    "lifting",
    "gym",
    "barbell",
    "dumbbell",
    "kettlebell",
    "bench",
    "deadlift",
    "squat",
    "press",
    "row",
    "pull up",
    "pullup",
    "push up",
    "pushup",
    "calisthenics",
    "leg day",
    "push day",
    "pull day",
    "upper body",
    "lower body",
    "full body",
    "hypertrophy",
    "compound",
    "resistance",
  ],
  cardio: [
    "run",
    "running",
    "jog",
    "sprint",
    "bike",
    "cycling",
    "cycle",
    "spin",
    "swim",
    "rowing",
    "rower",
    "erg",
    "elliptical",
    "stair climber",
    "hike",
    "jump rope",
    "ruck",
    "treadmill",
    "zone 2",
  ],
  sport: [
    "basketball",
    "soccer",
    "football",
    "tennis",
    "pickleball",
    "volleyball",
    "mma",
    "boxing",
    "kickboxing",
    "bjj",
    "jiu jitsu",
    "wrestling",
    "muay thai",
    "sparring",
    "practice",
    "scrimmage",
  ],
  conditioning: [
    "hiit",
    "circuit",
    "conditioning",
    "interval",
    "crossfit",
    "bootcamp",
    "sled",
    "battle rope",
    "metcon",
  ],
  mobility: [
    "walk",
    "walking",
    "mobility",
    "stretch",
    "stretching",
    "yoga",
    "pilates",
    "easy ride",
    "light jog",
  ],
  recovery: [
    "recovery",
    "foam roll",
    "foam rolling",
    "sauna",
    "steam room",
    "rehab",
    "physical therapy",
    "pt session",
  ],
};

const NON_EXERCISE_KEYWORDS = [
  "cleaning",
  "housework",
  "chores",
  "yard work",
  "work shift",
  "standing at work",
  "retail shift",
  "warehouse",
  "construction",
  "errands",
];

function clamp(value: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

export function normalizeWorkoutIntensity(
  value?: string | null
): WorkoutIntensity | null {
  return WORKOUT_INTENSITIES.includes(value as WorkoutIntensity)
    ? (value as WorkoutIntensity)
    : null;
}

function countKeywordMatches(text: string, keywords: readonly string[]): number {
  return keywords.reduce(
    (count, keyword) => count + (text.includes(keyword) ? 1 : 0),
    0
  );
}

function detectWorkoutKind(text: string): WorkoutKind {
  if (!text) return "unknown";

  const hasNonExerciseOnly =
    NON_EXERCISE_KEYWORDS.some((keyword) => text.includes(keyword)) &&
    !Object.values(KIND_KEYWORDS).some((keywords) =>
      keywords.some((keyword) => text.includes(keyword))
    );

  if (hasNonExerciseOnly) return "unknown";

  let bestKind: WorkoutKind = "unknown";
  let bestScore = 0;

  for (const [kind, keywords] of Object.entries(KIND_KEYWORDS) as Array<
    [Exclude<WorkoutKind, "unknown">, readonly string[]]
  >) {
    const score = countKeywordMatches(text, keywords);
    if (score > bestScore) {
      bestKind = kind;
      bestScore = score;
    }
  }

  return bestKind;
}

function durationMultiplier(minutes: number): number {
  if (minutes < 10) return 0;
  if (minutes < 20) return 0.35;
  if (minutes < 30) return 0.55;
  if (minutes < 45) return 0.75;
  if (minutes < 60) return 0.9;
  return 1;
}

function intensityMultiplier(intensity: WorkoutIntensity | null): number {
  switch (intensity) {
    case "hard":
      return 1;
    case "moderate":
      return 0.85;
    case "light":
      return 0.6;
    default:
      return 0.7;
  }
}

function kindQualityMultiplier(kind: WorkoutKind): number {
  switch (kind) {
    case "strength":
    case "cardio":
    case "sport":
      return 1;
    case "conditioning":
      return 0.9;
    case "mobility":
      return 0.55;
    case "recovery":
      return 0.35;
    default:
      return 0.45;
  }
}

function kindLoadMultiplier(kind: WorkoutKind): number {
  switch (kind) {
    case "strength":
    case "cardio":
    case "sport":
      return 1;
    case "conditioning":
      return 0.9;
    case "mobility":
      return 0.5;
    case "recovery":
      return 0.25;
    default:
      return 0.4;
  }
}

function buildSummary(
  kind: WorkoutKind,
  qualityPoints: number,
  durationMinutes: number,
  intensity: WorkoutIntensity | null
): string {
  if (qualityPoints <= 0) {
    return "No meaningful workout credit.";
  }

  const kindLabel =
    kind === "unknown"
      ? "unclassified training"
      : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;

  return `${kindLabel}, ${durationMinutes} min${
    intensity ? `, ${intensity}` : ""
  } effort, ${qualityPoints.toFixed(1)}/3 workout credit.`;
}

function buildStrictnessNote(
  kind: WorkoutKind,
  qualityPoints: number,
  durationMinutes: number
): string {
  if (durationMinutes < 10) {
    return "Under 10 minutes gets no meaningful workout credit.";
  }
  if (kind === "unknown") {
    return "The description did not clearly show structured exercise, so credit is capped.";
  }
  if (kind === "mobility") {
    return "Mobility and light movement count, but they do not earn full workout credit.";
  }
  if (kind === "recovery") {
    return "Recovery work helps, but it is graded far below real training.";
  }
  if (qualityPoints < 2.5) {
    return "Full workout credit requires real structure plus enough duration and effort.";
  }

  return "This counts as real training. Maximum physical points still require total training volume.";
}

export function assessWorkout(
  input: WorkoutAssessmentInput
): WorkoutAssessment {
  const workoutName = normalizeText(input.workoutRoutineName);
  const workoutDetails = normalizeText(input.workoutDetails);
  const combinedText = `${workoutName} ${workoutDetails}`.trim();
  const durationMinutes = Math.max(
    0,
    Math.round(input.workoutDurationMinutes ?? 0)
  );
  const intensity = normalizeWorkoutIntensity(input.workoutIntensity);
  const performed =
    Boolean(input.workoutCompleted) ||
    Boolean(workoutName) ||
    Boolean(workoutDetails) ||
    durationMinutes > 0;

  if (!performed) {
    return {
      performed: false,
      countsAsWorkout: false,
      kind: "unknown",
      durationMinutes: 0,
      effectiveTrainingMinutes: 0,
      intensity: null,
      qualityPoints: 0,
      summary: "No workout logged.",
      strictnessNote: "No training means no workout credit.",
    };
  }

  const kind = detectWorkoutKind(combinedText);
  const rawQuality =
    3 *
    durationMultiplier(durationMinutes) *
    intensityMultiplier(intensity) *
    kindQualityMultiplier(kind);

  let qualityPoints = clamp(rawQuality, 0, 3);

  if (!combinedText) {
    qualityPoints = 0;
  } else if (kind === "unknown") {
    qualityPoints = Math.min(qualityPoints, 1.5);
  }

  const effectiveTrainingMinutes = Math.max(
    0,
    Math.round(
      durationMinutes *
        intensityMultiplier(intensity) *
        kindLoadMultiplier(kind)
    )
  );

  qualityPoints = round1(qualityPoints);

  return {
    performed: true,
    countsAsWorkout: qualityPoints >= 0.5,
    kind,
    durationMinutes,
    effectiveTrainingMinutes,
    intensity,
    qualityPoints,
    summary: buildSummary(kind, qualityPoints, durationMinutes, intensity),
    strictnessNote: buildStrictnessNote(kind, qualityPoints, durationMinutes),
  };
}

export function calcTrainingLoadPoints(effectiveMinutes: number): number {
  if (effectiveMinutes >= 90) return 3;
  if (effectiveMinutes >= 60) return 2.25;
  if (effectiveMinutes >= 45) return 1.75;
  if (effectiveMinutes >= 30) return 1.25;
  if (effectiveMinutes >= 15) return 0.5;
  return 0;
}
