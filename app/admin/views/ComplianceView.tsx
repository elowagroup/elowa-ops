/**
 * COMPLIANCE VIEW
 *
 * Question: "Who is following the rules?"
 *
 * Enforcement view. Pressure, not reporting.
 * NO sales numbers here. This is behavior.
 */

import { TrustScoreBadge } from '../components/TrustScoreBadge';
import { EventBadge } from '../components/StatusBadge';
import { RedFlag } from '../components/RedFlag';
import type { DepotCompliance } from '../signals';

interface ComplianceViewProps {
  depots: DepotCompliance[];
}

export function ComplianceView({ depots }: ComplianceViewProps) {
  return (
    <div className="space-y-6">
      {/* Compliance Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xs font-bold tracking-wider text-slate-400">
            OPERATIONAL DISCIPLINE
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Last 14 days • Binary enforcement
          </p>
        </div>

        <table className="w-full">
          <thead className="bg-slate-800">
            <tr>
              <th className="text-left px-6 py-3 text-[10px] font-bold tracking-wider text-slate-400">
                DEPOT
              </th>
              <th className="text-left px-6 py-3 text-[10px] font-bold tracking-wider text-slate-400">
                TRUST SCORE
              </th>
              <th className="text-center px-6 py-3 text-[10px] font-bold tracking-wider text-slate-400">
                CLEAN STREAK
              </th>
              <th className="text-center px-6 py-3 text-[10px] font-bold tracking-wider text-slate-400">
                LATE OPENS
              </th>
              <th className="text-center px-6 py-3 text-[10px] font-bold tracking-wider text-slate-400">
                MISSED DAYS
              </th>
              <th className="text-left px-6 py-3 text-[10px] font-bold tracking-wider text-slate-400">
                LAST VARIANCE
              </th>
              <th className="text-center px-6 py-3 text-[10px] font-bold tracking-wider text-slate-400">
                STATUS
              </th>
              <th className="text-center px-6 py-3 text-[10px] font-bold tracking-wider text-slate-400">
                FLAGS
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {depots.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-6 text-sm text-slate-400 text-center">
                  No compliance data available
                </td>
              </tr>
            ) : (
              depots.map((depot) => {
                const isClean = depot.status === "CLEAN";
                const hasViolations = depot.lateOpenCount > 0 || depot.missedDayCount > 0 || depot.lastVarianceDate !== null;

                return (
                  <tr
                    key={depot.depotId}
                    className="hover:bg-slate-800 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-white">
                        {depot.depotId}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <TrustScoreBadge score={depot.trustScore} size="md" />
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span className="text-lg font-bold text-white">
                        {depot.consecutiveCleanDays}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">days</span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span
                        className={`text-sm font-bold ${
                          depot.lateOpenCount === 0
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {depot.lateOpenCount}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span
                        className={`text-sm font-bold ${
                          depot.missedDayCount === 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {depot.missedDayCount}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-400">
                        {depot.lastVarianceDate || 'None'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <EventBadge type={depot.status} />
                    </td>

                    <td className="px-6 py-4 text-center">
                      <RedFlag
                        active={hasViolations}
                        severity={depot.missedDayCount > 0 ? "critical" : "warning"}
                        message={`${depot.lateOpenCount} late opens, ${depot.missedDayCount} missed days${depot.lastVarianceDate ? `, variance on ${depot.lastVarianceDate}` : ''}`}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Enforcement Rules */}
      <div className="bg-slate-900 border border-amber-800 rounded-xl p-6">
        <h3 className="text-xs font-bold tracking-wider text-amber-400 mb-3">
          ENFORCEMENT RULES
        </h3>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div>
            <p className="text-slate-400 mb-1">Late Open</p>
            <p className="text-white font-mono text-[10px]">
              open_time &gt; 08:00
            </p>
            <p className="text-rose-400 text-[10px] mt-1 font-bold">
              -5 points
            </p>
          </div>
          <div>
            <p className="text-slate-400 mb-1">Missed Day</p>
            <p className="text-white font-mono text-[10px]">
              !open OR !close
            </p>
            <p className="text-rose-400 text-[10px] mt-1 font-bold">
              -10 points
            </p>
          </div>
          <div>
            <p className="text-slate-400 mb-1">Cash Variance</p>
            <p className="text-white font-mono text-[10px]">
              variance &gt; 5%
            </p>
            <p className="text-rose-400 text-[10px] mt-1 font-bold">
              -25 points
            </p>
          </div>
        </div>
      </div>

      {/* Philosophy */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-xs text-slate-400">
          <span className="font-bold text-white">
            This is behavior, not performance.
          </span>{' '}
          No sales numbers. Binary language only (CLEAN/NOT_CLEAN). Trust scores
          are permanent records. People optimize what humiliates them.
        </p>
      </div>
    </div>
  );
}
