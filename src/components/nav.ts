import { BookOpen, ListTodo, MessageSquare, Repeat, Settings, UtensilsCrossed } from "lucide-react";

export const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/todos", label: "Tasks", icon: ListTodo },
  { href: "/habits", label: "Habits", icon: Repeat },
  { href: "/meals", label: "Food", icon: UtensilsCrossed },
  { href: "/entry", label: "Journal", icon: BookOpen },
] as const;

export const SETTINGS = { href: "/settings", label: "Settings", icon: Settings } as const;

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
