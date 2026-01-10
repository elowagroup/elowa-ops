/**
 * Inventory Signals
 *
 * Philosophy:
 * - Executives don't care that oil went 9→20
 * - They care that oil dominates cash flow
 *
 * Output:
 * - Top 5 SKUs only
 * - Ranked by cash impact
 * - Surprise index (deviation from normal)
 *
 * Kills:
 * - ❌ Raw restock counts
 * - ❌ "Changes captured" metric
 * - ❌ Full SKU lists
 */

export interface SKUInput {
  sku: string;
  skuLabel: string;
  unitsDelta: number;              // Absolute change (close - open)
  avgVelocity: number;             // Historical units per day
  estimatedUnitPrice: number;      // CFA per unit
}

export interface InventorySignal {
  sku: string;
  skuLabel: string;
  unitsDelta: number;
  cashImpact: number;              // Estimated revenue impact (CFA)
  velocityVsAvg: number;           // Percentage deviation from average
  surpriseIndex: number;           // Anomaly score (0-1+)
}

export function computeInventorySignals(skus: SKUInput[]): InventorySignal[] {
  const signals = skus.map(sku => {
    // Cash impact = absolute delta × unit price
    const cashImpact = Math.abs(sku.unitsDelta) * sku.estimatedUnitPrice;

    // Velocity deviation (% difference from average)
    const velocityVsAvg = sku.avgVelocity > 0
      ? ((Math.abs(sku.unitsDelta) - sku.avgVelocity) / sku.avgVelocity) * 100
      : 0;

    // Surprise index = how unexpected this movement is
    // Values > 0.5 indicate significant anomalies
    const surpriseIndex = sku.avgVelocity > 0
      ? Math.abs(Math.abs(sku.unitsDelta) - sku.avgVelocity) / sku.avgVelocity
      : 0;

    return {
      sku: sku.sku,
      skuLabel: sku.skuLabel,
      unitsDelta: sku.unitsDelta,
      cashImpact,
      velocityVsAvg,
      surpriseIndex,
    };
  });

  // Sort by cash impact descending, take top 5
  return signals
    .sort((a, b) => b.cashImpact - a.cashImpact)
    .slice(0, 5);
}

/**
 * Cash Dominance
 * What % of total cash flow is this SKU?
 */
export function calculateCashDominance(
  skuCashImpact: number,
  totalCashFlow: number
): number {
  return totalCashFlow > 0 ? (skuCashImpact / totalCashFlow) * 100 : 0;
}

/**
 * Helper: Is this SKU an anomaly?
 */
export function isAnomaly(surpriseIndex: number): boolean {
  return surpriseIndex > 0.5; // 50% deviation from normal
}

/**
 * Helper: Get surprise severity
 */
export function getSurpriseSeverity(surpriseIndex: number): "high" | "medium" | "low" {
  if (surpriseIndex > 1.0) return "high";
  if (surpriseIndex > 0.5) return "medium";
  return "low";
}
