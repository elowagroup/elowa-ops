/**
 * PERFORMANCE VIEW
 *
 * Question: "Is the business growing?"
 *
 * Pattern recognition, not daily noise.
 * Executives scan shapes, not rows.
 */

"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MetricCard } from '../components/MetricCard';
import type { SalesMomentum } from '../signals';

interface PerformanceViewProps extends SalesMomentum {}

export function PerformanceView({
  rolling7DayAvg,
  volatilityIndex,
  growthVsPriorWeek,
  trend,
  chartData
}: PerformanceViewProps) {
  const getTrendSeverity = () => {
    if (trend === "UP") return "GREEN";
    if (trend === "DOWN") return "RED";
    return "NEUTRAL";
  };

  const getVolatilitySeverity = () => {
    if (volatilityIndex > 20) return "RED";
    if (volatilityIndex > 10) return "AMBER";
    return "GREEN";
  };

  const formatChartDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xs font-bold tracking-wider text-slate-400">
          SALES MOMENTUM
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          7-day rolling analysis • Pattern recognition
        </p>
      </div>

      {/* Core Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="7-DAY AVG"
          value={`${rolling7DayAvg.toLocaleString()} CFA`}
          severity="NEUTRAL"
          subtitle="Rolling average"
        />
        <MetricCard
          title="VOLATILITY INDEX"
          value={`${volatilityIndex}%`}
          severity={getVolatilitySeverity()}
          subtitle={volatilityIndex > 20 ? "High variance" : volatilityIndex > 10 ? "Moderate" : "Stable"}
        />
        <MetricCard
          title="GROWTH"
          value={`${growthVsPriorWeek >= 0 ? '+' : ''}${growthVsPriorWeek}%`}
          severity={getTrendSeverity()}
          subtitle="vs prior week"
        />
      </div>

      {/* Trend Indicator */}
      <div className={`rounded-xl border p-6 ${
        trend === "UP"
          ? "bg-emerald-950 border-emerald-800"
          : trend === "DOWN"
          ? "bg-rose-950 border-rose-800"
          : "bg-slate-900 border-slate-800"
      }`}>
        <div className="flex items-center gap-4">
          <div className={`text-5xl ${
            trend === "UP"
              ? "text-emerald-400"
              : trend === "DOWN"
              ? "text-rose-400"
              : "text-slate-400"
          }`}>
            {trend === "UP" && "↗"}
            {trend === "DOWN" && "↘"}
            {trend === "FLAT" && "→"}
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">TREND</p>
            <p className={`text-2xl font-bold ${
              trend === "UP"
                ? "text-emerald-400"
                : trend === "DOWN"
                ? "text-rose-400"
                : "text-slate-400"
            }`}>
              {trend === "UP" && "GROWING"}
              {trend === "DOWN" && "DECLINING"}
              {trend === "FLAT" && "STABLE"}
            </p>
          </div>
        </div>
      </div>

      {/* Momentum Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-xs font-bold tracking-wider text-slate-400 mb-4">
          SALES MOMENTUM CHART
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={formatChartDate}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #334155',
                backgroundColor: '#0f172a',
                fontSize: '12px',
                fontWeight: '600'
              }}
              formatter={(v: number | undefined) => [(v || 0).toLocaleString() + ' CFA', '']}
              labelFormatter={formatChartDate}
            />
            {/* Daily sales (thin line) */}
            <Line
              type="monotone"
              dataKey="sales"
              stroke="#475569"
              strokeWidth={1}
              dot={false}
              name="Daily"
            />
            {/* Rolling average (bold line) */}
            <Line
              type="monotone"
              dataKey="rollingAvg"
              stroke="#10b981"
              strokeWidth={3}
              dot={false}
              name="7-Day Avg"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Philosophy Note */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-xs text-slate-400">
          <span className="font-bold text-white">
            This is pattern recognition, not daily noise.
          </span>{' '}
          Rolling averages smooth volatility. Trend indicators replace meaningless
          "best/worst day" metrics. The chart shows shapes, not rows.
        </p>
      </div>
    </div>
  );
}
