"use client";
import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DepotDayEvent } from './types';
import { createClient } from '../lib/supabase';

/**
 * Executive Dashboard v1.1
 * Daily-first. Monthly context. Zero bloat.
 */

function convertSupabaseData(supabaseData: any[]): DepotDayEvent[] {
  return supabaseData.map(row => ({
    depot_id: row.depot_id,
    business_date: row.business_date,
    opening_cash_cfa: row.opening_cash_cfa || 0,
    closing_cash_physical: row.closing_cash_cfa || 0,
    cash_sales_cfa: row.cash_sales_total_cfa || 0,
    mobile_sales_cfa: row.mobile_sales_total_cfa || 0,
    restock_cash_used: 0,
    restock_skus: [],
    operator_open: row.operator_open,
    operator_close: row.operator_close,
    variance_note: row.cash_variance_cfa ? `Variance: ${row.cash_variance_cfa} CFA` : undefined,
    opening_inventory: [],
    closing_inventory: []
  }));
}

export default function AdminPage() {
  const [data, setData] = useState<DepotDayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showExceptions, setShowExceptions] = useState(false);
  const supabase = createClient();

  const rowsPerPage = 25;

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: supabaseData, error: supabaseError } = await supabase
          .from("depot_day_state")
          .select("*")
          .order("business_date", { ascending: false });

        if (supabaseError) {
          setError(supabaseError.message);
        } else {
          const convertedData = convertSupabaseData(supabaseData || []);
          setData(convertedData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [supabase]);

  // SECTION 1: TODAY - depot status snapshot
  const todayData = useMemo(() => {
    if (!data.length) return [];
    const latestDate = data[0].business_date;
    return data.filter(d => d.business_date === latestDate);
  }, [data]);

  const todayDateFormatted = useMemo(() => {
    if (!todayData.length) return '';
    const date = new Date(todayData[0].business_date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [todayData]);

  // SECTION 2: TODAY TOTALS
  const todayTotals = useMemo(() => {
    const totalSales = todayData.reduce((sum, d) => sum + d.cash_sales_cfa + d.mobile_sales_cfa, 0);
    const cashSales = todayData.reduce((sum, d) => sum + d.cash_sales_cfa, 0);
    const mobileSales = todayData.reduce((sum, d) => sum + d.mobile_sales_cfa, 0);
    const totalVariance = todayData.reduce((sum, d) => {
      const expected = d.opening_cash_cfa + d.cash_sales_cfa - d.restock_cash_used;
      return sum + (d.operator_close ? d.closing_cash_physical - expected : 0);
    }, 0);
    return { totalSales, cashSales, mobileSales, totalVariance };
  }, [todayData]);

  // SECTION 3: THIS MONTH metrics
  const thisMonthMetrics = useMemo(() => {
    if (!data.length) return { totalSales: 0, avgDailySales: 0, activeDays: 0, avgCashVariancePct: 0 };

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthData = data.filter(d => new Date(d.business_date) >= firstDayOfMonth);

    const totalSales = monthData.reduce((sum, d) => sum + d.cash_sales_cfa + d.mobile_sales_cfa, 0);
    const uniqueDates = new Set(monthData.map(d => d.business_date));
    const activeDays = uniqueDates.size;
    const avgDailySales = activeDays > 0 ? totalSales / activeDays : 0;

    const varianceData = monthData.filter(d => d.operator_close);
    const totalVariance = varianceData.reduce((sum, d) => {
      const expected = d.opening_cash_cfa + d.cash_sales_cfa - d.restock_cash_used;
      const variance = d.closing_cash_physical - expected;
      return sum + Math.abs(variance);
    }, 0);
    const totalExpected = varianceData.reduce((sum, d) =>
      sum + d.opening_cash_cfa + d.cash_sales_cfa - d.restock_cash_used, 0);
    const avgCashVariancePct = totalExpected > 0 ? (totalVariance / totalExpected) * 100 : 0;

    return { totalSales, avgDailySales, activeDays, avgCashVariancePct };
  }, [data]);

  // SECTION 4: Previous month comparison
  const previousMonthSales = useMemo(() => {
    if (!data.length) return null;

    const now = new Date();
    const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const lastMonthData = data.filter(d => {
      const date = new Date(d.business_date);
      return date >= firstDayOfLastMonth && date <= lastDayOfLastMonth;
    });

    if (lastMonthData.length === 0) return null;

    const totalSales = lastMonthData.reduce((sum, d) => sum + d.cash_sales_cfa + d.mobile_sales_cfa, 0);
    return totalSales;
  }, [data]);

  const monthOverMonthChange = useMemo(() => {
    if (previousMonthSales === null || previousMonthSales === 0) return null;
    const change = ((thisMonthMetrics.totalSales - previousMonthSales) / previousMonthSales) * 100;
    return change;
  }, [thisMonthMetrics.totalSales, previousMonthSales]);

  // SECTION 5: 30-day sales trend
  const last30DaysChart = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentData = data.filter(d => new Date(d.business_date) >= thirtyDaysAgo);

    const dailyTotals: Record<string, number> = {};
    recentData.forEach(d => {
      const sales = d.cash_sales_cfa + d.mobile_sales_cfa;
      dailyTotals[d.business_date] = (dailyTotals[d.business_date] || 0) + sales;
    });

    const chartData = Object.keys(dailyTotals)
      .sort()
      .map(date => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sales: dailyTotals[date]
      }));

    return chartData;
  }, [data]);

  // SECTION 6: Daily records table (paginated)
  const allDailyRecords = useMemo(() => {
    const dailyTotals: Record<string, { date: string; sales: number; variance: number; depotCount: number }> = {};

    data.forEach(d => {
      const sales = d.cash_sales_cfa + d.mobile_sales_cfa;
      const expected = d.opening_cash_cfa + d.cash_sales_cfa - d.restock_cash_used;
      const variance = d.operator_close ? d.closing_cash_physical - expected : 0;

      if (!dailyTotals[d.business_date]) {
        dailyTotals[d.business_date] = { date: d.business_date, sales: 0, variance: 0, depotCount: 0 };
      }
      dailyTotals[d.business_date].sales += sales;
      dailyTotals[d.business_date].variance += variance;
      dailyTotals[d.business_date].depotCount++;
    });

    return Object.values(dailyTotals).sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);

  const totalPages = Math.ceil(allDailyRecords.length / rowsPerPage);
  const pagedRecords = allDailyRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // SECTION 7: Exceptions
  const exceptions = useMemo(() => {
    const issues: { type: string; message: string; severity: 'high' | 'medium' }[] = [];

    todayData.forEach(d => {
      const expected = d.opening_cash_cfa + d.cash_sales_cfa - d.restock_cash_used;
      const variance = d.operator_close ? d.closing_cash_physical - expected : 0;
      const variancePct = expected > 0 ? Math.abs(variance / expected) * 100 : 0;

      if (variancePct > 5) {
        issues.push({
          type: 'Cash Variance',
          message: `${d.depot_id} on ${d.business_date}: ${variance > 0 ? '+' : ''}${variance.toLocaleString()} CFA (${variancePct.toFixed(1)}%)`,
          severity: variancePct > 10 ? 'high' : 'medium'
        });
      }

      if (!d.operator_close && d.business_date !== data[0]?.business_date) {
        issues.push({
          type: 'Unclosed Day',
          message: `${d.depot_id} on ${d.business_date} not properly closed`,
          severity: 'medium'
        });
      }
    });

    return issues;
  }, [todayData, data]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-slate-400">Loading...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="max-w-md w-full bg-rose-50 border border-rose-200 rounded-2xl p-8">
        <h2 className="text-lg font-bold text-rose-900 mb-2">Connection Error</h2>
        <p className="text-sm text-rose-700 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-rose-600 text-white py-2 px-4 rounded-lg font-bold text-sm hover:bg-rose-700"
        >
          Retry
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">ELOWA Operations</h1>
          <p className="text-sm text-slate-500">Executive Dashboard</p>
        </div>

        {/* SECTION 1: TODAY - Depot Status Snapshot */}
        <section className="mb-12">
          <h2 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">
            TODAY — {todayDateFormatted}
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
            {todayData.length === 0 ? (
              <p className="text-sm text-slate-500">No data for today</p>
            ) : (
              todayData.map((depot, idx) => {
                const sales = depot.cash_sales_cfa + depot.mobile_sales_cfa;
                const expected = depot.opening_cash_cfa + depot.cash_sales_cfa - depot.restock_cash_used;
                const variance = depot.operator_close ? depot.closing_cash_physical - expected : 0;
                const status = depot.operator_close ? 'CLOSED' : 'OPEN';

                return (
                  <div key={idx} className="flex items-center gap-4 py-2 border-b border-slate-100 last:border-0">
                    <span className="w-4 h-4 rounded-full border-2 border-slate-300" style={{ backgroundColor: status === 'CLOSED' ? '#10b981' : 'transparent' }}></span>
                    <span className="font-bold text-slate-900 w-32">{depot.depot_id}</span>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {status}
                    </span>
                    {status === 'CLOSED' ? (
                      <>
                        <span className="text-sm text-slate-600">Sales: <strong>{sales.toLocaleString()} CFA</strong></span>
                        <span className={`text-sm font-bold ${variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          Δ {variance >= 0 ? '+' : ''}{variance.toLocaleString()}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* SECTION 2: TODAY TOTALS */}
        <section className="mb-12">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="grid grid-cols-4 gap-8">
              <div>
                <p className="text-xs text-slate-500 mb-1">Total Sales</p>
                <p className="text-2xl font-bold text-slate-900">{todayTotals.totalSales.toLocaleString()}</p>
                <p className="text-xs text-slate-400">CFA</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Cash</p>
                <p className="text-2xl font-bold text-slate-900">{todayTotals.cashSales.toLocaleString()}</p>
                <p className="text-xs text-slate-400">CFA</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Mobile</p>
                <p className="text-2xl font-bold text-slate-900">{todayTotals.mobileSales.toLocaleString()}</p>
                <p className="text-xs text-slate-400">CFA</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Cash Variance</p>
                <p className={`text-2xl font-bold ${todayTotals.totalVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {todayTotals.totalVariance >= 0 ? '+' : ''}{todayTotals.totalVariance.toLocaleString()}
                </p>
                <p className="text-xs text-slate-400">CFA</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: THIS MONTH AT A GLANCE */}
        <section className="mb-12">
          <h2 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">
            THIS MONTH AT A GLANCE
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="grid grid-cols-4 gap-8">
              <div>
                <p className="text-xs text-slate-500 mb-1">Total Sales</p>
                <p className="text-xl font-bold text-slate-900">{thisMonthMetrics.totalSales.toLocaleString()}</p>
                <p className="text-xs text-slate-400">CFA</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Avg Daily Sales</p>
                <p className="text-xl font-bold text-slate-900">{Math.round(thisMonthMetrics.avgDailySales).toLocaleString()}</p>
                <p className="text-xs text-slate-400">CFA</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Active Days</p>
                <p className="text-xl font-bold text-slate-900">{thisMonthMetrics.activeDays}</p>
                <p className="text-xs text-slate-400">days</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Avg Cash Variance %</p>
                <p className="text-xl font-bold text-slate-900">{thisMonthMetrics.avgCashVariancePct.toFixed(1)}%</p>
                <p className="text-xs text-slate-400">of expected</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: Month-over-month context */}
        {monthOverMonthChange !== null && (
          <section className="mb-12">
            <div className="bg-slate-100 rounded-xl p-4">
              <p className="text-xs text-slate-600">
                vs last month: <span className={`font-bold ${monthOverMonthChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {monthOverMonthChange >= 0 ? '+' : ''}{monthOverMonthChange.toFixed(1)}%
                </span>
              </p>
            </div>
          </section>
        )}

        {/* SECTION 5: 30-Day Sales Trend */}
        <section className="mb-12">
          <h2 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">
            30-DAY SALES TREND
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={last30DaysChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: '600' }}
                  formatter={(v: number | undefined) => [(v || 0).toLocaleString() + ' CFA', 'Sales']}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#salesGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* SECTION 6: Daily Records Table */}
        <section className="mb-12">
          <h2 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">
            DAILY RECORDS
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-600">Date</th>
                  <th className="text-right px-6 py-3 text-xs font-bold text-slate-600">Sales (CFA)</th>
                  <th className="text-right px-6 py-3 text-xs font-bold text-slate-600">Variance (CFA)</th>
                  <th className="text-right px-6 py-3 text-xs font-bold text-slate-600">Depots</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((record, idx) => (
                  <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-6 py-3 text-sm text-slate-900">{new Date(record.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-6 py-3 text-sm text-right font-bold text-slate-900">{record.sales.toLocaleString()}</td>
                    <td className={`px-6 py-3 text-sm text-right font-bold ${record.variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {record.variance >= 0 ? '+' : ''}{record.variance.toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-slate-600">{record.depotCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-slate-50 px-6 py-3 flex justify-between items-center border-t border-slate-200">
                <p className="text-xs text-slate-600">
                  Showing {((currentPage - 1) * rowsPerPage) + 1}-{Math.min(currentPage * rowsPerPage, allDailyRecords.length)} of {allDailyRecords.length}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 7: Exceptions (collapsed by default) */}
        {exceptions.length > 0 && (
          <section className="mb-12">
            <button
              onClick={() => setShowExceptions(!showExceptions)}
              className="w-full text-left bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between items-center hover:bg-amber-100"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h2 className="text-sm font-bold text-amber-900 uppercase tracking-wide">EXCEPTIONS</h2>
                  <p className="text-xs text-amber-700">{exceptions.length} issue{exceptions.length !== 1 ? 's' : ''} detected</p>
                </div>
              </div>
              <svg className={`w-5 h-5 text-amber-600 transition-transform ${showExceptions ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showExceptions && (
              <div className="mt-4 bg-white rounded-xl border border-amber-200 p-6 space-y-3">
                {exceptions.map((exc, idx) => (
                  <div key={idx} className={`p-4 rounded-lg border ${exc.severity === 'high' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
                    <p className={`text-xs font-bold mb-1 ${exc.severity === 'high' ? 'text-rose-900' : 'text-amber-900'}`}>{exc.type}</p>
                    <p className={`text-sm ${exc.severity === 'high' ? 'text-rose-700' : 'text-amber-700'}`}>{exc.message}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
