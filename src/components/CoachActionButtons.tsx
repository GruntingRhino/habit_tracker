"use client";

import { FolderPlus, Loader2, PlusCircle } from "lucide-react";
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

  const baseStyles =
    variant === "floating"
      ? {
          container: "mt-3 flex flex-wrap gap-2",
          reason: "mt-2 text-[11px] leading-relaxed text-slate-400",
          button:
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
        }
      : {
          container: "mt-3 flex flex-wrap gap-2",
          reason: "mt-2 text-xs leading-relaxed text-slate-400",
          button:
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
        };

  return (
    <div className={baseStyles.container}>
      {actions.map((action) => {
        const pending = pendingActionIds.has(action.id);
        const disabled = pending || action.applied;
        const Icon = action.type === "add_habit" ? PlusCircle : FolderPlus;
        const label = action.applied
          ? action.type === "add_habit"
            ? "Habit Added"
            : "Project Added"
          : action.label;

        return (
          <div key={action.id}>
            <button
              type="button"
              onClick={() => void onApply(action)}
              disabled={disabled}
              className={baseStyles.button}
              style={
                disabled
                  ? {
                      background: "rgba(16,185,129,0.12)",
                      border: "1px solid rgba(16,185,129,0.2)",
                      color: "#10b981",
                    }
                  : {
                      background: "linear-gradient(135deg, #4f72ff 0%, #3d5ee6 100%)",
                      color: "#fff",
                      boxShadow: "0 0 16px rgba(79,114,255,0.24)",
                    }
              }
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
              <span>{label}</span>
            </button>
            {action.reason && <p className={baseStyles.reason}>{action.reason}</p>}
          </div>
        );
      })}
    </div>
  );
}
