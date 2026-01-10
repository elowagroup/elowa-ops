/**
 * Trust Score Signal
 *
 * Philosophy:
 * - Permanent accountability metric (0-100)
 * - Never resets
 * - Never explains itself (unless clicked)
 * - Becomes permanent operator record
 * - Eventually: operator credit score
 *
 * Penalties:
 * - Late open (open_time > 08:00): -5 points
 * - Missed close (!closed): -10 points
 * - Cash variance day (variance > 5%): -25 points
 * - Inactive day: -1 point
 */

export interface TrustScoreInput {
  lateOpens: number;      // Count of late opens (last 30 days)
  missedCloses: number;   // Count of missed closes (last 30 days)
  varianceDays: number;   // Count of variance days (last 30 days)
  inactiveDays: number;   // Count of inactive days (last 30 days)
}

export function computeTrustScore(input: TrustScoreInput): number {
  const { lateOpens, missedCloses, varianceDays, inactiveDays } = input;

  // Start at 100 (perfect)
  let score = 100;

  // Apply penalties
  score -= lateOpens * 5;
  score -= missedCloses * 10;
  score -= varianceDays * 25;
  score -= inactiveDays * 1;

  // Clamp to 0-100 range
  return Math.max(0, Math.min(100, score));
}

/**
 * Helper: Get trust severity for styling/actions
 */
export function getTrustSeverity(score: number): "critical" | "warning" | "good" {
  if (score < 50) return "critical";
  if (score < 80) return "warning";
  return "good";
}

/**
 * Helper: Get trust label
 */
export function getTrustLabel(score: number): string {
  if (score < 50) return "CRITICAL";
  if (score < 80) return "WARNING";
  return "GOOD";
}

/**
 * Helper: Should block operations?
 * (Future implementation - Phase 6)
 */
export function shouldBlockOperations(score: number): boolean {
  return score < 30;
}

/**
 * Helper: Should require override?
 * (Future implementation - Phase 6)
 */
export function shouldRequireOverride(score: number): boolean {
  return score >= 30 && score < 50;
}

/**
 * Helper: Get penalty breakdown
 */
export function getPenaltyBreakdown(input: TrustScoreInput): {
  lateOpenPenalty: number;
  missedClosePenalty: number;
  variancePenalty: number;
  inactivityPenalty: number;
  totalPenalty: number;
} {
  const lateOpenPenalty = input.lateOpens * 5;
  const missedClosePenalty = input.missedCloses * 10;
  const variancePenalty = input.varianceDays * 25;
  const inactivityPenalty = input.inactiveDays * 1;

  return {
    lateOpenPenalty,
    missedClosePenalty,
    variancePenalty,
    inactivityPenalty,
    totalPenalty: lateOpenPenalty + missedClosePenalty + variancePenalty + inactivityPenalty,
  };
}
