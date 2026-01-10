/**
 * Compliance Metrics Signal
 *
 * Binary language only:
 * - CLEAN / NOT_CLEAN
 * - On time / Late
 * - Balanced / Review
 *
 * This is behavior, not performance.
 */

export type ComplianceStatus = "CLEAN" | "NOT_CLEAN";

export interface DepotCompliance {
  depotId: string;
  status: ComplianceStatus;
  consecutiveCleanDays: number;
  lastVarianceDate: string | null;
  lateOpenCount: number;      // Last 14 days
  missedDayCount: number;     // Last 14 days
  trustScore: number;
}

export interface ComplianceEventInput {
  date: string;
  openedLate: boolean;
  closed: boolean;
  hasVariance: boolean;
}

export interface ComplianceInput {
  depotId: string;
  events: ComplianceEventInput[];
}

export function computeDepotCompliance(
  input: ComplianceInput,
  trustScore: number
): DepotCompliance {
  // Sort events descending (most recent first)
  const sorted = [...input.events].sort((a, b) => b.date.localeCompare(a.date));

  let consecutiveCleanDays = 0;
  let lastVarianceDate: string | null = null;
  let lateOpenCount = 0;
  let missedDayCount = 0;

  // Scan last 14 days
  const last14 = sorted.slice(0, 14);

  for (const event of last14) {
    // Count violations
    if (event.openedLate) lateOpenCount++;
    if (!event.closed) missedDayCount++;

    // Track last variance
    if (event.hasVariance && !lastVarianceDate) {
      lastVarianceDate = event.date;
    }
  }

  // Calculate clean streak from most recent
  for (const event of sorted) {
    const isClean = !event.openedLate && event.closed && !event.hasVariance;

    if (!isClean) {
      break; // Streak broken
    }

    consecutiveCleanDays++;
  }

  // Status: CLEAN if 7+ consecutive clean days
  const status: ComplianceStatus = consecutiveCleanDays >= 7 ? "CLEAN" : "NOT_CLEAN";

  return {
    depotId: input.depotId,
    status,
    consecutiveCleanDays,
    lastVarianceDate,
    lateOpenCount,
    missedDayCount,
    trustScore,
  };
}

/**
 * System-wide compliance rate
 */
export function computeSystemCompliance(
  expectedEvents: number,
  validEvents: number
): number {
  return expectedEvents > 0
    ? Math.round((validEvents / expectedEvents) * 100)
    : 0;
}

/**
 * Helper: Get compliance badge color
 */
export function getComplianceSeverity(status: ComplianceStatus): "success" | "critical" {
  return status === "CLEAN" ? "success" : "critical";
}

/**
 * Helper: Should show red flag?
 */
export function shouldShowRedFlag(compliance: DepotCompliance): boolean {
  return (
    compliance.status === "NOT_CLEAN" ||
    compliance.lateOpenCount > 0 ||
    compliance.missedDayCount > 0 ||
    compliance.lastVarianceDate !== null
  );
}
