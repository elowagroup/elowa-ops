/**
 * System Health Signal
 *
 * Philosophy:
 * - Reduces entire operational status to single judgment: GREEN/AMBER/RED
 * - GREEN = All clean
 * - AMBER = Closed with issues OR missed opens
 * - RED = Cash variance OR missing closes
 *
 * This is the 10-second health check.
 */

export type SystemHealth = "GREEN" | "AMBER" | "RED";

export interface SystemHealthInput {
  expectedDepots: number;
  closedDepots: number;
  cashVarianceCount: number;
  missedOpens: number;
}

export function computeSystemHealth(input: SystemHealthInput): SystemHealth {
  const { expectedDepots, closedDepots, cashVarianceCount, missedOpens } = input;

  // RED: Critical failures
  // - Cash variance detected (integrity violation)
  // - Not all depots closed (operational failure)
  if (cashVarianceCount > 0 || closedDepots < expectedDepots) {
    return "RED";
  }

  // AMBER: Warnings
  // - Missed opens (operational delay)
  if (missedOpens > 0) {
    return "AMBER";
  }

  // GREEN: All clean
  return "GREEN";
}

/**
 * Helper: Get health severity description
 */
export function getHealthDescription(health: SystemHealth): string {
  switch (health) {
    case "GREEN":
      return "OPERATIONAL";
    case "AMBER":
      return "WARNINGS PRESENT";
    case "RED":
      return "CRITICAL ISSUES";
  }
}

/**
 * Helper: Get health severity for styling
 */
export function getHealthSeverity(health: SystemHealth): "success" | "warning" | "critical" {
  switch (health) {
    case "GREEN":
      return "success";
    case "AMBER":
      return "warning";
    case "RED":
      return "critical";
  }
}
