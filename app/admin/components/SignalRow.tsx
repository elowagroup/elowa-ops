/**
 * SignalRow Component
 *
 * Displays a single inventory signal.
 * Focus: Cash impact, not unit counts.
 */

interface SignalRowProps {
  rank: number;
  skuLabel: string;
  unitsDelta: number;
  cashImpact: number;
  surpriseIndex: number;
  onDrill?: () => void;
}

export function SignalRow({
  rank,
  skuLabel,
  unitsDelta,
  cashImpact,
  surpriseIndex,
  onDrill
}: SignalRowProps) {
  const isHighSurprise = surpriseIndex > 0.5; // 50% deviation = surprising

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-emerald-600 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Rank and SKU */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-lg font-bold text-emerald-400">
              #{rank}
            </span>
            <h3 className="text-sm font-bold text-white">
              {skuLabel}
            </h3>
            {isHighSurprise && (
              <span className="text-[10px] font-bold px-2 py-1 bg-amber-950 text-amber-400 border border-amber-800 rounded">
                ANOMALY
              </span>
            )}
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-slate-400">Units Delta</p>
              <p className="text-white font-bold">{Math.abs(unitsDelta)}</p>
            </div>
            <div>
              <p className="text-slate-400">Cash Impact</p>
              <p className="text-emerald-400 font-bold">
                {cashImpact.toLocaleString()} CFA
              </p>
            </div>
          </div>
        </div>

        {/* Drill action */}
        {onDrill && (
          <button
            onClick={onDrill}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-bold ml-4"
          >
            DRILL →
          </button>
        )}
      </div>
    </div>
  );
}
