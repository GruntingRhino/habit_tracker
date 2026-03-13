import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";

interface ScoreCardProps {
  title: string;
  score: number;
  trend: "up" | "down" | "stable";
  icon: LucideIcon;
  subtitle?: string;
}

function getScoreColor(score: number): string {
  if (score > 7) return "text-green-400";
  if (score >= 5) return "text-yellow-400";
  return "text-red-400";
}

function getScoreBgColor(score: number): string {
  if (score > 7) return "#22c55e";
  if (score >= 5) return "#f59e0b";
  return "#ef4444";
}

function getScoreRingColor(score: number): string {
  if (score > 7) return "stroke-green-400";
  if (score >= 5) return "stroke-yellow-400";
  return "stroke-red-400";
}

export default function ScoreCard({
  title,
  score,
  trend,
  icon: Icon,
  subtitle,
}: ScoreCardProps) {
  const circumference = 2 * Math.PI * 20;
  const progress = (score / 10) * circumference;
  const colorClass = getScoreColor(score);
  const ringColorClass = getScoreRingColor(score);

  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-green-400"
      : trend === "down"
      ? "text-red-400"
      : "text-slate-400";

  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1e293b] flex items-center justify-center">
            <Icon className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
              {title}
            </p>
            {subtitle && (
              <p className="text-slate-500 text-xs">{subtitle}</p>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span className="capitalize">{trend}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Circular progress */}
        <div className="relative w-14 h-14 flex-shrink-0">
          <svg
            className="w-14 h-14 -rotate-90"
            viewBox="0 0 48 48"
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="#1e293b"
              strokeWidth="4"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              className={ringColorClass}
              strokeWidth="4"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={`${circumference - progress}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-sm font-bold ${colorClass}`}>
              {score.toFixed(1)}
            </span>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-end gap-1 mb-1">
            <span className={`text-3xl font-bold ${colorClass}`}>
              {score.toFixed(1)}
            </span>
            <span className="text-slate-500 text-sm mb-1">/10</span>
          </div>
          {/* Bar progress */}
          <div className="w-full h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(score / 10) * 100}%`,
                backgroundColor: getScoreBgColor(score),
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
