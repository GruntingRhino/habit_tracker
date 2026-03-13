import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy");
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d");
}

export function getDayOfWeek(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "EEE").toLowerCase().slice(0, 3);
}

export function getStartOfDay(date: Date | string): Date {
  const d = typeof date === "string" ? parseISO(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function calcStreak(
  logs: { date: Date; completed: boolean }[]
): number {
  if (!logs || logs.length === 0) return 0;

  // Sort descending by date
  const sorted = [...logs].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const today = getStartOfDay(new Date());
  let streak = 0;
  let cursor = today.getTime();

  for (const log of sorted) {
    const logDay = getStartOfDay(log.date).getTime();

    if (logDay === cursor) {
      if (log.completed) {
        streak++;
        cursor -= 86400000; // move back one day
      } else {
        break;
      }
    } else if (logDay < cursor) {
      // gap in dates — streak broken
      break;
    }
    // logDay > cursor means it's in the future; skip
  }

  return streak;
}
