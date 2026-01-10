/**
 * MetricCard Component
 *
 * Purpose: Render single judgment metric
 * NO calculation. Only display.
 */

interface MetricCardProps {
  title: string;
  value: string | number;
  severity?: "GREEN" | "AMBER" | "RED" | "NEUTRAL";
  subtitle?: string;
}

export function MetricCard({ title, value, severity = "NEUTRAL", subtitle }: MetricCardProps) {
  const getSeverityClasses = () => {
    switch (severity) {
      case "GREEN":
        return "bg-emerald-950 border-emerald-800 text-emerald-400";
      case "AMBER":
        return "bg-amber-950 border-amber-800 text-amber-400";
      case "RED":
        return "bg-rose-950 border-rose-800 text-rose-400";
      case "NEUTRAL":
        return "bg-slate-900 border-slate-800 text-white";
    }
  };

  const getValueClasses = () => {
    switch (severity) {
      case "GREEN":
        return "text-emerald-400";
      case "AMBER":
        return "text-amber-400";
      case "RED":
        return "text-rose-400";
      case "NEUTRAL":
        return "text-white";
    }
  };

  return (
    <div className={`rounded-xl border p-6 ${getSeverityClasses()}`}>
      <p className="text-xs font-bold tracking-wider text-slate-400 mb-2">
        {title}
      </p>
      <p className={`text-3xl font-bold ${getValueClasses()}`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-slate-400 mt-2">{subtitle}</p>
      )}
    </div>
  );
}
