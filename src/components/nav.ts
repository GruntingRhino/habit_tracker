import {
  BookOpen,
  Dumbbell,
  FolderKanban,
  ListTodo,
  MessageSquare,
  Repeat,
  Settings,
  StickyNote,
  UtensilsCrossed,
} from "lucide-react";

export const NAV = [
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

/** Phone tab bar is just Chat + More; everything else lives under More. */
export const MOBILE_TABS = NAV.slice(0, 1);
export const MOBILE_MORE = NAV.slice(1);

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
