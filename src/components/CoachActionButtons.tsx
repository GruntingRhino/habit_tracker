"use client";

import { CheckCircle2, FolderPlus, Loader2, PlusCircle } from "lucide-react";
import type { CoachAction } from "@/lib/coach-types";

interface CoachActionButtonsProps {
  actions: CoachAction[];
  onApply: (action: CoachAction) => Promise<void>;
  pendingActionIds: Set<string>;
  variant?: "floating" | "panel";
}

export default function CoachActionButtons({
  actions,
  onApply,
  pendingActionIds,
  variant = "floating",
}: CoachActionButtonsProps) {
  if (actions.length === 0) return null;

  const isFloating = variant === "floating";

  return (
    <div className={`mt-3 flex flex-col gap-2 ${isFloating ? "" : "max-w-sm"}`}>
      {actions.map((action) => {
        const pending = pendingActionIds.has(action.id);
        const applied = action.applied;
        const disabled = pending || applied;
        const isHabit = action.type === "add_habit";
        const Icon = applied ? CheckCircle2 : isHabit ? PlusCircle : FolderPlus;
        const label = applied
          ? isHabit ? "Added to habits" : "Added to projects"
          : action.label;

        return (
          <div key={action.id} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => void onApply(action)}
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all self-start"
              style={
                applied
                  ? {
                      background: "rgba(16,185,129,0.1)",
                      border: "1px solid rgba(16,185,129,0.25)",
                      color: "#10b981",
                      cursor: "default",
                    }
                  : disabled
                  ? {
                      background: "rgba(79,114,255,0.08)",
                      border: "1px solid rgba(79,114,255,0.2)",
                      color: "#7a9eff",
                      opacity: 0.7,
                    }
                  : {
                      background: "linear-gradient(135deg, #4f72ff 0%, #3d5ee6 100%)",
                      border: "1px solid rgba(79,114,255,0.4)",
                      color: "#fff",
                      boxShadow: "0 2px 12px rgba(79,114,255,0.3)",
                    }
              }
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
              ) : (
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              )}
              <span>{pending ? "Adding..." : label}</span>
            </button>
            {action.reason && !applied && (
              <p className={`${isFloating ? "text-[10px]" : "text-xs"} leading-relaxed pl-1`} style={{ color: "#4a6a90" }}>
                {action.reason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
