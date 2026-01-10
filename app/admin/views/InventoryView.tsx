/**
 * INVENTORY VIEW
 *
 * Question: "What should we act on?"
 *
 * Decision support, not stock clerking.
 * Top 5 SKUs only by cash impact.
 * Counts are for clerks. Signals are for builders.
 */

import { SignalRow } from '../components/SignalRow';
import { calculateCashDominance, type InventorySignal } from '../signals';

interface InventoryViewProps {
  signals: InventorySignal[];
  totalCashFlow: number;
}

export function InventoryView({ signals, totalCashFlow }: InventoryViewProps) {
  return (
    <div className="space-y-6">
      {/* Top Signals */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xs font-bold tracking-wider text-slate-400 mb-4">
          TOP INVENTORY SIGNALS
        </h2>
        <p className="text-xs text-slate-500 mb-6">
          Ranked by cash impact • Last close only • Top 5 maximum
        </p>

        <div className="space-y-3">
          {signals.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              No inventory changes detected in last close.
            </p>
          ) : (
            signals.map((signal, idx) => {
              const cashDominance = calculateCashDominance(signal.cashImpact, totalCashFlow);

              return (
                <div key={signal.sku} className="space-y-2">
                  <SignalRow
                    rank={idx + 1}
                    skuLabel={signal.skuLabel}
                    unitsDelta={signal.unitsDelta}
                    cashImpact={signal.cashImpact}
                    surpriseIndex={signal.surpriseIndex}
                  />

                  {/* Cash Dominance (if significant) */}
                  {cashDominance > 10 && (
                    <div className="ml-12 text-xs text-amber-400">
                      <span className="font-bold">{cashDominance.toFixed(1)}%</span> of total cash flow
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {signals.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Total Cash Impact</p>
            <p className="text-2xl font-bold text-white">
              {signals.reduce((sum, s) => sum + s.cashImpact, 0).toLocaleString()} CFA
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">SKUs Tracked</p>
            <p className="text-2xl font-bold text-white">
              {signals.length}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Anomalies Detected</p>
            <p className="text-2xl font-bold text-white">
              {signals.filter(s => s.surpriseIndex > 0.5).length}
            </p>
          </div>
        </div>
      )}

      {/* Methodology Note */}
      <div className="bg-amber-950 border border-amber-800 rounded-xl p-4">
        <p className="text-xs text-amber-400 font-bold mb-2">METHODOLOGY</p>
        <p className="text-xs text-amber-200">
          SKU signals ranked by estimated cash impact (units × price). Velocity comparison
          requires 7+ days of history. Surprise index &gt; 0.5 indicates significant anomaly.
          Raw restock counts hidden by default — executives don't care that oil went 9→20,
          they care that oil dominates cash flow.
        </p>
      </div>

      {/* Philosophy */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-xs text-slate-400">
          <span className="font-bold text-white">
            Counts are for clerks. Signals are for builders.
          </span>{' '}
          This view shows what matters: cash impact, velocity anomalies, and
          dominance skew. If a SKU moves without cash impact, it's noise.
        </p>
      </div>
    </div>
  );
}
