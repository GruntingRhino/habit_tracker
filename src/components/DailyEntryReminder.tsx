"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getLocalDateKey } from "@/lib/utils";

const REMINDER_HOUR = 21;
const REMINDER_MINUTE = 30;
const REMINDER_ENABLED_KEY = "goodhabits:daily-entry-reminder-enabled";
const REMINDER_LAST_SENT_KEY = "goodhabits:daily-entry-reminder-last-sent";
const SETTINGS_EVENT = "goodhabits:reminder-settings-changed";

function isReminderSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function readReminderEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(REMINDER_ENABLED_KEY) === "true";
}

function isPastReminderTime(date: Date): boolean {
  return (
    date.getHours() > REMINDER_HOUR ||
    (date.getHours() === REMINDER_HOUR && date.getMinutes() >= REMINDER_MINUTE)
  );
}

function getNextReminderDelayMs(now: Date): number {
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(REMINDER_HOUR, REMINDER_MINUTE, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return Math.max(next.getTime() - now.getTime(), 60_000);
}

export default function DailyEntryReminder() {
  const pathname = usePathname();
  const timeoutRef = useRef<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported"
  );

  const syncSettings = useEffectEvent(() => {
    if (!isReminderSupported()) {
      setEnabled(false);
      setPermission("unsupported");
      return;
    }

    setEnabled(readReminderEnabled());
    setPermission(Notification.permission);
  });

  const checkAndNotify = useEffectEvent(async () => {
    if (!isReminderSupported()) return;
    if (!readReminderEnabled()) return;
    if (Notification.permission !== "granted") return;

    const now = new Date();
    if (!isPastReminderTime(now)) return;

    const today = getLocalDateKey(now);
    const lastSent = window.localStorage.getItem(REMINDER_LAST_SENT_KEY);
    if (lastSent === today) return;

    try {
      const response = await fetch("/api/daily-entries", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) return;

      const entries: Array<{ date: string }> = await response.json();
      const hasTodayEntry = entries.some((entry) => entry.date.startsWith(today));

      if (hasTodayEntry) return;

      const notification = new Notification("Daily entry due", {
        body: "You have not filled out today's daily entry yet.",
        tag: `daily-entry-${today}`,
      });

      notification.onclick = () => {
        window.focus();
        if (pathname !== "/entry") {
          window.location.href = "/entry";
        }
      };

      window.localStorage.setItem(REMINDER_LAST_SENT_KEY, today);
    } catch {
      // Ignore transient failures. The next visibility or daily check will retry.
    }
  });

  useEffect(() => {
    syncSettings();
  }, []);

  useEffect(() => {
    if (!isReminderSupported()) return;

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === REMINDER_ENABLED_KEY ||
        event.key === REMINDER_LAST_SENT_KEY
      ) {
        syncSettings();
      }
    };

    const handleSettingsChanged = () => {
      syncSettings();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkAndNotify();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(SETTINGS_EVENT, handleSettingsChanged);
    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SETTINGS_EVENT, handleSettingsChanged);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!enabled || permission !== "granted") return;

    void checkAndNotify();

    const scheduleNextCheck = () => {
      const delayMs = getNextReminderDelayMs(new Date());
      timeoutRef.current = window.setTimeout(async () => {
        await checkAndNotify();
        scheduleNextCheck();
      }, delayMs);
    };

    scheduleNextCheck();

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, permission]);

  return null;
}

export {
  REMINDER_ENABLED_KEY,
  REMINDER_HOUR,
  REMINDER_LAST_SENT_KEY,
  REMINDER_MINUTE,
  SETTINGS_EVENT,
};
