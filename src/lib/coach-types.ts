export const WEEKDAY_CODES = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type WeekdayCode = (typeof WEEKDAY_CODES)[number];
export type CoachRole = "user" | "assistant";
export type CoachGoalStatus = "active" | "completed" | "paused";
export type CoachPriority = "low" | "medium" | "high";

export interface CoachGoalSummary {
  id: string;
  title: string;
  description: string | null;
  category: string;
  timeframe: string | null;
  priority: CoachPriority;
  status: CoachGoalStatus;
}

export interface HabitActionPayload {
  name: string;
  description?: string | null;
  category: string;
  targetDays: WeekdayCode[];
  color: string;
}

export interface ProjectActionPayload {
  title: string;
  description?: string | null;
  specs?: string | null;
  priority: CoachPriority;
  deadline?: string | null;
  generateTasks?: boolean;
}

export interface BaseCoachAction {
  id: string;
  label: string;
  reason?: string | null;
  applied?: boolean;
}

export interface AddHabitCoachAction extends BaseCoachAction {
  type: "add_habit";
  habit: HabitActionPayload;
}

export interface AddProjectCoachAction extends BaseCoachAction {
  type: "add_project";
  project: ProjectActionPayload;
}

export type CoachAction = AddHabitCoachAction | AddProjectCoachAction;

export interface CoachChatMessage {
  id: string;
  role: CoachRole;
  content: string;
  createdAt: string;
  actions: CoachAction[];
}

export interface CoachChatPayload {
  messages: CoachChatMessage[];
  goals: CoachGoalSummary[];
}
