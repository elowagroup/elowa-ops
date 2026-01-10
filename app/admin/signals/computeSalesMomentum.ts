/**
 * Sales Momentum Signal
 *
 * Philosophy:
 * - Pattern recognition, not daily noise
 * - Replaces best/worst day cards with actionable metrics
 * - Executives scan shapes, not rows
 *
 * Kills:
 * - ❌ Best day / worst day
 * - ❌ Daily sales tables
 * - ❌ Raw sales lists
 */

export interface DailySalesInput {
  date: string;
  sales: number;
}

export interface SalesMomentum {
  rolling7DayAvg: number;
  volatilityIndex: number;  // std_dev / avg (%)
  growthVsPriorWeek: number; // % change
  trend: "UP" | "DOWN" | "FLAT";
  chartData: {
    date: string;
    sales: number;
    rollingAvg: number;
  }[];
}

export function computeSalesMomentum(dailySales: DailySalesInput[]): SalesMomentum {
  // Sort by date ascending
  const sorted = [...dailySales].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    return {
      rolling7DayAvg: 0,
      volatilityIndex: 0,
      growthVsPriorWeek: 0,
      trend: "FLAT",
      chartData: [],
    };
  }

  // Calculate 7-day rolling average for each point
  const chartData = sorted.map((item, index) => {
    const window = sorted.slice(Math.max(0, index - 6), index + 1);
    const windowAvg = window.reduce((sum, d) => sum + d.sales, 0) / window.length;

    return {
      date: item.date,
      sales: item.sales,
      rollingAvg: windowAvg,
    };
  });

  // Latest 7-day rolling average
  const last7Days = sorted.slice(-7);
  const rolling7DayAvg = last7Days.reduce((sum, d) => sum + d.sales, 0) / last7Days.length;

  // Volatility index (last 7 days)
  const avgSales = rolling7DayAvg;
  const variance = last7Days.reduce((sum, d) => {
    const diff = d.sales - avgSales;
    return sum + (diff * diff);
  }, 0) / last7Days.length;
  const stdDev = Math.sqrt(variance);
  const volatilityIndex = avgSales > 0 ? (stdDev / avgSales) * 100 : 0;

  // Growth vs prior week
  const last14Days = sorted.slice(-14);
  const priorWeekSales = last14Days.slice(0, 7);
  const currentWeekSales = last14Days.slice(7, 14);

  const priorWeekAvg = priorWeekSales.length > 0
    ? priorWeekSales.reduce((sum, d) => sum + d.sales, 0) / priorWeekSales.length
    : 0;
  const currentWeekAvg = currentWeekSales.length > 0
    ? currentWeekSales.reduce((sum, d) => sum + d.sales, 0) / currentWeekSales.length
    : 0;

  const growthVsPriorWeek = priorWeekAvg > 0
    ? ((currentWeekAvg - priorWeekAvg) / priorWeekAvg) * 100
    : 0;

  // Trend determination
  let trend: "UP" | "DOWN" | "FLAT";
  if (growthVsPriorWeek > 5) {
    trend = "UP";
  } else if (growthVsPriorWeek < -5) {
    trend = "DOWN";
  } else {
    trend = "FLAT";
  }

  return {
    rolling7DayAvg: Math.round(rolling7DayAvg),
    volatilityIndex: Math.round(volatilityIndex * 10) / 10,
    growthVsPriorWeek: Math.round(growthVsPriorWeek * 10) / 10,
    trend,
    chartData,
  };
}

/**
 * Helper: Get trend description
 */
export function getTrendDescription(trend: "UP" | "DOWN" | "FLAT"): string {
  switch (trend) {
    case "UP":
      return "GROWING";
    case "DOWN":
      return "DECLINING";
    case "FLAT":
      return "STABLE";
  }
}

/**
 * Helper: Get trend severity for styling
 */
export function getTrendSeverity(trend: "UP" | "DOWN" | "FLAT"): "success" | "warning" | "neutral" {
  switch (trend) {
    case "UP":
      return "success";
    case "DOWN":
      return "warning";
    case "FLAT":
      return "neutral";
  }
}

/**
 * Helper: Is volatility high?
 */
export function isHighVolatility(volatilityIndex: number): boolean {
  return volatilityIndex > 20; // > 20% volatility is high
}
