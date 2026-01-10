/**
 * STATUS VIEW
 *
 * Question: "Is the system healthy right now?"
 *
 * 10-second health check. No scrolling.
 * If it doesn't fit in viewport, cut it.
 */

import { MetricCard } from '../components/MetricCard';
import { RedFlag } from '../components/RedFlag';
import type { SystemHealth } from '../signals';

interface BlockingIssues {
  cashVariance: number;
  notOpened: number;
}

interface StatusViewProps {
  health: SystemHealth;
  lastCloseTotal: number;
  lastCloseDate: string;
  compliance: number;
  exceptions: number;
  blockingIssues: BlockingIssues;
}

export function StatusView({
  health,
  lastCloseTotal,
  lastCloseDate,
  compliance,
  exceptions,
  blockingIssues
}: StatusViewProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const healthSeverity = health === "GREEN" ? "GREEN" : health === "AMBER" ? "AMBER" : "RED";

  return (
    <div className="space-y-6">
      {/* System Health Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xs font-bold tracking-wider text-slate-400">
              SYSTEM STATUS
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Last close: {lastCloseDate ? formatDate(lastCloseDate) : 'No data'}
            </p>
          </div>
          {exceptions > 0 && (
            <RedFlag
              active={true}
              severity={health === "RED" ? "critical" : "warning"}
              message={`${exceptions} exception${exceptions !== 1 ? 's' : ''} require attention`}
            />
          )}
        </div>

        {/* Health Indicator */}
        <div className="flex items-center gap-4 mb-6">
          <div
            className={`h-4 w-4 rounded-full animate-pulse ${
              health === "GREEN"
                ? "bg-emerald-500"
                : health === "AMBER"
                ? "bg-amber-500"
                : "bg-rose-500"
            }`}
          />
          <div>
            <p className={`text-3xl font-bold ${
              health === "GREEN"
                ? "text-emerald-400"
                : health === "AMBER"
                ? "text-amber-400"
                : "text-rose-400"
            }`}>
              SYSTEM {health}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {health === "GREEN" && "All operations normal"}
              {health === "AMBER" && "Warnings present - review required"}
              {health === "RED" && "Critical issues detected"}
            </p>
          </div>
        </div>
      </div>

      {/* Core Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="LAST CLOSE TOTAL"
          value={`${lastCloseTotal.toLocaleString()} CFA`}
          severity="NEUTRAL"
        />
        <MetricCard
          title="OPERATIONAL COMPLIANCE"
          value={`${compliance}%`}
          severity={compliance >= 90 ? "GREEN" : compliance >= 70 ? "AMBER" : "RED"}
        />
        <MetricCard
          title="EXCEPTIONS"
          value={exceptions}
          severity={exceptions === 0 ? "GREEN" : exceptions < 3 ? "AMBER" : "RED"}
          subtitle={exceptions === 0 ? "None" : "Require attention"}
        />
      </div>

      {/* Blocking Issues */}
      {(blockingIssues.cashVariance > 0 || blockingIssues.notOpened > 0) && (
        <div className="bg-rose-950 border border-rose-800 rounded-xl p-6">
          <h3 className="text-xs font-bold tracking-wider text-rose-400 mb-3">
            BLOCKING ISSUES
          </h3>
          <div className="space-y-2">
            {blockingIssues.cashVariance > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-rose-200">Cash Variance Detected</span>
                <span className="text-rose-400 font-bold">
                  {blockingIssues.cashVariance} depot{blockingIssues.cashVariance !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {blockingIssues.notOpened > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-rose-200">Depot Not Opened</span>
                <span className="text-rose-400 font-bold">
                  {blockingIssues.notOpened} depot{blockingIssues.notOpened !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Philosophy Note */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-xs text-slate-400">
          <span className="font-bold text-white">
            This is a 10-second health check.
          </span>{' '}
          Green = operational. Amber = warnings. Red = critical failures.
          For detailed analysis, use Performance, Compliance, or Inventory views.
        </p>
      </div>
    </div>
  );
}
