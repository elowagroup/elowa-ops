/**
 * TrustScoreBadge Component
 *
 * Purpose: Visual punishment/reward for trust scores
 * Shows score with optional progress bar
 */

interface TrustScoreBadgeProps {
  score: number; // 0-100
  showBar?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function TrustScoreBadge({ score, showBar = true, size = 'md' }: TrustScoreBadgeProps) {
  const getSeverityClasses = () => {
    if (score < 50) {
      return {
        bg: "bg-rose-950",
        border: "border-rose-800",
        text: "text-rose-400",
        bar: "bg-rose-600",
        label: "CRITICAL",
      };
    }
    if (score < 80) {
      return {
        bg: "bg-amber-950",
        border: "border-amber-800",
        text: "text-amber-400",
        bar: "bg-amber-600",
        label: "WARNING",
      };
    }
    return {
      bg: "bg-emerald-950",
      border: "border-emerald-800",
      text: "text-emerald-400",
      bar: "bg-emerald-600",
      label: "GOOD",
    };
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return "text-sm p-2";
      case 'md':
        return "text-base p-3";
      case 'lg':
        return "text-lg p-4";
    }
  };

  const classes = getSeverityClasses();

  return (
    <div className={`rounded-lg border ${classes.bg} ${classes.border} ${getSizeClasses()}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`font-bold ${classes.text}`}>{score}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">
            {classes.label}
          </p>
        </div>
        {showBar && (
          <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full ${classes.bar} transition-all duration-300`}
              style={{ width: `${score}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
