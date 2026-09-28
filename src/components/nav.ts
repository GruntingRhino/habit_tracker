import {
  BookOpen,
  Dumbbell,
  FolderKanban,
  ListTodo,
  MessageSquare,
  Repeat,
  Settings,
  StickyNote,
  Sun,
  UtensilsCrossed,
} from "lucide-react";

export const NAV = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/todos", label: "To-dos", icon: ListTodo },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/habits", label: "Routines", icon: Repeat },
  { href: "/meals", label: "Meals", icon: UtensilsCrossed },
  { href: "/weights", label: "Workouts", icon: Dumbbell },
  { href: "/entry", label: "Journal", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/** First four go in the phone tab bar; the rest live under "More". */
export const MOBILE_TABS = NAV.slice(0, 4);
export const MOBILE_MORE = NAV.slice(4);

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
