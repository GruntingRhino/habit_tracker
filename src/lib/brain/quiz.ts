/**
 * The personality quiz that seeds the profile. Answers become beliefs directly (no model), at
 * quiz confidence; retaking a question replaces the old answer. Shared by the brain and the app.
 */
import type { CategoryId } from "./categories";

export interface QuizQuestion {
  id: string;
  category: CategoryId;
  question: string;
  options: string[];
  multi?: boolean;
  /** Belief text is `${claim} ${answers}.` */
  claim: string;
}

export const QUIZ: QuizQuestion[] = [
  { id: "big-task", category: "operating-style", question: "When you have a big task, what do you usually do?", options: ["Plan it out first", "Dive in and figure it out", "Wait until the deadline pressure hits", "Break it into small steps"], claim: "With a big task he tends to:" },
  { id: "learn-how", category: "learning", question: "How do you learn best?", options: ["Watching videos", "Reading", "Doing it hands-on", "Someone explaining it to me"], multi: true, claim: "He learns best by:" },
  { id: "learn-stick", category: "learning", question: "When studying, what makes it stick?", options: ["Practice problems", "Flashcards / repetition", "Writing summaries", "Studying with friends"], multi: true, claim: "What makes studying stick for him:" },
  { id: "focus-span", category: "focus", question: "How long can you focus before you need a break?", options: ["About 15 minutes", "About 30 minutes", "About an hour", "2+ hours"], claim: "He can usually focus for:" },
  { id: "distract-what", category: "distractions", question: "What distracts you the most?", options: ["Phone / social media", "Video games", "YouTube / videos", "Texting people"], multi: true, claim: "His biggest distractions:" },
  { id: "distract-block", category: "distractions", question: "What stops you from starting something?", options: ["It feels too big", "Not knowing where to start", "Being tired", "It's boring"], multi: true, claim: "What blocks him from starting:" },
  { id: "energy-peak", category: "energy", question: "When do you have the most energy?", options: ["Early morning", "Late morning", "Afternoon", "Night"], claim: "He has the most energy:" },
  { id: "bedtime", category: "sleep", question: "When do you usually go to bed on school nights?", options: ["Before 10pm", "10–11pm", "11pm–midnight", "After midnight"], claim: "His usual school-night bedtime:" },
  { id: "motivation", category: "motivation", question: "What motivates you most?", options: ["Seeing progress", "Competing and winning", "Making my family proud", "Proving people wrong"], multi: true, claim: "He is motivated most by:" },
  { id: "put-off", category: "procrastination", question: "What do you put off the most?", options: ["Homework / studying", "Chores", "Workouts", "Money stuff"], multi: true, claim: "He puts off:" },
  { id: "stress-what", category: "stress", question: "What stresses you out most?", options: ["School / grades", "Money", "Family stuff", "The future / my goals"], multi: true, claim: "He gets stressed by:" },
  { id: "stress-cope", category: "stress", question: "How do you usually deal with stress?", options: ["Working out", "Games / videos", "Praying", "Talking to someone"], multi: true, claim: "He copes with stress by:" },
  { id: "goals", category: "goals", question: "What are your biggest goals right now?", options: ["Get stronger / fitter", "Better grades", "Make money / build a business", "Build discipline"], multi: true, claim: "His big goals right now:" },
  { id: "interests", category: "interests", question: "What are you into?", options: ["MMA / combat sports", "Gym / lifting", "Tech / coding / AI", "Business / money"], multi: true, claim: "He is into:" },
  { id: "strengths", category: "strengths", question: "What are you good at?", options: ["Working hard", "Learning fast", "Being creative", "Talking to people"], multi: true, claim: "His strengths:" },
  { id: "weaknesses", category: "weaknesses", question: "What do you struggle with most?", options: ["Staying consistent", "Managing time", "Focus", "Sleep / eating well"], multi: true, claim: "He struggles with:" },
  { id: "food", category: "food", question: "How do you eat most days?", options: ["Home-cooked meals", "Fast food a lot", "Focused on protein", "Whatever's around"], claim: "Most days he eats:" },
  { id: "training", category: "training", question: "What training do you enjoy?", options: ["Weightlifting", "MMA / boxing", "Running / cardio", "Team sports"], multi: true, claim: "He enjoys training:" },
  { id: "faith", category: "faith", question: "How big a part of your day is faith?", options: ["Central to everything", "Important, most days", "Sometimes", "Not much right now"], claim: "Faith in his day:" },
  { id: "money", category: "money", question: "With money, you usually…", options: ["Save most of it", "Spend it on things I want", "Try to invest / grow it", "Don't have much yet"], claim: "With money he usually:" },
  { id: "recharge", category: "social", question: "How do you recharge?", options: ["Being alone", "With a few close friends", "Big groups", "With family"], claim: "He recharges:" },
  { id: "tone", category: "communication", question: "How should the app talk to you?", options: ["Blunt and direct", "Encouraging", "Just the facts", "Funny / casual"], claim: "He wants to be talked to:" },
  { id: "what-works", category: "what-works", question: "What has actually helped you stick to things?", options: ["Streaks / tracking", "Someone holding me accountable", "Scheduled time blocks", "Deadlines"], multi: true, claim: "What has helped him stick to things:" },
  { id: "personality", category: "personality", question: "Which of these fit you?", options: ["Introvert", "Extrovert", "Competitive", "Organized"], multi: true, claim: "He describes himself as:" },
];

export type QuizAnswers = Record<string, string | string[]>;

/** The belief a quiz answer becomes. Free-text ("Other") answers are kept verbatim, trimmed. */
export function quizClaim(q: QuizQuestion, answer: string | string[]) {
  const list = (Array.isArray(answer) ? answer : [answer]).map((a) => a.replace(/\s+/g, " ").trim().slice(0, 120)).filter(Boolean);
  if (!list.length) return null;
  // "Watching videos" → "watching videos", but "MMA", "YouTube" and "I" stay as they are.
  const lower = (a: string) => (/^[A-Z][a-z]*\b/.test(a) && !/^I\b/.test(a) && !/^[A-Z][a-z]*[A-Z]/.test(a) ? a.charAt(0).toLowerCase() + a.slice(1) : a);
  return `${q.claim} ${list.map(lower).join(", ")}.`.replace(/\.\.$/, ".");
}
