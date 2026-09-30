import { Briefcase, CalendarDays, Home, MessageSquare, Settings, UtensilsCrossed } from "lucide-react";

/** Home is the landing page; the dropdown goes everywhere else. */
export const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/chat", label: "Chat & Journal", icon: MessageSquare },
  { href: "/meals", label: "Food", icon: UtensilsCrossed },
  { href: "/work", label: "Work", icon: Briefcase },
] as const;

export const SETTINGS = { href: "/settings", label: "Settings", icon: Settings } as const;

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
